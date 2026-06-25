/**
 * One-off Firestore seed script: publishes the onsen catalog from _archive/onsens.json
 * to Firestore project kyuhachi-fddcc.
 *
 * === Obtaining the service account key ===
 * 1. Open Firebase console:
 *    https://console.firebase.google.com/project/kyuhachi-fddcc/settings/serviceaccounts/adminsdk
 * 2. Click "Generate new private key" → download the JSON file
 * 3. Store it outside the repository — never commit credentials
 *
 * === Running ===
 *   NODE_PATH=functions/node_modules \
 *   GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account-key.json \
 *   npx ts-node --transpile-only --project functions/tsconfig.json scripts/seed-firestore.ts
 *
 * --transpile-only skips type-checking so ts-node doesn't complain about the
 * functions/tsconfig.json rootDir pointing at functions/src rather than scripts/.
 * NODE_PATH makes firebase-admin resolvable from functions/node_modules.
 *
 * Idempotent: re-running overwrites existing onsen documents and catalog_meta/current
 * with fresh data (createdAt will update on re-run — that is acceptable for an initial
 * seed; a real publish script would preserve createdAt).
 *
 * The companion file scripts/onsen-id-map.json is the canonical upstream-id → kyuhachiId
 * mapping. Commit it and treat it as read-only after initial publish.
 */

import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

// ─── Source types ─────────────────────────────────────────────────────────────

interface SourceOnsen {
  id: string;
  onsenchi: string; // area name  → areaName
  shisetsu: string; // facility name → name
  address: string;
  lat: number;
  lng: number;
}

// Write payload — uses FieldValue for server-side timestamps
interface OnsenWritePayload {
  name: string;
  areaName: string;
  address: string;
  prefecture: string;
  lat: number;
  lng: number;
  phone: null;
  businessHours: null;
  admissionFee: null;
  adultFee: null;
  springQuality: null;
  websiteUrl: null;
  imageUrl: null;
  blurhash: null;
  isActive: boolean;
  catalogVersion: number;
  createdAt: admin.firestore.FieldValue;
  updatedAt: admin.firestore.FieldValue;
}

// ─── Prefecture extraction ────────────────────────────────────────────────────

/**
 * Cities and counties that appear in the seed dataset without a prefecture prefix
 * in the address string. Maps the first token of the address to its prefecture.
 *
 * Covers all 148 onsens in _archive/onsens.json as of the initial seed.
 * When new onsens are added via the data repo, extend this table there.
 */
const CITY_TO_PREFECTURE: Record<string, string> = {
  // 福岡県
  '福岡市': '福岡県',
  '久留米市': '福岡県',
  '筑紫野市': '福岡県',
  '大川市': '福岡県',
  '朝倉市': '福岡県',
  'うきは市': '福岡県',
  '筑後市': '福岡県',
  '宗像市': '福岡県',
  '遠賀郡': '福岡県',
  // 佐賀県
  '佐賀市': '佐賀県',
  '武雄市': '佐賀県',
  '嬉野市': '佐賀県',
  '鳥栖市': '佐賀県',
  '富士町': '佐賀県', // former Fuji-machi, now part of 佐賀市
  // 長崎県
  '平戸市': '長崎県',
  '雲仙市': '長崎県',
  '壱岐市': '長崎県',
  '大村市': '長崎県',
  '島原市': '長崎県',
  '東彼杵郡': '長崎県',
  // 大分県
  '別府市': '大分県',
  '由布市': '大分県',
  '竹田市': '大分県',
  '日田市': '大分県',
  '豊後高田市': '大分県',
  '玖珠郡': '大分県',
  '速見郡': '大分県',
  '杵築市': '大分県',
  '大分市': '大分県',
  // 熊本県
  '山鹿市': '熊本県',
  '菊池市': '熊本県',
  '阿蘇郡': '熊本県',
  '阿蘇市': '熊本県',
  '人吉市': '熊本県',
  '葦北郡': '熊本県',
  '上天草市': '熊本県',
  '水俣市': '熊本県',
  '熊本市': '熊本県',
  '玉名郡': '熊本県',
  // 宮崎県
  '都城市': '宮崎県',
  '日南市': '宮崎県',
  'えびの市': '宮崎県',
  '西諸県郡': '宮崎県',
  '西都市': '宮崎県',
  '東臼杵郡': '宮崎県',
  '宮崎市': '宮崎県',
  '小林市': '宮崎県',
  // 鹿児島県
  '霧島市': '鹿児島県',
  '鹿児島市': '鹿児島県',
  '指宿市': '鹿児島県',
  '薩摩川内市': '鹿児島県',
  '姶良郡': '鹿児島県',
  '姶良市': '鹿児島県',
  '垂水市': '鹿児島県',
  '日置市': '鹿児島県',
  '薩摩郡': '鹿児島県',
  '出水市': '鹿児島県',
  '西之表市': '鹿児島県', // 種子島
  '熊毛郡': '鹿児島県', // 屋久島
};

/**
 * Kyushu prefectures that may appear as a prefix in address strings.
 * Checked before the city/county lookup to handle addresses like
 * "大分県別府市..." (which must not be misread as "大分県別府" by a greedy regex).
 */
