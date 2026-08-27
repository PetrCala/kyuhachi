/**
 * Create and inspect the tip-jar in-app purchases in App Store Connect.
 *
 * The products themselves are defined here, once, and must stay in step with
 * TIP_PRODUCT_IDS in shared/src/types/support.ts. Why they look the way they
 * do: docs/adr/011-tip-jar.md. The manual half of the setup (agreements,
 * banking, submission) is in docs/tip-jar.md.
 *
 *   node scripts/asc/tip-products.mjs status
 *   node scripts/asc/tip-products.mjs setup
 *   node scripts/asc/tip-products.mjs screenshot <path-to-png>
 *
 * Every command is idempotent: `setup` skips what already exists, so it is
 * safe to re-run after a failure partway through.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { asc, APP_ID } from './asc.mjs';

// Apple's limits: reference name 64 chars, localization name 30, description 45.
const REVIEW_NOTE =
  'Optional tip. It unlocks no features, content, or functionality: the app ' +
  'behaves identically whether or not a tip is ever given, and no part of the ' +
  'app is gated. Consumable so it can be given more than once; there is ' +
  'nothing to restore. To see it: Menu > Support Kyuhachi.';

const TIPS = [
  {
    productId: 'com.kyuhachi.app.tip.bath',
    name: 'Tip: bath',
    yen: 300,
    locales: {
      'en-US': {
        name: 'Buy me a bath',
        description: "One bath's worth of thanks. Unlocks nothing.",
      },
      ja: { name: '一湯ぶんの心付け', description: '温泉一回ぶんのお礼です。機能は変わりません。' },
    },
  },
  {
    productId: 'com.kyuhachi.app.tip.towel',
    name: 'Tip: towel',
    yen: 800,
    locales: {
      'en-US': { name: 'A bath and a towel', description: 'Bath-and-towel thanks. Unlocks nothing.' },
      ja: { name: '湯とタオルぶん', description: '入浴とタオルぶんのお礼です。機能は変わりません。' },
    },
  },
  {
    productId: 'com.kyuhachi.app.tip.stay',
    name: 'Tip: stay',
    yen: 2000,
    locales: {
      'en-US': { name: "A night's stay", description: "A night's worth of thanks. Unlocks nothing." },
      ja: { name: '一泊ぶん', description: '素泊まり一泊ぶんのお礼です。機能は変わりません。' },
    },
  },
];

async function productsById() {
  const page = await asc('GET', `/v1/apps/${APP_ID}/inAppPurchasesV2?limit=200`);
  return new Map(page.data.map((p) => [p.attributes.productId, p]));
}

/** GET that treats a 404 as "not created yet" rather than an error. */
async function optional(path) {
  try {
    return await asc('GET', path);
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

async function create(tip, existing) {
  if (existing.has(tip.productId)) {
    console.log('product exists:', tip.productId);
    return existing.get(tip.productId).id;
  }
  const created = await asc('POST', '/v2/inAppPurchases', {
    data: {
      type: 'inAppPurchases',
      attributes: {
        name: tip.name,
        productId: tip.productId,
        inAppPurchaseType: 'CONSUMABLE',
        reviewNote: REVIEW_NOTE,
        familySharable: false,
      },
      relationships: { app: { data: { type: 'apps', id: APP_ID } } },
    },
  });
  console.log('product created:', tip.productId);
  return created.data.id;
}

async function localize(tip, id) {
  const current = await asc('GET', `/v2/inAppPurchases/${id}/inAppPurchaseLocalizations?limit=50`);
  const have = new Set(current.data.map((l) => l.attributes.locale));
  for (const [locale, copy] of Object.entries(tip.locales)) {
    if (have.has(locale)) continue;
    await asc('POST', '/v1/inAppPurchaseLocalizations', {
      data: {
        type: 'inAppPurchaseLocalizations',
        attributes: { locale, name: copy.name, description: copy.description },
        relationships: { inAppPurchaseV2: { data: { type: 'inAppPurchases', id } } },
      },
    });
    console.log('  localized:', locale, '=>', copy.name);
  }
}

async function setAvailability(id, territories) {
  if (await optional(`/v2/inAppPurchases/${id}/inAppPurchaseAvailability`)) return;
  await asc('POST', '/v1/inAppPurchaseAvailabilities', {
    data: {
      type: 'inAppPurchaseAvailabilities',
      attributes: { availableInNewTerritories: true },
      relationships: {
        inAppPurchase: { data: { type: 'inAppPurchases', id } },
        availableTerritories: {
          data: territories.map((t) => ({ type: 'territories', id: t })),
        },
      },
    },
  });
  console.log('  availability:', `${territories.length} territories`);
}

async function setPrice(tip, id) {
  // A price schedule resource exists as soon as the product does, so its
  // existence proves nothing. What matters is whether it carries a price.
  const manual = await asc('GET', `/v1/inAppPurchasePriceSchedules/${id}/manualPrices?limit=10`);
  if (manual.data.length > 0) return;

  let pricePointId = null;
  let url = `/v2/inAppPurchases/${id}/pricePoints?filter[territory]=JPN&limit=200`;
  while (url && !pricePointId) {
    const page = await asc('GET', url);
    pricePointId = page.data.find((p) => p.attributes.customerPrice === String(tip.yen))?.id ?? null;
    url = page.links?.next?.replace('https://api.appstoreconnect.apple.com', '') ?? null;
  }
  if (!pricePointId) throw new Error(`no JPN price point for ¥${tip.yen} on ${tip.productId}`);

  // One manual price in the base territory; Apple derives the other 174.
  await asc('POST', '/v1/inAppPurchasePriceSchedules', {
    data: {
      type: 'inAppPurchasePriceSchedules',
      relationships: {
        inAppPurchase: { data: { type: 'inAppPurchases', id } },
        baseTerritory: { data: { type: 'territories', id: 'JPN' } },
        manualPrices: { data: [{ type: 'inAppPurchasePrices', id: '${price}' }] },
      },
    },
    included: [
      {
        type: 'inAppPurchasePrices',
        id: '${price}',
        attributes: { startDate: null, endDate: null },
        relationships: {
          inAppPurchasePricePoint: {
            data: { type: 'inAppPurchasePricePoints', id: pricePointId },
          },
        },
      },
    ],
  });
  console.log('  price:', `¥${tip.yen} (JPN base)`);
}

async function setup() {
  // An in-app purchase can only be sold where the app is sold.
  const availability = await asc('GET', `/v1/apps/${APP_ID}/appAvailabilityV2`);
  const page = await asc(
    'GET',
    `/v2/appAvailabilities/${availability.data.id}/territoryAvailabilities?limit=200&include=territory`
  );
  const territories = page.data
    .filter((t) => t.attributes.available)
    .map((t) => t.relationships.territory.data.id);

  const existing = await productsById();
  for (const tip of TIPS) {
    const id = await create(tip, existing);
    await localize(tip, id);
    await setAvailability(id, territories);
    await setPrice(tip, id);
  }
}

async function status() {
  const existing = await productsById();
  for (const tip of TIPS) {
    const iap = existing.get(tip.productId);
    if (!iap) {
      console.log(`${tip.productId}  NOT CREATED`);
      continue;
    }
    const [locs, manual, availability, shot] = await Promise.all([
      asc('GET', `/v2/inAppPurchases/${iap.id}/inAppPurchaseLocalizations?limit=10`),
      asc(
        'GET',
        `/v1/inAppPurchasePriceSchedules/${iap.id}/manualPrices?include=inAppPurchasePricePoint&limit=10`
      ),
      optional(`/v2/inAppPurchases/${iap.id}/inAppPurchaseAvailability`),
      optional(`/v2/inAppPurchases/${iap.id}/appStoreReviewScreenshot`),
    ]);
    const price = manual.included?.[0]?.attributes;
    console.log(`\n${tip.productId}  [${iap.attributes.state}]`);
    console.log('  type       :', iap.attributes.inAppPurchaseType);
    console.log('  price      :', price ? `${price.customerPrice} (JPN base)` : 'NOT SET');
    console.log('  locales    :', locs.data.map((l) => l.attributes.locale).join(', ') || 'NONE');
    console.log('  availability:', availability ? 'set' : 'NOT SET');
    console.log('  review note:', iap.attributes.reviewNote ? 'set' : 'NOT SET');
    console.log('  screenshot :', shot?.data?.attributes?.assetDeliveryState?.state ?? 'NOT SET');
  }
}

// App Store Connect validates review screenshots against a fixed list of
// dimensions and rejects anything else with IMAGE_INCORRECT_DIMENSIONS, well
// after the upload appears to succeed. A phone screenshot (1170x2532, and
// 1125x2436 too) is not on the list; 640x920 is.
const REVIEW_WIDTH = 640;
const REVIEW_HEIGHT = 920;

/** Read a PNG's dimensions out of its IHDR chunk. */
function pngSize(bytes) {
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** Scale to fit and letterbox onto white, so the aspect ratio survives. */
function toReviewSize(file) {
  const fitted = join(tmpdir(), 'asc-review-fit.png');
  const padded = join(tmpdir(), 'asc-review.png');
  execFileSync('sips', ['-Z', String(REVIEW_HEIGHT), file, '--out', fitted], { stdio: 'ignore' });
  execFileSync(
    'sips',
    [
      '-p', String(REVIEW_HEIGHT), String(REVIEW_WIDTH),
      '--padColor', 'FFFFFF',
      fitted, '--out', padded,
    ],
    { stdio: 'ignore' }
  );
  return padded;
}

/** Upload one PNG as the review screenshot for every tip product. */
async function screenshot(input) {
  if (!input) throw new Error('usage: tip-products.mjs screenshot <path-to-png>');

  let file = input;
  const source = pngSize(readFileSync(input));
  if (source.width !== REVIEW_WIDTH || source.height !== REVIEW_HEIGHT) {
    file = toReviewSize(input);
    console.log(
      `resized ${source.width}x${source.height} -> ${REVIEW_WIDTH}x${REVIEW_HEIGHT} (${file})`
    );
  }

  const bytes = readFileSync(file);
  const fileSize = statSync(file).size;
  const fileName = basename(file);
  const sourceFileChecksum = createHash('md5').update(bytes).digest('hex');

  const existing = await productsById();
  for (const tip of TIPS) {
    const id = existing.get(tip.productId).id;

    const current = await optional(`/v2/inAppPurchases/${id}/appStoreReviewScreenshot`);
    if (current?.data) {
      await asc('DELETE', `/v1/inAppPurchaseAppStoreReviewScreenshots/${current.data.id}`);
    }

    const reserved = await asc('POST', '/v1/inAppPurchaseAppStoreReviewScreenshots', {
      data: {
        type: 'inAppPurchaseAppStoreReviewScreenshots',
        attributes: { fileName, fileSize },
        // The relationship is inAppPurchaseV2, not inAppPurchase; the wrong
        // name comes back as a 409, not a 400.
        relationships: { inAppPurchaseV2: { data: { type: 'inAppPurchases', id } } },
      },
    });

    for (const op of reserved.data.attributes.uploadOperations) {
      const res = await fetch(op.url, {
        method: op.method,
        headers: Object.fromEntries(op.requestHeaders.map((h) => [h.name, h.value])),
        body: bytes.subarray(op.offset, op.offset + op.length),
      });
      if (!res.ok) throw new Error(`upload chunk -> ${res.status}`);
    }

    const done = await asc(
      'PATCH',
      `/v1/inAppPurchaseAppStoreReviewScreenshots/${reserved.data.id}`,
      {
        data: {
          type: 'inAppPurchaseAppStoreReviewScreenshots',
          id: reserved.data.id,
          attributes: { uploaded: true, sourceFileChecksum },
        },
      }
    );
    console.log('screenshot uploaded:', tip.productId, done.data.attributes.assetDeliveryState?.state);
  }
}

const [command, arg] = process.argv.slice(2);
switch (command) {
  case 'setup':
    await setup();
    break;
  case 'status':
    await status();
    break;
  case 'screenshot':
    await screenshot(arg);
    break;
  default:
    console.error('usage: tip-products.mjs <setup|status|screenshot <png>>');
    process.exit(1);
}
