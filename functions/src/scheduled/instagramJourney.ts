import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { defineSecret } from 'firebase-functions/params';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { buildRecapCaption } from '../instagram/caption';
import {
  isPermanentApiError,
  publishImagePost,
  refreshLongLivedToken,
  type InstagramCredentials,
} from '../instagram/client';
import { buildDayPost, previousJstDay } from '../instagram/recap';

/**
 * Daily /journey_days -> Instagram recap for the walk's public account.
 *
 * One post per run at most, about a day that has already finished, assembled
 * from the same Firestore data the journey website renders (ADR-012). Each run:
 *
 *   1. refreshes the long-lived access token when it is getting old,
 *   2. walks back over the last RECAP_WINDOW_DAYS days, oldest first,
 *   3. picks the first day that has a published track, has photos, and has not
 *      been posted or permanently rejected before,
 *   4. builds the bilingual caption and publishes the day's visit photos as a
 *      single image or a carousel,
 *   5. records the outcome under journey_sync/instagram/posts/{date}.
 *
 * WHY YESTERDAY, NEVER TODAY: an Instagram post is a location broadcast. The
 * whole reason /journey_days trims ~500 m around every start and stop is that
 * a public feed should not say where Petr sleeps, and a live post would hand
 * back exactly what the trimming removes: him, there, now. The delay is the
 * feature. For the same reason nothing here sends a location tag, and the
 * Instagram Login auth path cannot send one even by mistake (client.ts).
 *
 * The window is what makes this self-healing. A day whose track had not been
 * published by 09:00, or whose run hit a network error, is simply picked up by
 * a later morning; there is no retry queue and no manual trigger to remember.
 *
 * Secrets (Secret Manager, one-time setup in docs/instagram.md):
 * INSTAGRAM_USER_ID, INSTAGRAM_ACCESS_TOKEN. The token rotates on refresh, so
 * the live one is kept in the private journey_sync/instagram document (no
 * Firestore rule matches it, so no client can read it) and the secret is only
 * ever the seed for the first run.
 */

const INSTAGRAM_USER_ID = defineSecret('INSTAGRAM_USER_ID');
const INSTAGRAM_ACCESS_TOKEN = defineSecret('INSTAGRAM_ACCESS_TOKEN');

/** The private token/state document. Mirrors journey_sync/strava. */
const STATE_PATH = 'journey_sync/instagram';
/** Per-day outcome log, one document per JST day, keyed by the day. */
const POSTS_PATH = 'journey_sync/instagram/posts';

/**
 * How many days back a run will consider. Covers a stretch of days published
 * late from the road, without ever reaching so far back that a post appears
 * about a week nobody remembers.
 */
const RECAP_WINDOW_DAYS = 5;

/**
 * Refresh the token once it is this old. Instagram refuses to refresh a token
 * younger than 24 hours and cannot refresh one past its 60-day life at all, so
 * the safe band is wide and this sits in the middle of it: comfortably past the
 * floor, with weeks of failed runs still leaving room to recover.
 */
const TOKEN_REFRESH_AFTER_DAYS = 7;

type PostStatus = 'published' | 'rejected';

export const instagramJourney = onSchedule(
  {
    // 09:00 JST. Late enough that yesterday's track is published from the
    // phone over breakfast, early enough to land before the day's walking.
    schedule: '0 9 * * *',
    timeZone: 'Asia/Tokyo',
    secrets: [INSTAGRAM_USER_ID, INSTAGRAM_ACCESS_TOKEN],
    timeoutSeconds: 540,
  },
  async () => {
    const db = getFirestore();
    const credentials: InstagramCredentials = {
      igUserId: INSTAGRAM_USER_ID.value(),
      accessToken: await currentAccessToken(db),
    };

    for (const date of recapCandidates()) {
      const logged = await db.collection(POSTS_PATH).doc(date).get();
      if (logged.exists) continue; // published or permanently rejected; either way, done

      const post = await buildDayPost(date, db);
      if (!post) continue; // no track, or no photo: a later run may find both

      try {
        const published = await publishImagePost(
          credentials,
          post.photoUrls,
          buildRecapCaption(post.recap)
        );
        await recordOutcome(db, date, 'published', {
          mediaId: published.mediaId,
          permalink: published.permalink,
          photoCount: post.photoUrls.length,
        });
        logger.info(`instagram: posted ${date} as ${published.mediaId}`);
      } catch (error) {
        if (isPermanentApiError(error)) {
          // Instagram will refuse this same request every morning from now on.
          // Logging it as rejected stops the loop retrying it forever and,
          // more usefully, stops it blocking every later day behind it.
          await recordOutcome(db, date, 'rejected', { error: String(error) });
          logger.error(`instagram: ${date} permanently rejected`, error);
          continue;
        }
        // Transient: leave the day unlogged so tomorrow tries it again.
        logger.error(`instagram: ${date} failed, will retry`, error);
      }
      return; // one post per run, published or not: a feed is not a backlog dump
    }
    logger.info('instagram: nothing to post');
  }
);

/** The window's days, oldest first, so a backlog drains in the order it happened. */
function recapCandidates(now: number = Date.now()): string[] {
  const days: string[] = [];
  for (let back = RECAP_WINDOW_DAYS; back >= 1; back -= 1) {
    days.push(previousJstDay(now - (back - 1) * 86_400_000));
  }
  return days;
}

/**
 * The access token to use, refreshing it when it is old enough to be worth
 * rotating. Falls back to the Secret Manager seed on the very first run, when
 * the state document does not exist yet.
 */
async function currentAccessToken(db: Firestore): Promise<string> {
  const stateRef = db.doc(STATE_PATH);
  const state = await stateRef.get();
  const stored = state.exists ? (state.get('accessToken') as string | undefined) : undefined;
  const refreshedAt = state.exists ? (state.get('refreshedAt') as { toMillis(): number } | undefined) : undefined;
  const token = stored ?? INSTAGRAM_ACCESS_TOKEN.value();

  const ageDays = refreshedAt ? (Date.now() - refreshedAt.toMillis()) / 86_400_000 : Infinity;
  if (ageDays < TOKEN_REFRESH_AFTER_DAYS) return token;

  try {
    const refreshed = await refreshLongLivedToken(token);
    await stateRef.set(
      {
        accessToken: refreshed.accessToken,
        refreshedAt: FieldValue.serverTimestamp(),
        expiresInSeconds: refreshed.expiresInSeconds,
      },
      { merge: true }
    );
    return refreshed.accessToken;
  } catch (error) {
    // A refresh that fails is not fatal on its own: the current token is valid
    // for weeks yet, and today's post matters more than the rotation. It does
    // need to be loud, because the token is unrecoverable once it expires.
    logger.error('instagram: token refresh failed, using the existing token', error);
    return token;
  }
}

async function recordOutcome(
  db: Firestore,
  date: string,
  status: PostStatus,
  details: Record<string, unknown>
): Promise<void> {
  await db
    .collection(POSTS_PATH)
    .doc(date)
    .set({ date, status, ...details, postedAt: FieldValue.serverTimestamp() });
}
