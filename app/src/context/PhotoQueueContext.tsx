import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import { doc, updateDoc, serverTimestamp } from '@react-native-firebase/firestore';
import {
  ref,
  putFile,
  getDownloadURL,
  deleteObject,
  refFromURL,
} from '@react-native-firebase/storage';
import { COLLECTIONS, SUBCOLLECTIONS } from '@kyuhachi/shared';
import { useAuth } from '@/context/AuthContext';
import { useActiveChallengeProgress } from '@/context/ActiveChallengeContext';
import { db, storage } from '@/firebase';
import {
  discardPhotoJobs,
  drainPhotoQueue,
  pendingPhotoCount,
  photoJobKey,
  readPhotoQueue,
  savePhotoJob,
  subscribePhotoQueue,
  type PhotoDrainDeps,
  type PhotoQueue,
  type PhotoUploadJob,
  type QueuedPhoto,
} from '@/lib/photo-queue';
import {
  deleteQueuedPhoto,
  queuedPhotoExists,
  queuedPhotoUri,
  stageQueuedPhoto,
} from '@/lib/photo-queue-files';

// While jobs are waiting and the app is in front, how often to try again. The
// Storage SDK already retries a stalled upload on its own; this covers the
// case where it gave up before signal came back.
const RETRY_INTERVAL_MS = 60_000;

const drainDeps: PhotoDrainDeps = {
  async upload(job, file) {
    // Named after the queue file, so an upload retried after a crash
    // overwrites its first attempt instead of leaving a stray object.
    const photoRef = ref(
      storage,
      `visits/${job.uid}/${job.challengeId}_${job.onsenId}/photo_${file}`
    );
    await putFile(photoRef, queuedPhotoUri(file));
    return getDownloadURL(photoRef);
  },
  writePhotoUrls(job, urls) {
    // Not awaited, like every visit write: the promise resolves only on the
    // backend's acknowledgment. A rejection means the visit is gone.
    updateDoc(
      doc(
        db,
        COLLECTIONS.USERS,
        job.uid,
        SUBCOLLECTIONS.CHALLENGES,
        job.challengeId,
        SUBCOLLECTIONS.VISITS,
        job.onsenId
      ),
      { photoUrls: urls, updatedAt: serverTimestamp() }
    ).catch(() => {});
  },
  async deleteRemote(url) {
    try {
      await deleteObject(refFromURL(storage, url));
      return true;
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? (error as { code: string }).code : '';
      return code === 'storage/object-not-found';
    }
  },
  fileExists: queuedPhotoExists,
  deleteFile: deleteQueuedPhoto,
};

/** A photo as the editor holds it: one already in the queue's terms, or one just picked. */
export type EditorPhoto = QueuedPhoto | { kind: 'fresh'; uri: string };

export interface SavePhotosInput {
  challengeId: string;
  onsenId: string;
  photos: EditorPhoto[];
  removedUrls: string[];
}

interface PhotoQueueValue {
  /** False until the stored queue has been read once. */
  ready: boolean;
  /** The signed-in user's job for a visit, if its photos are still in flight. */
  jobFor: (challengeId: string, onsenId: string) => PhotoUploadJob | null;
  /** Stages the editor's photos and queues them. Local work only: never waits on the network. */
  savePhotos: (input: SavePhotosInput) => Promise<void>;
  discardVisit: (challengeId: string, onsenId: string) => void;
  discardChallenge: (challengeId: string) => void;
  discardAll: () => void;
}

const noop = () => {};

const PhotoQueueContext = createContext<PhotoQueueValue>({
  ready: false,
  jobFor: () => null,
  savePhotos: async () => {},
  discardVisit: noop,
  discardChallenge: noop,
  discardAll: noop,
});

/**
 * Owns the visit photo queue for the app's lifetime (ADR-013): mirrors the
 * stored jobs into state for the UI, and drains them on launch, on sign-in,
 * whenever the app returns to the foreground, and on a timer while anything
 * is waiting. Lives at the root so an upload outlives the editor that queued it.
 */
