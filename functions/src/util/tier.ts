import {
  FieldValue,
  type DocumentData,
  type DocumentReference,
  type Firestore,
} from 'firebase-admin/firestore';

// Slowest → fastest. A visit reaching an onsen by a mode later in this list than
// the challenge's baseMode is a "shortcut".
const TRANSPORT_ORDER = ['foot', 'bicycle', 'public', 'car'];

function isFasterThan(mode: string | null, base: string): boolean {
  return mode != null && TRANSPORT_ORDER.indexOf(mode) > TRANSPORT_ORDER.indexOf(base);
}

interface Condition {
  type?: string;
  value?: number;
}

interface TierLike {
  id?: string;
  conditions?: Condition[];
}

/**
 * The highest tier (tiers are ordered best → worst) whose conditions are all
 * met. Mirrors the rule the client used to compute inline — kept here because
 * Functions is a separate package from the app and `@kyuhachi/shared`.
 */
export function computeEarnedTier(
  tiers: TierLike[],
  baseMode: string | undefined,
  eligibleVisits: number,
  transports: (string | null)[],
  daysSinceStart: number,
): string | null {
  const shortcuts = baseMode
    ? transports.filter((mode) => isFasterThan(mode, baseMode)).length
    : 0;
  const tier = tiers.find((t) =>
    (t.conditions ?? []).every((c) => {
      if (c.type === 'minVisits') return eligibleVisits >= (c.value ?? 0);
      if (c.type === 'maxFasterVisits') return shortcuts <= (c.value ?? 0);
      if (c.type === 'maxCalendarDays') return daysSinceStart <= (c.value ?? 0);
      return false;
    }),
  );
  return tier?.id ?? null;
}

/**
 * Recompute a challenge's earnedTier (and set completedAt the first time the
 * eligible visit count reaches the type's completionCount), writing only when
 * something changed. Called from both the create and delete visit triggers;
 * writing to the challenge doc does not re-trigger the visit functions.
 */
export async function updateChallengeProgress(
  db: Firestore,
  challengeRef: DocumentReference,
): Promise<void> {
  const snap = await challengeRef.get();
  if (!snap.exists) return; // challenge deleted (e.g. whole-challenge delete) — nothing to do
  const challenge = snap.data() as DocumentData;

  const eligible: string[] = challenge.snapshotEligibleOnsenIds ?? [];
  if (eligible.length === 0) return;

  const typeSnap = await db.collection('challenge_types').doc(challenge.typeId).get();
  if (!typeSnap.exists) return;
  const type = typeSnap.data() as DocumentData;

  const eligibleSet = new Set(eligible);
  const visitsSnap = await challengeRef.collection('visits').get();
  const eligibleDocs = visitsSnap.docs.filter((d) => eligibleSet.has(d.id));
  const transports = eligibleDocs.map(
    (d) => (d.data().structuredData?.transportMode ?? null) as string | null,
  );
  const daysSinceStart = challenge.startDate
    ? Math.floor((Date.now() - challenge.startDate.toDate().getTime()) / 86_400_000)
    : 0;

  const earnedTier = computeEarnedTier(
    type.tiers ?? [],
    type.baseMode,
    eligibleDocs.length,
    transports,
    daysSinceStart,
  );

  const update: DocumentData = {};
  if (earnedTier !== (challenge.earnedTier ?? null)) {
    update.earnedTier = earnedTier;
  }
  const completionCount: number = type.completionCount ?? 88;
  if (challenge.completedAt == null && eligibleDocs.length >= completionCount) {
    update.completedAt = FieldValue.serverTimestamp();
  }
  if (Object.keys(update).length > 0) {
    await challengeRef.update(update);
  }
}
