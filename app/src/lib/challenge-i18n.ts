/**
 * Localize challenge-type display text.
 *
 * Challenge types are admin-managed Firestore documents published by the data
 * repo. Their structured fields (conditions, eligible pool, completion count,
 * base mode) are data; their human-facing copy (name / description / rules /
 * tier names + summaries) is authored product text owned by the app and keyed
 * by the type id in the i18n catalog (see `app/src/i18n/en.ts`).
 *
 * These helpers overlay the catalog text onto a fetched document, keyed by id,
 * and fall back to whatever Firestore published when a key is missing — so a
 * new/unknown type id still renders its (Japanese) Firestore text instead of a
 * raw key until the app ships strings for it. Structured fields pass through
 * untouched; only display strings are swapped.
 *
 * The type id is therefore a contract shared with the data repo: adding a
 * challenge type there requires adding its strings here.
 */
import type { TFunction } from 'i18next';
import type { ChallengeTypeDocument, Tier } from '@kyuhachi/shared';

/** The shared rules every challenge type opens with (seeded as the first entries of `rules`). */
const COMMON_RULE_KEYS = [
  'challengeType.commonRule1',
  'challengeType.commonRule2',
  'challengeType.commonRule3',
] as const;

/** Localized challenge-type name for `typeId`, falling back to the Firestore value. */
export function challengeTypeName(typeId: string, fallback: string, t: TFunction): string {
  return t(`challengeType.${typeId}.name`, { defaultValue: fallback });
}

/** Localize a tier's name (by tier id) and condition summary (by type + tier id). */
export function localizeTier(typeId: string, tier: Tier, t: TFunction): Tier {
  return {
    ...tier,
    name: t(`challengeTier.${tier.id}`, { defaultValue: tier.name }),
    conditionSummary: t(`challengeType.${typeId}.summary.${tier.id}`, {
      defaultValue: tier.conditionSummary,
    }),
  };
}

/** Overlay catalog text onto a challenge-type document, keyed by `typeId`. */
export function localizeChallengeType(
  typeId: string,
  doc: ChallengeTypeDocument,
  t: TFunction
): ChallengeTypeDocument {
  return {
    ...doc,
    name: challengeTypeName(typeId, doc.name, t),
    description: t(`challengeType.${typeId}.description`, { defaultValue: doc.description }),
    rules: localizeRules(typeId, doc.rules, t),
    tiers: doc.tiers.map((tier) => localizeTier(typeId, tier, t)),
  };
}

/**
 * Seeded `rules` are `[commonRule1, commonRule2, commonRule3, <type-specific>]`.
 * Localize the leading common rules by position and the trailing type-specific
 * rule by id; fall back to the Firestore string per item so an unexpected shape
 * still renders its original text.
 */
function localizeRules(typeId: string, rules: string[], t: TFunction): string[] {
  return rules.map((rule, index) => {
    if (index < COMMON_RULE_KEYS.length) {
      return t(COMMON_RULE_KEYS[index], { defaultValue: rule });
    }
    return t(`challengeType.${typeId}.rule`, { defaultValue: rule });
  });
}
