/**
 * Creates (or refreshes) the App Review demo account and seeds it with enough
 * data that the app is not empty on first launch.
 *
 * Kyuhachi has no anonymous mode: an App Review reviewer hits the sign-in screen
 * immediately and needs working email/password credentials in the App Review
 * notes. This script is the repeatable way to produce that account, so the same
 * state can be recreated for every submission instead of being hand-built once
 * and then drifting.
 *
 * What it does, idempotently:
 *   1. creates the Firebase Auth user (or resets its password if it exists),
 *   2. deletes every challenge / visit / route / favorite it already had,
 *   3. writes one active challenge with `DEMO_VISITS` visits, spread across
 *      prefectures so the map, progress ring and rank all show something,
 *   4. favorites a few of those onsens.
 *
 * === Credentials ===
 * Never committed. Pass them in the environment; the real values live in the
 * App Review notes field in App Store Connect (and in the maintainer's password
 * manager). See docs/app-store-submission.md.
 *
 * === Running ===
 *   DEMO_EMAIL='review@example.com' \
 *   DEMO_PASSWORD='<generated>' \
 *   GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account-key.json \
 *   npm run seed:demo
 *
 * The service account key is the same one the other seed scripts use:
 * https://console.firebase.google.com/project/kyuhachi-fddcc/settings/serviceaccounts/adminsdk
 * Store it outside the repository.
 *
 * Optional env:
 *   DEMO_DISPLAY_NAME   defaults to "App Review"
 *   DEMO_VISITS         how many onsens to mark visited, defaults to 12
 *   DEMO_CHALLENGE_TYPE challenge_types doc id, defaults to "kyushu-88"
 *
 * Visits carry no photos: uploading to Storage from a script would need real
 * image assets, and an empty photo strip is not what makes the app look empty.
 */

import * as admin from 'firebase-admin';
import {
  COLLECTIONS,
  SUBCOLLECTIONS,
  CATALOG_META_DOC_ID,
  EMPTY_VISIT_STRUCTURED_DATA,
  type CatalogMetaDocument,
  type ChallengeTypeDocument,
  type OnsenDocument,
  type VisitStructuredData,
} from '../shared/src';

const PROJECT_ID = 'kyuhachi-fddcc';

/** How many of the seeded onsens also get favorited. */
const FAVORITE_COUNT = 3;

/** Visits are dated backwards from today, this many days apart. */
const DAYS_BETWEEN_VISITS = 7;

interface DemoConfig {
  email: string;
  password: string;
  displayName: string;
  visitCount: number;
  challengeTypeId: string;
}

function readConfig(): DemoConfig {
  const email = process.env.DEMO_EMAIL?.trim();
  const password = process.env.DEMO_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'DEMO_EMAIL and DEMO_PASSWORD must be set. Never hardcode them: the real ' +
        'values belong in the App Review notes in App Store Connect.'
    );
  }
  if (password.length < 8) {
    throw new Error('DEMO_PASSWORD must be at least 8 characters (Firebase Auth minimum is 6).');
  }

  const visitsRaw = process.env.DEMO_VISITS;
  const visitCount = visitsRaw ? Number.parseInt(visitsRaw, 10) : 12;
  if (!Number.isFinite(visitCount) || visitCount < 1) {
    throw new Error(`DEMO_VISITS must be a positive integer, got "${visitsRaw}".`);
  }

  return {
    email,
    password,
    displayName: process.env.DEMO_DISPLAY_NAME?.trim() || 'App Review',
    visitCount,
    challengeTypeId: process.env.DEMO_CHALLENGE_TYPE?.trim() || 'kyushu-88',
  };
}

/**
 * Creates the auth user, or resets the password of the existing one so a stale
 * account from a previous submission keeps working. Returns its uid.
 */
