/**
 * Assemble one day's Instagram recap out of the data the journey website
 * already publishes: the walked track in /journey_days, the visits under the
 * journey user's default challenge, and the onsen catalog.
 *
 * Nothing here is Instagram-specific beyond the photo checks; the caption
 * wording lives in caption.ts and the API calls in client.ts. The split is so
 * that "what did this day consist of" can be tested and eyeballed without a
 * token.
 *
 * PRIVACY: this reads only what is already world-readable via the journey
 * rules (ADR-009). It never touches /users/{uid} itself (that document holds
 * the email address), and it never reads or posts an onsen's catalog photo,
 * only Petr's own visit photos: the catalog licence from 九州観光機構 is granted
 * on per-photo credit plus a link back to the source page, which an Instagram
 * carousel cannot honour. See docs/storage-image-exposure.md.
 */

import { getFirestore, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { dayNumber, type DayRecap, type RecapOnsen } from './caption';
import { IG_CAROUSEL_MAX_ITEMS } from './client';
import { effectiveEligibleSet } from '../util/tier';

/**
 * The one uid whose journey is published. Canonical copy:
 * shared/src/types/journey.ts (JOURNEY_UID); duplicated here for the same
 * reason the callables duplicate it, Functions being a separate package from
 * `@kyuhachi/shared`. Keep all copies in sync.
 */
const JOURNEY_UID = 'juEfBPJSspS9E2dqMzRac07C1Gs1';

/** JST is UTC+9 year-round, with no daylight saving, so an offset is exact. */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export interface DayPost {
  recap: DayRecap;
  /** Publishable photo URLs in visit order, already capped to a carousel. */
  photoUrls: string[];
}

/** The JST calendar day a Firestore timestamp falls on, as YYYY-MM-DD. */
export function jstDay(millis: number): string {
  return new Date(millis + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Yesterday in JST, the day a morning run posts about. */
export function previousJstDay(now: number = Date.now()): string {
  return jstDay(now - 86_400_000);
}

/**
 * Everything a post for `date` needs, or null when the day should not be
 * posted at all: no track published yet, or no photo to carry it.
 *
 * A photoless day returning null rather than a text-only post is a platform
 * limit, not a choice: Instagram has no text post, every feed post is media.
 * Rendering a map or stats card server-side would fill the gap and is the
 * obvious next step; until then a day with no photo is simply skipped, and
 * docs/instagram.md says so.
 */
export async function buildDayPost(date: string, db: Firestore = getFirestore()): Promise<DayPost | null> {
  const daySnap = await db.collection('journey_days').doc(date).get();
  if (!daySnap.exists) {
    logger.info(`instagram: no journey_days/${date} yet, nothing to post`);
    return null;
  }
  const distanceMeters = (daySnap.get('distanceMeters') as number | undefined) ?? 0;

  const challengeSnap = await db
    .collection('users')
    .doc(JOURNEY_UID)
    .collection('challenges')
    .where('isDefault', '==', true)
    .limit(1)
    .get();
  if (challengeSnap.empty) {
    logger.warn('instagram: the journey user has no default challenge');
    return null;
  }
  const challengeRef = challengeSnap.docs[0].ref;
  const challenge = challengeSnap.docs[0].data();

  const typeSnap = await db.collection('challenge_types').doc(challenge.typeId).get();
  const target = (typeSnap.get('completionCount') as number | undefined) ?? 88;
  const eligible = effectiveEligibleSet(
    (challenge.snapshotEligibleOnsenIds as string[] | undefined) ?? [],
    typeSnap.get('eligibleOnsenIds') as string[] | undefined
  );

  // Every visit, oldest first. The ordinal a caption prints ("onsen 18 of 88")
  // is a position in this ordered list, so it has to be computed over the whole
  // challenge and not just the day: a day cannot know it is the eighteenth.
  const visitsSnap = await challengeRef.collection('visits').orderBy('visitedAt').get();

  let ordinal = 0;
  let visitedCount = 0;
  const dayVisits: { onsenId: string; ordinal: number; data: DocumentData }[] = [];
  for (const visit of visitsSnap.docs) {
    const visitedAt = visit.get('visitedAt') as { toMillis(): number } | undefined;
    if (!visitedAt) continue;
    const visitDay = jstDay(visitedAt.toMillis());
    if (visitDay > date) break; // ordered by visitedAt: nothing later is relevant
    const isEligible = eligible.has(visit.id);
    if (isEligible) {
      ordinal += 1;
      visitedCount += 1;
    }
    if (visitDay === date) {
      dayVisits.push({ onsenId: visit.id, ordinal: isEligible ? ordinal : 0, data: visit.data() });
    }
  }

  const onsens = await loadRecapOnsens(db, dayVisits);
  const photoUrls = await publishablePhotos(dayVisits.flatMap((v) => (v.data.photoUrls as string[] | undefined) ?? []));
  if (photoUrls.length === 0) {
    logger.info(`instagram: ${date} has no publishable photo, skipping`);
    return null;
  }

  return {
    recap: {
      date,
      dayNumber: dayNumber(date),
      distanceMeters,
      cumulativeDistanceMeters: await cumulativeDistance(db, date),
      onsens,
      visitedCount,
      target,
      note: firstNote(dayVisits.map((v) => v.data.notes as string | null | undefined)),
    },
    photoUrls,
  };
}

/**
 * Total walked distance through `date` inclusive. Summed over the published
 * days rather than kept as a running counter: /journey_days is upserted and
 * occasionally corrected by a republish, and a counter would drift every time
 * that happened.
 */
async function cumulativeDistance(db: Firestore, date: string): Promise<number> {
  const snap = await db
    .collection('journey_days')
    .where('date', '<=', date)
    .select('distanceMeters')
    .get();
  return snap.docs.reduce((total, doc) => total + ((doc.get('distanceMeters') as number) ?? 0), 0);
}

/** The catalog rows behind a day's visits, in visit order, skipping any that are missing. */
async function loadRecapOnsens(
  db: Firestore,
  dayVisits: { onsenId: string; ordinal: number }[]
): Promise<RecapOnsen[]> {
  const eligibleVisits = dayVisits.filter((visit) => visit.ordinal > 0);
  if (eligibleVisits.length === 0) return [];

  const refs = eligibleVisits.map((visit) => db.collection('onsens').doc(visit.onsenId));
  const docs = await db.getAll(...refs);

  const onsens: RecapOnsen[] = [];
  docs.forEach((doc, index) => {
    if (!doc.exists) return;
    onsens.push({
      name: doc.get('name') as string,
      nameRomaji: (doc.get('nameRomaji') as string | null) ?? null,
      areaName: (doc.get('areaName') as string) ?? '',
      prefecture: (doc.get('prefecture') as string) ?? '',
      ordinal: eligibleVisits[index].ordinal,
    });
  });
  return onsens;
}

/**
 * The first non-empty visit note of the day, or null.
 *
 * One note, not all of them: the notes are written for Petr's own record, a
 * caption carrying three of them stops being a caption, and the site shows all
 * of them anyway for anyone who follows the link.
 */
function firstNote(notes: (string | null | undefined)[]): string | null {
  for (const note of notes) {
    const trimmed = note?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

/**
 * Keep the photo URLs Instagram can actually fetch, capped to one carousel.
 *
 * Instagram pulls each image from its own servers and accepts JPEG only, so a
 * PNG or HEIC screenshot in the day's visits fails container creation with an
 * error that names neither the file nor the reason. Checking the content type
 * here costs one HEAD per photo and turns that into a skipped image.
 */
async function publishablePhotos(urls: string[]): Promise<string[]> {
  const kept: string[] = [];
  for (const url of urls) {
    if (kept.length >= IG_CAROUSEL_MAX_ITEMS) break;
    try {
      const res = await fetch(url, { method: 'HEAD' });
      const type = res.headers.get('content-type') ?? '';
      if (res.ok && type.startsWith('image/jpeg')) {
        kept.push(url);
      } else {
        logger.info(`instagram: skipping photo (${res.status}, ${type || 'no content-type'})`);
      }
    } catch (error) {
      logger.warn('instagram: photo HEAD failed, skipping', error);
    }
  }
  return kept;
}
