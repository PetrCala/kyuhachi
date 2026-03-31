/**
 * One-off seed script: creates the kyushu-88 challenge type in Firestore.
 *
 * Reads all active onsen document IDs to build the eligibleOnsenIds pool,
 * then writes /challenge_types/kyushu-88.
 *
 * === Running ===
 *   NODE_PATH=functions/node_modules \
 *   GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account-key.json \
 *   npx ts-node --transpile-only --project functions/tsconfig.json scripts/seed-challenge-type.ts
 *
 * Idempotent: re-running overwrites the existing document.
 */

import * as admin from 'firebase-admin';

async function main(): Promise<void> {
  admin.initializeApp({ projectId: 'kyuhachi-fddcc' });
  const db = admin.firestore();

  // Read all active onsen IDs
  const snapshot = await db
    .collection('onsens')
    .where('isActive', '==', true)
    .select() // metadata only — no field data needed
    .get();

  const eligibleOnsenIds = snapshot.docs.map((doc) => doc.id);
  console.log(`Found ${eligibleOnsenIds.length} active onsens`);

  // Read current catalog version
  const catalogMeta = await db.collection('catalog_meta').doc('current').get();
  const catalogVersion = catalogMeta.exists ? (catalogMeta.data()?.version ?? 1) : 1;

  // Write challenge type
  await db.collection('challenge_types').doc('kyushu-88').set({
    name: '九州八十八湯',
    description:
      '九州各地の名湯・秘湯を巡り、88箇所を訪問するチャレンジです。対象の温泉は約155箇所の中から自由に選べます。',
    eligibleOnsenIds,
    completionCount: 88,
    tiers: [], // thresholds TBD — will be populated before Phase 2 ships
    rules: [
      '対象温泉リストの中から88箇所以上を訪問してください。',
      '同じ温泉を複数回訪問しても1箇所としてカウントされます。',
      '訪問の記録はアプリ内で行ってください。',
    ],
    isActive: true,
  });

  console.log('\n✓ Done');
  console.log(`  Document: challenge_types/kyushu-88`);
  console.log(`  Eligible onsens: ${eligibleOnsenIds.length}`);
  console.log(`  Catalog version: ${catalogVersion}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
