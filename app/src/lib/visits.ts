import { doc, setDoc, serverTimestamp } from '@react-native-firebase/firestore';
import { COLLECTIONS, SUBCOLLECTIONS, EMPTY_VISIT_STRUCTURED_DATA } from '@kyuhachi/shared';
import { db } from '@/firebase';

/**
 * Records a one-tap check-in: writes an empty visit doc (no notes, no photos,
 * blank structured data) for an onsen in the given challenge. The visit already
 * counts toward the challenge; callers typically open the edit-visit modal right
 * after so the user can fill in details. The write hits the local cache
 * synchronously, so navigation can proceed without awaiting the server.
 *
 * Shared by the onsen detail FAB and the record-a-visit list. Callers own their
 * own error handling (the `.catch`) and post-write navigation.
 */
export function createEmptyVisit(
  uid: string,
  challengeId: string,
  onsenId: string
): Promise<void> {
  return setDoc(
    doc(
      db,
      COLLECTIONS.USERS,
      uid,
      SUBCOLLECTIONS.CHALLENGES,
      challengeId,
      SUBCOLLECTIONS.VISITS,
      onsenId
    ),
    {
      visitedAt: serverTimestamp(),
      notes: null,
      photoUrls: [],
      structuredData: { ...EMPTY_VISIT_STRUCTURED_DATA },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
  );
}
