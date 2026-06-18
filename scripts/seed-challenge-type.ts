/**
 * One-off seed script: creates the four Kyushu-88 challenge types in Firestore.
 *
 * One document per transport difficulty (all share the same eligible onsen pool
 * and completion count of 88):
 *   challenge_types/kyushu-88           — car / any transport (app default)
 *   challenge_types/kyushu-88-public    — public transport
 *   challenge_types/kyushu-88-bicycle   — bicycle
 *   challenge_types/kyushu-88-walk      — walk only
 *
 * Tiers unlock by visit count (bronze 44 / silver 66 / gold 88). The
 * transport-restricted types additionally cap "shortcuts" — visits reaching an
 * onsen by a mode faster than the type's baseMode: bronze ≤ 8, silver ≤ 4,
 * gold 0. The car type has no faster mode, so its tiers are count-only.
 *
 * === Running ===
 *   NODE_PATH=functions/node_modules \
 *   GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account-key.json \
 *   npx ts-node --transpile-only --project functions/tsconfig.json scripts/seed-challenge-type.ts
 *
 * Idempotent: re-running overwrites the existing documents.
 */

import * as admin from 'firebase-admin';

type TransportMode = 'foot' | 'bicycle' | 'public' | 'car';

interface TierCondition {
  type: 'minVisits' | 'maxFasterVisits' | 'maxCalendarDays';
  value: number;
}

interface Tier {
  id: 'gold' | 'silver' | 'bronze';
  name: string;
  conditionSummary: string;
  conditions: TierCondition[];
}

interface ChallengeTypeSeed {
  id: string;
  name: string;
  description: string;
  baseMode: TransportMode;
  rules: string[];
  tiers: Tier[];
}

const TIER_ORDER = ['gold', 'silver', 'bronze'] as const; // best → worst
const TIER_NAMES: Record<Tier['id'], string> = { gold: '金', silver: '銀', bronze: '銅' };

// Visit-count thresholds — shared across all four types.
const COUNTS: Record<Tier['id'], number> = { gold: 88, silver: 66, bronze: 44 };
// Shortcut caps for the transport-restricted types (the car type has none).
const SHORTCUTS: Record<Tier['id'], number> = { gold: 0, silver: 4, bronze: 8 };

type Summaries = Record<Tier['id'], string>;

function restrictedTiers(summaries: Summaries): Tier[] {
  return TIER_ORDER.map((id) => ({
    id,
    name: TIER_NAMES[id],
    conditionSummary: summaries[id],
    conditions: [
      { type: 'minVisits', value: COUNTS[id] },
      { type: 'maxFasterVisits', value: SHORTCUTS[id] },
    ],
  }));
}

function countOnlyTiers(summaries: Summaries): Tier[] {
  return TIER_ORDER.map((id) => ({
    id,
    name: TIER_NAMES[id],
    conditionSummary: summaries[id],
    conditions: [{ type: 'minVisits', value: COUNTS[id] }],
  }));
}

const COMMON_RULES = [
  '対象温泉リスト（約155湯）の中から温泉を訪問します。',
  '同じ温泉は何度訪れても1湯としてカウントされます。',
  '達成までの期限はありません。',
];

const TYPES: ChallengeTypeSeed[] = [
  {
    id: 'kyushu-88',
    name: '車チャレンジ',
    description: '交通手段に制限なく、九州八十八湯を巡るチャレンジです。',
    baseMode: 'car',
    rules: [...COMMON_RULES, '交通手段に制限はありません。'],
    tiers: countOnlyTiers({
      gold: '88湯すべてを達成',
      silver: '66湯以上を達成',
      bronze: '44湯以上を達成',
    }),
  },
  {
    id: 'kyushu-88-public',
    name: '公共交通機関チャレンジ',
    description:
      '公共交通機関・自転車・徒歩で九州八十八湯を巡るチャレンジです。車の利用は称号に影響します。',
    baseMode: 'public',
    rules: [
      ...COMMON_RULES,
      '移動は公共交通機関・自転車・徒歩が基本です。車を使うと上位の称号を逃します。',
    ],
    tiers: restrictedTiers({
      gold: '88湯すべてを車を使わずに達成',
      silver: '66湯以上を達成し、車の利用は4回まで',
      bronze: '44湯以上を達成し、車の利用は8回まで',
    }),
  },
  {
    id: 'kyushu-88-bicycle',
    name: '自転車チャレンジ',
    description: '自転車（および徒歩）で九州八十八湯を巡るチャレンジです。',
    baseMode: 'bicycle',
    rules: [
      ...COMMON_RULES,
      '移動は自転車または徒歩が基本です。それより速い手段を使うと上位の称号を逃します。',
    ],
    tiers: restrictedTiers({
      gold: '88湯すべてを自転車・徒歩のみで達成',
      silver: '66湯以上を達成し、より速い手段は4回まで',
      bronze: '44湯以上を達成し、より速い手段は8回まで',
    }),
  },
  {
    id: 'kyushu-88-walk',
    name: '徒歩チャレンジ',
    description: '徒歩のみで九州八十八湯を巡る、最も過酷なチャレンジです。',
    baseMode: 'foot',
    rules: [
      ...COMMON_RULES,
      '移動は徒歩のみが基本です。それより速い手段を使うと上位の称号を逃します。',
    ],
    tiers: restrictedTiers({
      gold: '88湯すべてを徒歩のみで達成',
      silver: '66湯以上を達成し、徒歩以外の利用は4回まで',
      bronze: '44湯以上を達成し、徒歩以外の利用は8回まで',
    }),
  },
];

async function main(): Promise<void> {
  admin.initializeApp({ projectId: 'kyuhachi-fddcc' });
  const db = admin.firestore();

  // Read all active onsen IDs — the shared eligible pool for every type.
  const snapshot = await db
    .collection('onsens')
    .where('isActive', '==', true)
    .select() // metadata only — no field data needed
    .get();
  const eligibleOnsenIds = snapshot.docs.map((doc) => doc.id);
  console.log(`Found ${eligibleOnsenIds.length} active onsens`);

  const catalogMeta = await db.collection('catalog_meta').doc('current').get();
  const catalogVersion = catalogMeta.exists ? (catalogMeta.data()?.version ?? 1) : 1;

  const batch = db.batch();
  for (const type of TYPES) {
    const ref = db.collection('challenge_types').doc(type.id);
    batch.set(ref, {
      name: type.name,
      description: type.description,
      eligibleOnsenIds,
      completionCount: COUNTS.gold,
      baseMode: type.baseMode,
      tiers: type.tiers,
      rules: type.rules,
      isActive: true,
    });
  }
  await batch.commit();

  console.log('\n✓ Done');
  for (const type of TYPES) {
    console.log(`  challenge_types/${type.id} — ${type.name} (base: ${type.baseMode})`);
  }
  console.log(`  Eligible onsens: ${eligibleOnsenIds.length}`);
  console.log(`  Catalog version: ${catalogVersion}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
