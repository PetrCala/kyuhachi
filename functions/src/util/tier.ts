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

export interface ChallengeEvaluation {
  /** Highest tier the challenge currently *qualifies* for, or null. */
  eligibleTier: string | null;
  /** Unique eligible-onsen visit count. */
  eligibleVisitCount: number;
  /** The type's completion target (default 88). */
  completionCount: number;
  /** The type's tiers, ordered best → worst (for ranking a claim). */
  tiers: TierLike[];
  /** The challenge document data (for reading the currently-claimed earnedTier). */
  challenge: DocumentData;
}

/**
 * Gather a challenge's progress and the tier it currently qualifies for. Shared
 * by the visit triggers (for completedAt) and the claimTier callable (to verify
 * a claim). Returns null when the challenge or its type is missing, or the
 * challenge has no eligible pool yet.
 */
export async function evaluateChallenge(
  db: Firestore,
  challengeRef: DocumentReference,
): Promise<ChallengeEvaluation | null> {
  const snap = await challengeRef.get();
  if (!snap.exists) return null; // challenge deleted (e.g. whole-challenge delete)
  const challenge = snap.data() as DocumentData;

  const eligible: string[] = challenge.snapshotEligibleOnsenIds ?? [];
  if (eligible.length === 0) return null;

  const typeSnap = await db.collection('challenge_types').doc(challenge.typeId).get();
  if (!typeSnap.exists) return null;
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

  const tiers: TierLike[] = type.tiers ?? [];
  const eligibleTier = computeEarnedTier(
    tiers,
    type.baseMode,
    eligibleDocs.length,
    transports,
    daysSinceStart,
  );

  return {
    eligibleTier,
    eligibleVisitCount: eligibleDocs.length,
    completionCount: type.completionCount ?? 88,
    tiers,
    challenge,
  };
}

/**
 * Set completedAt the first time the eligible visit count reaches the type's
 * completionCount. Called from both the create and delete visit triggers;
 * writing to the challenge doc does not re-trigger the visit functions.
 *
 * Tiers are deliberately NOT touched here: earnedTier is claim-controlled (only
 * the claimTier callable writes it), so visits never auto-earn or revoke a tier.
 */
export async function updateChallengeProgress(
  db: Firestore,
  challengeRef: DocumentReference,
): Promise<void> {
  const evaluation = await evaluateChallenge(db, challengeRef);
  if (!evaluation) return;

  const { eligibleVisitCount, completionCount, challenge } = evaluation;
  if (challenge.completedAt == null && eligibleVisitCount >= completionCount) {
    await challengeRef.update({ completedAt: FieldValue.serverTimestamp() });
  }
}
