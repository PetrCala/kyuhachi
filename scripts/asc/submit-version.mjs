/**
 * Prepare, and optionally submit, an App Store version.
 *
 *   node scripts/asc/submit-version.mjs <version>            # prepare, print a plan
 *   node scripts/asc/submit-version.mjs <version> --submit   # prepare, then submit
 *
 * Originally written for the release that carried the tip jar, where the three
 * consumable products had to go to review attached to the binary
 * (docs/tip-jar.md). It is useful for any release: without --submit it only
 * stages the version, and the final PATCH that hands the build to App Review is
 * behind the flag.
 *
 * Release notes live in release-notes/<version>/<locale>.txt, read at staging
 * time. A version with no notes, or missing a locale the App Store lists, is a
 * hard failure: staging PATCHes what it has, so a silent skip would leave that
 * locale on the previous release's What's New.
 *
 * They are kept out of app/fastlane/metadata deliberately: that tree's
 * release_notes.txt was removed precisely so a metadata upload can never
 * overwrite a live app's What's New (see docs/app-store-submission.md).
 */
import { asc, APP_ID } from './asc.mjs';
import { assertEveryLocaleCovered, releaseNotes } from './release-notes.mjs';

const TARGET = process.argv[2];
const DO_SUBMIT = process.argv.includes('--submit');
if (!TARGET) {
  console.error('usage: submit-version.mjs <version> [--submit]');
  process.exit(1);
}

// App Store Connect allows exactly one editable version record. After a
// rejection that record is the rejected version, so a new release reuses and
// renames it; creating a second one is refused.
const EDITABLE = new Set([
  'PREPARE_FOR_SUBMISSION',
  'REJECTED',
  'DEVELOPER_REJECTED',
  'METADATA_REJECTED',
  'INVALID_BINARY',
]);

const WHATS_NEW = releaseNotes(TARGET);
console.log(`notes      : ${Object.keys(WHATS_NEW).sort().join(', ')}`);

/**
 * Products to submit alongside the binary; empty once they are approved once.
 * Emptied 2026-08-31: all three tip consumables are APPROVED and shipped in
 * 1.0.18, so they no longer need to ride along with a binary. Repopulate only
 * for a NEW product, which does have to go to review attached to a build.
 */
const TIP_PRODUCT_IDS = [];

const build = await (async () => {
  const builds = await asc(
    'GET',
    `/v1/builds?filter[app]=${APP_ID}&limit=20&sort=-uploadedDate&include=preReleaseVersion`
  );
  const preVersions = Object.fromEntries(
    (builds.included ?? []).map((p) => [p.id, p.attributes.version])
  );
  const match = builds.data.find(
    (b) =>
      preVersions[b.relationships?.preReleaseVersion?.data?.id] === TARGET &&
      b.attributes.processingState === 'VALID'
  );
  if (!match) {
    throw new Error(`no VALID TestFlight build for ${TARGET} (still processing?)`);
  }
  return match;
})();
console.log(`build      : ${TARGET} (${build.attributes.version}), VALID`);

let version = await (async () => {
  const versions = await asc('GET', `/v1/apps/${APP_ID}/appStoreVersions?limit=10`);

  // Already in flight (or released): there is nothing to stage, and trying to
  // create the version again is a 409.
  const inFlight = versions.data.find(
    (v) => v.attributes.versionString === TARGET && !EDITABLE.has(v.attributes.appVersionState)
  );
  if (inFlight) {
    console.log(`version    : ${TARGET} is ${inFlight.attributes.appVersionState}, nothing to do`);
    process.exit(0);
  }

  const editable = versions.data.find((v) => EDITABLE.has(v.attributes.appVersionState));
  if (!editable) {
    const created = await asc('POST', '/v1/appStoreVersions', {
      data: {
        type: 'appStoreVersions',
        attributes: { platform: 'IOS', versionString: TARGET },
        relationships: { app: { data: { type: 'apps', id: APP_ID } } },
      },
    });
    console.log(`version    : created ${TARGET}`);
    return created.data;
  }
  if (editable.attributes.versionString === TARGET) {
    console.log(`version    : ${TARGET} exists [${editable.attributes.appVersionState}]`);
    return editable;
  }
  console.log(
    `version    : reusing ${editable.attributes.versionString} [${editable.attributes.appVersionState}] -> ${TARGET}`
  );
  const renamed = await asc('PATCH', `/v1/appStoreVersions/${editable.id}`, {
    data: { type: 'appStoreVersions', id: editable.id, attributes: { versionString: TARGET } },
  });
  return renamed.data;
})();