export function PhotoQueueProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [queue, setQueue] = useState<PhotoQueue>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    const unsubscribe = subscribePhotoQueue((next) => {
      if (alive) setQueue(next);
    });
    readPhotoQueue().then(
      (stored) => {
        if (!alive) return;
        setQueue(stored);
        setReady(true);
      },
      () => {
        if (alive) setReady(true);
      }
    );
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  // One drain at a time. A trigger that lands mid-drain asks for one more pass
  // instead of starting a second, overlapping one.
  const draining = useRef(false);
  const drainAgain = useRef(false);
  const drain = useCallback(async () => {
    if (!uid) return;
    if (draining.current) {
      drainAgain.current = true;
      return;
    }
    draining.current = true;
    try {
      do {
        drainAgain.current = false;
        await drainPhotoQueue(uid, drainDeps);
      } while (drainAgain.current);
    } catch {
      // Device storage unavailable: the next trigger tries again.
    } finally {
      draining.current = false;
    }
  }, [uid]);

  const hasPending = useMemo(
    () => uid !== null && Object.values(queue).some((job) => job.uid === uid),
    [queue, uid]
  );

  useEffect(() => {
    void drain();
  }, [drain]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void drain();
    });
    return () => subscription.remove();
  }, [drain]);

  useEffect(() => {
    if (!hasPending) return;
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void drain();
    }, RETRY_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [hasPending, drain]);

  const jobFor = useCallback(
    (challengeId: string, onsenId: string) =>
      uid ? (queue[photoJobKey(uid, challengeId, onsenId)] ?? null) : null,
    [queue, uid]
  );

  const savePhotos = useCallback(
    async ({ challengeId, onsenId, photos, removedUrls }: SavePhotosInput) => {
      if (!uid) return;
      const staged = photos.map((p): QueuedPhoto =>
        p.kind === 'fresh' ? { kind: 'local', file: stageQueuedPhoto(p.uri) } : p
      );
      const dropped = await savePhotoJob({ uid, challengeId, onsenId, photos: staged, removedUrls });
      dropped.forEach(deleteQueuedPhoto);
      void drain();
    },
    [uid, drain]
  );

  const discard = useCallback((match: (job: PhotoUploadJob) => boolean) => {
    discardPhotoJobs(match).then(
      (files) => files.forEach(deleteQueuedPhoto),
      () => {}
    );
  }, []);

  const discardVisit = useCallback(
    (challengeId: string, onsenId: string) =>
      discard((j) => j.uid === uid && j.challengeId === challengeId && j.onsenId === onsenId),
    [discard, uid]
  );
  const discardChallenge = useCallback(
    (challengeId: string) => discard((j) => j.uid === uid && j.challengeId === challengeId),
    [discard, uid]
  );
  const discardAll = useCallback(() => discard((j) => j.uid === uid), [discard, uid]);

  const value = useMemo(
    () => ({ ready, jobFor, savePhotos, discardVisit, discardChallenge, discardAll }),
    [ready, jobFor, savePhotos, discardVisit, discardChallenge, discardAll]
  );

  return <PhotoQueueContext.Provider value={value}>{children}</PhotoQueueContext.Provider>;
}

export function usePhotoQueue(): PhotoQueueValue {
  return useContext(PhotoQueueContext);
}

/** Where to load a queued photo from: its local copy while there is one, else Storage. */
export function queuedPhotoSource(photo: QueuedPhoto): string {
  if (photo.kind === 'local') return queuedPhotoUri(photo.file);
  return photo.file ? queuedPhotoUri(photo.file) : photo.url;
}

/**
 * The photos to show for a visit in the active challenge. While any are still
 * uploading, that's the queued list (waiting photos shown straight from disk),
 * so the card and the viewer agree with what the editor saved; otherwise it's
 * the doc's own URLs.
 */
export function useVisitPhotos(
  onsenId: string | undefined,
  photoUrls: string[]
): { uris: string[]; pendingCount: number } {
  const { challengeId } = useActiveChallengeProgress();
  const { jobFor } = usePhotoQueue();
  const job = challengeId && onsenId ? jobFor(challengeId, onsenId) : null;
  return useMemo(
    () =>
      job
        ? { uris: job.photos.map(queuedPhotoSource), pendingCount: pendingPhotoCount(job) }
        : { uris: photoUrls, pendingCount: 0 },
    [job, photoUrls]
  );
}