async function ensureAuthUser(config: DemoConfig): Promise<{ uid: string; created: boolean }> {
  const auth = admin.auth();
  try {
    const existing = await auth.getUserByEmail(config.email);
    await auth.updateUser(existing.uid, {
      password: config.password,
      displayName: config.displayName,
      emailVerified: true,
    });
    return { uid: existing.uid, created: false };
  } catch (error) {
    if ((error as { code?: string }).code !== 'auth/user-not-found') throw error;
    const created = await auth.createUser({
      email: config.email,
      password: config.password,
      displayName: config.displayName,
      emailVerified: true,
    });
    return { uid: created.uid, created: true };
  }
}

/**
 * The onUserCreated Auth trigger writes /users/{uid} with defaultChallengeId:
 * null. It runs asynchronously, so seeding straight after createUser would race
 * it and lose the pointer we are about to set. Wait for the document to land
 * first; if the trigger is not deployed (or is slow), fall back to writing it.
 */
async function waitForUserDocument(
  db: admin.firestore.Firestore,
  uid: string,
  config: DemoConfig,
  timeoutMs = 30_000
): Promise<void> {
  const ref = db.collection(COLLECTIONS.USERS).doc(uid);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await ref.get()).exists) return;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  console.warn('onUserCreated did not write /users/%s within 30s; writing it directly.', uid);
  await ref.set({
    displayName: config.displayName,
    email: config.email,
    defaultChallengeId: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/** Removes everything the previous run seeded, so re-running is a clean reset. */
async function clearUserData(db: admin.firestore.Firestore, uid: string): Promise<void> {
  const userRef = db.collection(COLLECTIONS.USERS).doc(uid);

  const challenges = await userRef.collection(SUBCOLLECTIONS.CHALLENGES).get();
  for (const challenge of challenges.docs) {
    const visits = await challenge.ref.collection(SUBCOLLECTIONS.VISITS).get();
    // One batch per challenge stays under the 500-op ceiling regardless of how
    // many challenges exist (a single challenge's visits cap at the pool size).
    const batch = db.batch();
    visits.docs.forEach((visit) => batch.delete(visit.ref));
    batch.delete(challenge.ref);
    await batch.commit();
  }

  for (const sub of [SUBCOLLECTIONS.ROUTES, SUBCOLLECTIONS.FAVORITES]) {
    const snapshot = await userRef.collection(sub).get();
    if (snapshot.empty) continue;
    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }

  console.log(`Cleared ${challenges.size} existing challenge(s) and their visits.`);
}

/**
 * Picks `count` onsen ids from the eligible pool, round-robin across
 * prefectures, so the seeded visits are spread over Kyushu rather than clustered
 * in one area. Deterministic: the same catalog always yields the same selection.
 */
function pickSpreadOnsens(
  onsens: { id: string; prefecture: string }[],
  count: number
): string[] {
  const byPrefecture = new Map<string, string[]>();
  for (const onsen of [...onsens].sort((a, b) => a.id.localeCompare(b.id))) {
    const bucket = byPrefecture.get(onsen.prefecture);
    if (bucket) bucket.push(onsen.id);
    else byPrefecture.set(onsen.prefecture, [onsen.id]);
  }

  const buckets = [...byPrefecture.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, ids]) => ids);

  const picked: string[] = [];
  for (let round = 0; picked.length < count; round++) {
    const before = picked.length;
    for (const bucket of buckets) {
      if (picked.length >= count) break;
      if (round < bucket.length) picked.push(bucket[round]);
    }
    if (picked.length === before) break; // pool exhausted
  }
  return picked;
}