await asc('PATCH', `/v1/appStoreVersions/${version.id}/relationships/build`, {
  data: { type: 'builds', id: build.id },
});
console.log('build      : attached');

const locs = await asc('GET', `/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations`);
assertEveryLocaleCovered(locs.data.map((l) => l.attributes.locale), WHATS_NEW, TARGET);
for (const loc of locs.data) {
  const whatsNew = WHATS_NEW[loc.attributes.locale];
  await asc('PATCH', `/v1/appStoreVersionLocalizations/${loc.id}`, {
    data: { type: 'appStoreVersionLocalizations', id: loc.id, attributes: { whatsNew } },
  });
  console.log(`whatsNew   : ${loc.attributes.locale} updated`);
}

/**
 * The current version of each product to submit. In the v2 model a product is
 * never submitted directly: it has versions, and the review submission takes
 * one of those.
 */
const tipVersions = await (async () => {
  if (TIP_PRODUCT_IDS.length === 0) return [];
  const iaps = await asc('GET', `/v1/apps/${APP_ID}/inAppPurchasesV2?limit=200`);
  const out = [];
  for (const productId of TIP_PRODUCT_IDS) {
    const product = iaps.data.find((p) => p.attributes.productId === productId);
    if (!product) throw new Error(`missing product ${productId}`);
    if (!['READY_TO_SUBMIT', 'WAITING_FOR_REVIEW', 'APPROVED'].includes(product.attributes.state)) {
      throw new Error(`${productId} is ${product.attributes.state}; see docs/tip-jar.md`);
    }
    const versions = await asc('GET', `/v2/inAppPurchases/${product.id}/versions?limit=5`);
    out.push({ productId, id: versions.data[0].id });
  }
  return out;
})();
console.log(`products   : ${tipVersions.length} ready`);

if (!DO_SUBMIT) {
  console.log('\nprepared, not submitted. Re-run with --submit to send it to App Review.');
  process.exit(0);
}

const submission = await (async () => {
  const open = await asc(
    'GET',
    `/v1/reviewSubmissions?filter[app]=${APP_ID}&filter[state]=READY_FOR_REVIEW&limit=1`
  );
  if (open.data[0]) return open.data[0];
  const created = await asc('POST', '/v1/reviewSubmissions', {
    data: {
      type: 'reviewSubmissions',
      attributes: { platform: 'IOS' },
      relationships: { app: { data: { type: 'apps', id: APP_ID } } },
    },
  });
  return created.data;
})();
console.log('submission :', submission.id);

const items = await asc('GET', `/v1/reviewSubmissions/${submission.id}/items?limit=50`);
if (items.data.length === 0) {
  // The relationship is appStoreVersion, NOT appStoreVersionForReview.
  await asc('POST', '/v1/reviewSubmissionItems', {
    data: {
      type: 'reviewSubmissionItems',
      relationships: {
        reviewSubmission: { data: { type: 'reviewSubmissions', id: submission.id } },
        appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } },
      },
    },
  });
  console.log('item       : app version');

  for (const tip of tipVersions) {
    // The relationship is inAppPurchaseVersion, NOT inAppPurchaseV2 (which is
    // what the screenshot endpoint wants). Both wrong names return a 409 that
    // says the relationship is unknown without naming the right one.
    await asc('POST', '/v1/reviewSubmissionItems', {
      data: {
        type: 'reviewSubmissionItems',
        relationships: {
          reviewSubmission: { data: { type: 'reviewSubmissions', id: submission.id } },
          inAppPurchaseVersion: { data: { type: 'inAppPurchaseVersions', id: tip.id } },
        },
      },
    });
    console.log('item       :', tip.productId);
  }
} else {
  console.log(`items      : ${items.data.length} already attached, leaving them alone`);
}

await asc('PATCH', `/v1/reviewSubmissions/${submission.id}`, {
  data: { type: 'reviewSubmissions', id: submission.id, attributes: { submitted: true } },
});
const final = await asc('GET', `/v1/reviewSubmissions/${submission.id}`);
console.log('\nsubmitted  :', final.data.attributes.state);
