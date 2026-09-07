/**
 * One-off migration: re-encode every /journey_days document that still stores
 * its track as a `points` array into the `polyline` string that replaced it.
 *
 * Why the format changed: Firestore spends ~24 bytes on each point as a map of
 * two doubles, and the web SDK wraps every one of them again in protobuf-JSON,
 * so a ~1000 point day reached the browser as ~95 KB. The journey site fetches
 * every walked day on every page load, so the page grew heavier with each day
 * Petr walked. The same track as an encoded polyline is ~2.6 KB.
 *
 * Lossy only in the last decimal: `points` were stored at six places (~0.1 m)
 * and the polyline encodes five (~1.1 m). That is well inside the ~1 m
 * simplification tolerance the track already went through, and nowhere near the
 * 500 m privacy trim, which this script does not touch and does not need to:
 * it re-encodes what is already published, and adds no point that trimming
 * removed.
 *
 * === Running ===
 *   GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account-key.json \
 *   npx ts-node --transpile-only --project functions/tsconfig.json \
 *     scripts/migrate-journey-day-polylines.ts [--dry-run]
 *
 * Idempotent: a document that already has `polyline` and no `points` is left
 * alone, so re-running after a partial run is safe. --dry-run still reads, so
 * it still needs the credentials; it simply writes nothing.
 *
 * Every document is round-tripped through the decoder and checked before its
 * `points` are deleted, so a codec fault skips the day rather than destroying
 * its route.
 */

import * as admin from 'firebase-admin';
import {
  decodePolyline,
  encodePolyline,
  haversineMeters,
  type LatLng,
} from '../functions/src/util/track';

/**
 * How far a point may move in the round trip before the document is left alone.
 * Rounding six decimals to five can shift a point by up to ~0.8 m, so anything
 * approaching this means the codec is wrong rather than merely coarser, and the
 * `points` array must not be deleted on top of it.
 */
const MAX_SHIFT_METERS = 2;

const PROJECT_ID = 'kyuhachi-fddcc';

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');

  admin.initializeApp({ projectId: PROJECT_ID });
  const db = admin.firestore();

  const snap = await db.collection('journey_days').orderBy('date').get();
  if (snap.empty) {
    console.log('no journey_days documents; nothing to migrate');
    return;
  }

  let migrated = 0;
  let alreadyDone = 0;
  let failed = 0;
  let beforeBytes = 0;
  let afterBytes = 0;

  for (const doc of snap.docs) {
    const points = doc.get('points') as LatLng[] | undefined;
    const polyline = doc.get('polyline') as string | undefined;

    if (!Array.isArray(points)) {
      // Already migrated, or a document written by the new publish path.
      if (typeof polyline === 'string') alreadyDone++;
      else console.warn(`${doc.id}: no points and no polyline, leaving it alone`);
      continue;
    }

    const encoded = encodePolyline(points);

    /*
     * Prove the round trip on this document's own track before its points are
     * deleted. The write is destructive and the array is the only copy in
     * Firestore, so a codec that silently lost a coordinate would take the day's
     * route with it.
     */
    const decoded = decodePolyline(encoded);
    if (decoded.length !== points.length) {
      console.error(
        `${doc.id}: round trip changed the point count (${points.length} -> ${decoded.length}), skipping`
      );
      failed++;
      continue;
    }
    let worstShift = 0;
    for (let i = 0; i < points.length; i++) {
      worstShift = Math.max(worstShift, haversineMeters(points[i], decoded[i]));
    }
    if (worstShift > MAX_SHIFT_METERS) {
      console.error(
        `${doc.id}: round trip moved a point ${worstShift.toFixed(2)} m, over the ${MAX_SHIFT_METERS} m limit, skipping`
      );
      failed++;
      continue;
    }

    // A rough count of what the array cost against what the string costs, purely
    // so the run reports the win it exists for.
    const was = points.length * 24;
    beforeBytes += was;
    afterBytes += encoded.length;

    console.log(
      `${doc.id}: ${points.length} points, ~${(was / 1024).toFixed(1)} KB as an array ` +
        `-> ${(encoded.length / 1024).toFixed(1)} KB encoded, ` +
        `worst point shift ${worstShift.toFixed(2)} m` +
        (dryRun ? ' (dry run, not written)' : '')
    );

    if (!dryRun) {
      await doc.ref.update({
        polyline: encoded,
        pointCount: points.length,
        points: admin.firestore.FieldValue.delete(),
      });
    }
    migrated++;
  }

  console.log(
    `done: ${migrated} day(s) ${dryRun ? 'would be migrated' : 'migrated'}` +
      (alreadyDone > 0 ? `, ${alreadyDone} already encoded` : '') +
      (failed > 0 ? `, ${failed} SKIPPED by the round-trip check` : '') +
      (migrated > 0
        ? `; ~${(beforeBytes / 1024).toFixed(0)} KB of points became ${(afterBytes / 1024).toFixed(0)} KB of polyline`
        : '')
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
