/**
 * Developer-only mock-data generators.
 *
 * These write the signed-in user's OWN documents (challenges, visits, routes)
 * straight from the client — exactly what the real screens do, and exactly what
 * the Firestore rules already permit (`isOwner(userId)`). No admin Function and
 * no rules bypass is involved, so this stays in sync with production write paths
 * by construction.
 *
 * Reachable only when {@link DEV_TOOLS_ENABLED} is true; see `./flags`.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  writeBatch,
  serverTimestamp,
  type FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import type { ChallengeDocument, ChallengeTypeDocument, TransportMode } from '@kyuhachi/shared';
import {
  COLLECTIONS,
  SUBCOLLECTIONS,
  CATALOG_META_DOC_ID,
  TRANSPORT_MODES,
} from '@kyuhachi/shared';
import { db } from '@/firebase';
import type { ParsedRoute } from '@/lib/route-import';

/** Transport written to a mock visit. `'none'` = unreported; `'mixed'` = random per visit. */
export type MockTransport = 'none' | 'mixed' | TransportMode;

export interface CreateMockChallengeOptions {
  uid: string;
  typeId: string;
  type: ChallengeTypeDocument;
  /** How many eligible onsens to mark visited (clamped to the pool size). */
  visitedCount: number;
  transport: MockTransport;
  /** Attach a synthetic imported route and point `activeRouteId` at it. */
  withRoute: boolean;
  /** Make this the active (default) challenge, demoting any current default. */
  makeActive: boolean;
  /** Optional custom name; defaults to `Mock <type name>`. */
  name?: string;
}

// Center of the default Kyushu map region (mirrors KYUSHU_CENTER in dev-location.ts).
const KYUSHU_CENTER = { lat: 32.8, lng: 130.7 };

/** Fisher–Yates shuffle of a copy, then take the first `n`. */
function pickN(ids: string[], n: number): string[] {
  const copy = [...ids];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.max(0, Math.min(n, copy.length)));
}

function resolveTransport(transport: MockTransport): TransportMode | null {
  if (transport === 'none') return null;
  if (transport === 'mixed') {
    return TRANSPORT_MODES[Math.floor(Math.random() * TRANSPORT_MODES.length)];
  }
  return transport;
}

