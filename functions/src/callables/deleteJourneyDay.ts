import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';

/**
 * Remove one walked day from /journey_days, undoing a publish from the phone.
 *
 * Republishing already fixes a day whose track was wrong, since the write is an
 * upsert. This covers what an upsert cannot: a day that should not be on the
 * site at all, and a day whose track exposes somewhere it should not. The ~500 m
 * trim only covers each recording's start and end, so a stop made mid-walk
 * without stopping the watch is published at full fidelity, and the only fix is
 * for the document to be gone. Without this callable that fix needs the console
 * or gcloud, which means a laptop, which is exactly what is not to hand while
 * walking in Kyushu.
 *
 * Firestore rules deny every client write to /journey_days, deliberately and
 * including Petr's own, so this callable and publishJourneyDay are the only
 * client-reachable writers. It runs with admin credentials, which is exactly why
 * it must do its own authorization: the uid check below is the whole gate.
 *
 * Deleting a day with no document succeeds with existed: false. The call is
 * idempotent, and the client may be acting on a list fetched before someone
 * else's write, so a missing document is an outcome to report, not a failure.
 */

/**
 * The one uid allowed to delete. Canonical copy:
 * shared/src/types/journey.ts (JOURNEY_UID); duplicated because Functions is a
 * separate package from `@kyuhachi/shared`. Keep the two in sync.
 */
const JOURNEY_UID = 'juEfBPJSspS9E2dqMzRac07C1Gs1';

interface RequestBody {
  date?: unknown;
}

export const deleteJourneyDay = onCall(async (request) => {
  if (request.auth?.uid !== JOURNEY_UID) {
    throw new HttpsError('permission-denied', 'This account cannot delete journey days.');
  }

  const date = (request.data as RequestBody)?.date;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new HttpsError('invalid-argument', 'date must be a "YYYY-MM-DD" string.');
  }

  const db = getFirestore();
  const ref = db.collection('journey_days').doc(date);
  const existing = await ref.get();
  if (existing.exists) await ref.delete();

  logger.info(`deleted ${date}` + (existing.exists ? '' : ' (no document, nothing to delete)'));

  return { date, existed: existing.exists };
});