const KYUSHU_PREFECTURES = [
  '福岡県', '佐賀県', '長崎県', '大分県', '熊本県', '宮崎県', '鹿児島県',
] as const;

/**
 * Extract the prefecture from a Japanese address string.
 *
 * Strategy 1: address begins with a known prefecture name
 *   e.g. "大分県別府市..." → "大分県"
 *        "鹿児島県霧島市..." → "鹿児島県"
 *   (A greedy regex like /.{2,4}[都道府県]/ is unsafe here because address
 *    tokens such as "大分県別府" or "菊池市隈府" contain 府/県 mid-string.)
 *
 * Strategy 2: look up city or county (郡) at the start of the address
 *   e.g. "別府市元町16-23" → "大分県"
 *   Longer keys are checked first to prevent partial matches
 *   (e.g. 薩摩川内市 before 薩摩郡).
 *
 * Returns an empty string and logs a warning if neither strategy matches.
 * An empty prefecture is a data quality issue that must be fixed before publish.
 */
function extractPrefecture(address: string): string {
  // Strategy 1: known prefecture prefix
  for (const pref of KYUSHU_PREFECTURES) {
    if (address.startsWith(pref)) {
      return pref;
    }
  }

  // Strategy 2: city/county lookup (longer keys first)
  const sortedKeys = Object.keys(CITY_TO_PREFECTURE).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    if (address.startsWith(key)) {
      return CITY_TO_PREFECTURE[key];
    }
  }

  return '';
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  admin.initializeApp({ projectId: 'kyuhachi-fddcc' });
  const db = admin.firestore();

  // Load source data
  const sourcePath = path.join(__dirname, '..', '_archive', 'onsens.json');
  const sourceOnsens: SourceOnsen[] = JSON.parse(fs.readFileSync(sourcePath, 'utf-8'));
  console.log(`Loaded ${sourceOnsens.length} onsens from ${sourcePath}`);

  // Assign stable UUIDs and build write payloads
  const idMap: Record<string, string> = {};
  const writes: { kyuhachiId: string; payload: OnsenWritePayload }[] = [];
  const warnings: string[] = [];

  for (const src of sourceOnsens) {
    const kyuhachiId = randomUUID();
    idMap[src.id] = kyuhachiId;

    const address = src.address.trim();
    const prefecture = extractPrefecture(address);
    if (!prefecture) {
      warnings.push(`upstream id=${src.id} address="${address}" → prefecture unknown`);
    }

    const payload: OnsenWritePayload = {
      name: src.shisetsu.trim(),
      areaName: src.onsenchi.trim(),
      address,
      prefecture,
      lat: src.lat,
      lng: src.lng,
      phone: null,
      businessHours: null,
      admissionFee: null,
      adultFee: null,
      springQuality: null,
      websiteUrl: null,
      imageUrl: null,
      blurhash: null,
      isActive: true,
      catalogVersion: 1,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    writes.push({ kyuhachiId, payload });
  }

  if (warnings.length > 0) {
    console.warn('\n⚠ Prefecture extraction failed for the following onsens:');
    warnings.forEach(w => console.warn('  ', w));
    console.warn('Fix the CITY_TO_PREFECTURE table before publishing to production.\n');
  }

  // Write onsen documents in batches (Firestore limit: 500 ops per batch)
  console.log('Writing onsen documents to Firestore...');
  const BATCH_SIZE = 400;
  let batchCount = 0;

  for (let i = 0; i < writes.length; i += BATCH_SIZE) {
    const chunk = writes.slice(i, i + BATCH_SIZE);
    const batch = db.batch();

    for (const { kyuhachiId, payload } of chunk) {
      batch.set(db.collection('onsens').doc(kyuhachiId), payload);
    }

    await batch.commit();
    batchCount++;
    console.log(`  Batch ${batchCount}: committed ${chunk.length} docs`);
  }

  // Write catalog_meta/current
  const activeCount = writes.length; // all onsens are active on initial publish
  await db.collection('catalog_meta').doc('current').set({
    version: 1,
    publishedAt: admin.firestore.FieldValue.serverTimestamp(),
    totalCount: writes.length,
    activeCount,
  });
  console.log('Wrote catalog_meta/current');

  // Write onsen-id-map.json alongside this script
  // Sort by upstream id (numeric) for a stable, human-readable file
  const sortedIdMap: Record<string, string> = {};
  for (const upstreamId of Object.keys(idMap).sort((a, b) => Number(a) - Number(b))) {
    sortedIdMap[upstreamId] = idMap[upstreamId];
  }
  const mapPath = path.join(__dirname, 'onsen-id-map.json');
  fs.writeFileSync(mapPath, JSON.stringify(sortedIdMap, null, 2) + '\n', 'utf-8');
  console.log(`Wrote ${mapPath}`);

  console.log('\n✓ Done');
  console.log(`  Onsens written : ${writes.length}`);
  console.log(`  Active         : ${activeCount}`);
  console.log(`  ID map         : scripts/onsen-id-map.json`);
  if (warnings.length > 0) {
    console.log(`  ⚠ Prefecture warnings: ${warnings.length} — see above`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