/** A visit doc matching what the real "mark visited" flow writes (see onsens/[id].tsx). */
function buildMockVisit(transport: MockTransport) {
  return {
    visitedAt: serverTimestamp(),
    notes: null,
    photoUrl: null,
    structuredData: {
      rating: null,
      waterTemp: null,
      duration: null,
      transportMode: resolveTransport(transport),
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

/** A synthetic GPS track around central Kyushu, shaped like a real imported route. */
function buildMockRoute(): ParsedRoute {
  const count = 60;
  const points: { lat: number; lng: number }[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    points.push({
      lat: KYUSHU_CENTER.lat + Math.sin(t * Math.PI * 2) * 0.15 + t * 0.1,
      lng: KYUSHU_CENTER.lng + t * 0.4 - 0.2,
    });
  }
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  return {
    name: 'Mock Route',
    sourceFormat: 'gpx',
    points,
    pointCount: points.length,
    bounds: {
      minLat: Math.min(...lats),
      minLng: Math.min(...lngs),
      maxLat: Math.max(...lats),
      maxLng: Math.max(...lngs),
    },
    distanceMeters: null,
  };
}

async function resolveCatalogVersion(): Promise<number> {
  const snap = await getDoc(doc(db, COLLECTIONS.CATALOG_META, CATALOG_META_DOC_ID));
  return snap.exists() ? ((snap.data()?.version as number) ?? 1) : 1;
}

/**
 * Create a fully-populated mock challenge: the challenge doc, `visitedCount`
 * visit docs drawn from its eligible pool, and an optional synthetic route.
 * Returns the new challenge id.
 *
 * Mirrors challenge/preview.tsx's create flow (frozen `snapshotEligibleOnsenIds`,
 * catalog version, single-default invariant). One difference: when the pool is
 * filled we set `completedAt` directly instead of waiting for the onVisitCreated
 * Function, so the completed state is reachable even without the Functions
 * emulator running. The trigger re-setting the same field is idempotent.
 */
export async function createMockChallenge(opts: CreateMockChallengeOptions): Promise<string> {
  const { uid, typeId, type, transport, withRoute, makeActive } = opts;
  const eligible = type.eligibleOnsenIds ?? [];
  const visitedCount = Math.max(0, Math.min(opts.visitedCount, eligible.length));

  const userRef = doc(db, COLLECTIONS.USERS, uid);
  const challengesCol = collection(userRef, SUBCOLLECTIONS.CHALLENGES);

  const catalogVersion = await resolveCatalogVersion();

  // Resolve the current default so we can demote it when making this active —
  // the single-isDefault invariant the rest of the app relies on. Skip a
  // dangling pointer (deleted challenge), which would fail the batch.
  let previousDefaultRef: FirebaseFirestoreTypes.DocumentReference | null = null;
  if (makeActive) {
    const userSnap = await getDoc(userRef);
    const prevId = (userSnap.data()?.defaultChallengeId as string | null | undefined) ?? null;
    if (prevId) {
      const ref = doc(challengesCol, prevId);
      if ((await getDoc(ref)).exists()) previousDefaultRef = ref;
    }
  }

  const batch = writeBatch(db);

  // Write the route first so the challenge can reference it.
  let activeRouteId: string | null = null;
  if (withRoute) {
    const routeRef = doc(collection(userRef, SUBCOLLECTIONS.ROUTES));
    batch.set(routeRef, {
      ...buildMockRoute(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    activeRouteId = routeRef.id;
  }

  const challengeRef = doc(challengesCol);
  const completed = visitedCount >= type.completionCount;
  batch.set(challengeRef, {
    typeId,
    name: opts.name?.trim() || `Mock ${type.name}`,
    startDate: serverTimestamp(),
    isDefault: makeActive,
    snapshotEligibleOnsenIds: eligible,
    snapshotCatalogVersion: catalogVersion,
    activeRouteId,
    earnedTier: null,
    earnedTierAt: null,
    completedAt: completed ? serverTimestamp() : null,
    createdAt: serverTimestamp(),
  });

  // Mark a random subset of eligible onsens visited. Pool is ~155, so even a
  // full 88 visits + challenge + route + 2 user/default writes stays well under
  // the 500-op batch ceiling.
  const visitsCol = collection(challengeRef, SUBCOLLECTIONS.VISITS);
  for (const onsenId of pickN(eligible, visitedCount)) {
    batch.set(doc(visitsCol, onsenId), buildMockVisit(transport));
  }

  if (previousDefaultRef) batch.update(previousDefaultRef, { isDefault: false });
  // set+merge (not update) so creation still works before onUserCreated lands.
  if (makeActive) batch.set(userRef, { defaultChallengeId: challengeRef.id }, { merge: true });

  await batch.commit();
  return challengeRef.id;
}

/**
 * Add up to `count` fresh eligible visits to the user's active challenge.
 * Returns null when there is no active challenge. Skips onsens already visited,
 * so it tops up rather than overwriting.
 */
export async function addVisitsToActiveChallenge(
  uid: string,
  count: number,
  transport: MockTransport
): Promise<{ added: number; total: number } | null> {
  const userRef = doc(db, COLLECTIONS.USERS, uid);
  const userSnap = await getDoc(userRef);
  const activeId = (userSnap.data()?.defaultChallengeId as string | null | undefined) ?? null;
  if (!activeId) return null;

  const challengeRef = doc(collection(userRef, SUBCOLLECTIONS.CHALLENGES), activeId);
  const challengeSnap = await getDoc(challengeRef);
  if (!challengeSnap.exists()) return null;

  const eligible =
    (challengeSnap.data() as ChallengeDocument | undefined)?.snapshotEligibleOnsenIds ?? [];
  const visitsCol = collection(challengeRef, SUBCOLLECTIONS.VISITS);
  const existing: FirebaseFirestoreTypes.QuerySnapshot = await getDocs(visitsCol);
  const have = new Set(existing.docs.map((d) => d.id));

  const fresh = pickN(eligible.filter((id) => !have.has(id)), count);
  if (fresh.length === 0) return { added: 0, total: have.size };

  const batch = writeBatch(db);
  for (const onsenId of fresh) batch.set(doc(visitsCol, onsenId), buildMockVisit(transport));
  await batch.commit();

  return { added: fresh.length, total: have.size + fresh.length };
}

/**
 * Delete EVERY challenge (and its visits) for the user, and clear the default
 * pointer. A blunt reset for getting back to a clean slate between tests.
 * Returns how many challenges were removed.
 */
export async function deleteAllChallenges(uid: string): Promise<number> {
  const userRef = doc(db, COLLECTIONS.USERS, uid);
  const challengesCol = collection(userRef, SUBCOLLECTIONS.CHALLENGES);
  const snap: FirebaseFirestoreTypes.QuerySnapshot = await getDocs(challengesCol);

  // One batch per challenge keeps each commit under the 500-op limit regardless
  // of how many challenges exist (a single challenge's visits cap at the pool).
  for (const c of snap.docs) {
    const visits: FirebaseFirestoreTypes.QuerySnapshot = await getDocs(
      collection(c.ref, SUBCOLLECTIONS.VISITS)
    );
    const batch = writeBatch(db);
    visits.docs.forEach((v) => batch.delete(v.ref));
    batch.delete(c.ref);
    await batch.commit();
  }

  const clear = writeBatch(db);
  clear.set(userRef, { defaultChallengeId: null }, { merge: true });
  await clear.commit();

  return snap.size;
}