async function main(): Promise<void> {
  const config = readConfig();

  admin.initializeApp({ projectId: PROJECT_ID });
  const db = admin.firestore();

  const { uid, created } = await ensureAuthUser(config);
  console.log(`${created ? 'Created' : 'Reused'} auth user ${config.email} (${uid}).`);

  if (created) await waitForUserDocument(db, uid, config);
  await clearUserData(db, uid);

  const typeSnapshot = await db
    .collection(COLLECTIONS.CHALLENGE_TYPES)
    .doc(config.challengeTypeId)
    .get();
  if (!typeSnapshot.exists) {
    throw new Error(
      `challenge_types/${config.challengeTypeId} does not exist. Run scripts/seed-challenge-type.ts first.`
    );
  }
  const challengeType = typeSnapshot.data() as ChallengeTypeDocument;
  const eligible = new Set(challengeType.eligibleOnsenIds ?? []);
  if (eligible.size === 0) {
    throw new Error(`challenge_types/${config.challengeTypeId} has an empty eligible pool.`);
  }

  // Prefecture comes from the catalog, so the spread reflects the real data.
  const onsenSnapshot = await db
    .collection(COLLECTIONS.ONSENS)
    .where('isActive', '==', true)
    .select('prefecture')
    .get();
  const candidates = onsenSnapshot.docs
    .filter((doc) => eligible.has(doc.id))
    // .select() returns only the projected field, hence the Pick.
    .map((doc) => ({
      id: doc.id,
      prefecture: (doc.data() as Pick<OnsenDocument, 'prefecture'>).prefecture,
    }));

  const visitedIds = pickSpreadOnsens(candidates, config.visitCount);
  if (visitedIds.length < config.visitCount) {
    console.warn(
      `Only ${visitedIds.length} eligible onsens available; seeding that many instead of ${config.visitCount}.`
    );
  }

  const catalogMeta = await db
    .collection(COLLECTIONS.CATALOG_META)
    .doc(CATALOG_META_DOC_ID)
    .get();
  const catalogVersion = catalogMeta.exists
    ? ((catalogMeta.data() as CatalogMetaDocument).version ?? 1)
    : 1;

  const userRef = db.collection(COLLECTIONS.USERS).doc(uid);
  const challengeRef = userRef.collection(SUBCOLLECTIONS.CHALLENGES).doc();
  const now = admin.firestore.FieldValue.serverTimestamp();

  const batch = db.batch();
  batch.set(challengeRef, {
    typeId: config.challengeTypeId,
    name: challengeType.name,
    startDate: admin.firestore.Timestamp.fromDate(
      new Date(Date.now() - visitedIds.length * DAYS_BETWEEN_VISITS * 86_400_000)
    ),
    isDefault: true,
    snapshotEligibleOnsenIds: challengeType.eligibleOnsenIds,
    snapshotCatalogVersion: catalogVersion,
    activeRouteId: null,
    earnedTier: null,
    earnedTierAt: null,
    completedAt: null,
    createdAt: now,
  });

  // Oldest visit first, most recent last, one week apart.
  visitedIds.forEach((onsenId, index) => {
    const daysAgo = (visitedIds.length - 1 - index) * DAYS_BETWEEN_VISITS;
    const visitedAt = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() - daysAgo * 86_400_000)
    );
    const structuredData: VisitStructuredData = {
      ...EMPTY_VISIT_STRUCTURED_DATA,
      rating: 7 + (index % 4),
      transportMode: 'car',
      wouldReturn: true,
    };
    batch.set(challengeRef.collection(SUBCOLLECTIONS.VISITS).doc(onsenId), {
      visitedAt,
      notes: null,
      photoUrls: [],
      structuredData,
      createdAt: visitedAt,
      updatedAt: visitedAt,
    });
  });

  for (const onsenId of visitedIds.slice(0, FAVORITE_COUNT)) {
    batch.set(userRef.collection(SUBCOLLECTIONS.FAVORITES).doc(onsenId), { createdAt: now });
  }

  batch.set(userRef, { defaultChallengeId: challengeRef.id }, { merge: true });
  await batch.commit();

  console.log(
    `Seeded challenge ${challengeRef.id} ("${challengeType.name}") with ${visitedIds.length} visits ` +
      `and ${Math.min(FAVORITE_COUNT, visitedIds.length)} favorites.`
  );
  console.log('Done. Put the credentials in App Store Connect > App Review Information.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
