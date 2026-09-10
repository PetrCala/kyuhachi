import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Durable upload queue for visit photos (ADR-013).
 *
 * Saving a visit writes its doc at once, offline or not (see edit-visit). A
 * photo needs Storage, and Storage needs a connection, so the editor hands its
 * photo list here instead of uploading in place: fresh photos are copied into
 * a folder iOS doesn't purge (photo-queue-files) and the visit's target photo
 * list is persisted as a job. A drain uploads whatever it can whenever the app
 * is open, resuming photo by photo, then writes the final list onto the visit.
 *
 * One job per visit, keyed by uid/challenge/onsen. Saving the same visit again
 * replaces its job and bumps `revision`; the drain re-reads the job after every
 * step, so an edit made while photos upload is never overwritten.
 */

/**
 * One photo in a job: in Storage already, or a file still waiting in the queue
 * folder. An uploaded photo keeps the queue `file` it came from until the job
 * finishes, so it can still be shown (and deduplicated) without the network.
 */
export type QueuedPhoto =
  | { kind: 'uploaded'; url: string; file?: string }
  | { kind: 'local'; file: string };

export interface PhotoUploadJob {
  uid: string;
  challengeId: string;
  onsenId: string;
  /** The visit's photos, in display order, as they should finally read. */
  photos: QueuedPhoto[];
  /** Download URLs to delete from Storage once the visit no longer lists them. */
  removedUrls: string[];
  /** Bumped on every save of this visit, so a drain can tell its job was replaced. */
  revision: number;
  /** The revision whose photo list was last written onto the visit doc. */
  writtenRevision: number | null;
}

export type PhotoQueue = Record<string, PhotoUploadJob>;

// Versioned for the same reason as the catalog cache: a future shape change
// moves to a new key instead of guessing at parsing old jobs.
const QUEUE_KEY = 'photoQueue.v1';

export function photoJobKey(uid: string, challengeId: string, onsenId: string): string {
  return `${uid}/${challengeId}/${onsenId}`;
}

/** How many of a job's photos are still waiting to upload. */
export function pendingPhotoCount(job: PhotoUploadJob | null | undefined): number {
  return job ? job.photos.filter((p) => p.kind === 'local').length : 0;
}

/** Every queue file a job still references. */
export function jobFiles(job: PhotoUploadJob): string[] {
  return job.photos.flatMap((p) => (p.file ? [p.file] : []));
}

export interface PhotoSaveInput {
  uid: string;
  challengeId: string;
  onsenId: string;
  /** The editor's final list; local entries name files already staged into the queue folder. */
  photos: QueuedPhoto[];
  /** URLs the editor started with that the user removed. */
  removedUrls: string[];
}

/**
 * The job a save leaves behind, or null when there is nothing to upload,
 * write or delete. `droppedFiles` are queue files the previous job held that
 * this save no longer uses, for the caller to delete.
 *
 * The editor may have loaded a photo as `local` that the drain uploaded while
 * it was open. The previous job's record of that upload is carried over rather
 * than uploading the file twice, and any upload the save drops is scheduled
 * for deletion.
 */
export function planSave(
  prev: PhotoUploadJob | undefined,
  input: PhotoSaveInput
): { job: PhotoUploadJob | null; droppedFiles: string[] } {
  const uploadedFromFile = new Map<string, string>();
  for (const p of prev?.photos ?? []) {
    if (p.kind === 'uploaded' && p.file) uploadedFromFile.set(p.file, p.url);
  }
  const photos = input.photos.map((p): QueuedPhoto => {
    const url = p.kind === 'local' ? uploadedFromFile.get(p.file) : undefined;
    return url ? { kind: 'uploaded', url, file: p.file } : p;
  });

  const keptUrls = new Set(photos.flatMap((p) => (p.kind === 'uploaded' ? [p.url] : [])));
  const keptFiles = new Set(photos.flatMap((p) => (p.file ? [p.file] : [])));
  const prevUrls = (prev?.photos ?? []).flatMap((p) => (p.kind === 'uploaded' ? [p.url] : []));
  const removedUrls = [
    ...new Set([...(prev?.removedUrls ?? []), ...input.removedUrls, ...prevUrls]),
  ].filter((url) => !keptUrls.has(url));
  const droppedFiles = prev ? jobFiles(prev).filter((file) => !keptFiles.has(file)) : [];

  const hasWork =
    prev !== undefined || photos.some((p) => p.kind === 'local') || removedUrls.length > 0;
  if (!hasWork) return { job: null, droppedFiles };

  return {
    job: {
      uid: input.uid,
      challengeId: input.challengeId,
      onsenId: input.onsenId,
      photos,
      removedUrls,
      revision: (prev?.revision ?? 0) + 1,
      writtenRevision: null,
    },
    droppedFiles,
  };
}

// Every read and write goes through one chain, so the editor saving a visit
// and the drain recording an upload can never interleave a read-modify-write.
let tail: Promise<unknown> = Promise.resolve();
const listeners = new Set<(queue: PhotoQueue) => void>();

function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = tail.then(fn);
  tail = run.catch(() => {});
  return run;
}

async function load(): Promise<PhotoQueue> {
  // A failing read propagates rather than reading as empty: an empty queue
  // would be written back over the real one on the next update.
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as PhotoQueue;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function readPhotoQueue(): Promise<PhotoQueue> {
  return serialized(load);
}

/** Applies `fn` to the stored queue (mutating it in place), persists it, and notifies subscribers. */
export function updatePhotoQueue<T>(fn: (queue: PhotoQueue) => T): Promise<T> {
  return serialized(async () => {
    const queue = await load();
    const result = fn(queue);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    listeners.forEach((listener) => listener(queue));
    return result;
  });
}

export function subscribePhotoQueue(listener: (queue: PhotoQueue) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Records an editor save as its visit's job. Resolves the queue files it dropped. */
export function savePhotoJob(input: PhotoSaveInput): Promise<string[]> {
  return updatePhotoQueue((queue) => {
    const key = photoJobKey(input.uid, input.challengeId, input.onsenId);
    const { job, droppedFiles } = planSave(queue[key], input);
    if (job) queue[key] = job;
    else delete queue[key];
    return droppedFiles;
  });
}

/** Drops every job `match` accepts. Resolves the queue files they held. */
export function discardPhotoJobs(match: (job: PhotoUploadJob) => boolean): Promise<string[]> {
  return updatePhotoQueue((queue) => {
    const files: string[] = [];
    for (const [key, job] of Object.entries(queue)) {
      if (!match(job)) continue;
      files.push(...jobFiles(job));
      delete queue[key];
    }
    return files;
  });
}

/** The side effects a drain needs, injected so the queue logic is testable without Firebase. */
export interface PhotoDrainDeps {
  /** Uploads a queue file for the job's visit and resolves its download URL. */
  upload(job: PhotoUploadJob, file: string): Promise<string>;
  /** Writes the photo list onto the visit doc. Fire-and-forget: the write queues offline. */
  writePhotoUrls(job: PhotoUploadJob, urls: string[]): void;
  /** Deletes a Storage object; resolves true once it is gone (already missing counts). */
  deleteRemote(url: string): Promise<boolean>;
  fileExists(file: string): boolean;
  deleteFile(file: string): void;
}

/**
 * Works through every job belonging to `uid`. A job that can't progress (an
 * upload or delete failing, typically for lack of signal) is left as it is for
 * the next drain; nothing here gives up on a photo that still exists.
 */
export async function drainPhotoQueue(uid: string, deps: PhotoDrainDeps): Promise<void> {
  const queue = await readPhotoQueue();
  for (const [key, job] of Object.entries(queue)) {
    if (job.uid === uid) await drainJob(key, deps);
  }
}

async function drainJob(key: string, deps: PhotoDrainDeps): Promise<void> {
  // Each pass either changes the stored job or returns, so this terminates.
  for (;;) {
    const job = (await readPhotoQueue())[key];
    if (!job) return;

    const local = job.photos.find((p) => p.kind === 'local');
    if (local) {
      if (!deps.fileExists(local.file)) {
        // Nothing left on disk to upload. Queue files are only deleted along
        // with the job that owns them, so this is a lost file, not a race.
        await updatePhotoQueue((queue) => {
          const current = queue[key];
          if (current) {
            current.photos = current.photos.filter(
              (p) => p.kind !== 'local' || p.file !== local.file
            );
          }
        });
        continue;
      }

      let url: string;
      try {
        url = await deps.upload(job, local.file);
      } catch {
        return;
      }

      const outcome = await updatePhotoQueue((queue) => {
        const current = queue[key];
        if (!current) return 'gone';
        const index = current.photos.findIndex((p) => p.kind === 'local' && p.file === local.file);
        if (index < 0) {
          // The photo was removed while it uploaded.
          current.removedUrls.push(url);
          return 'dropped';
        }
        current.photos[index] = { kind: 'uploaded', url, file: local.file };
        return 'placed';
      });
      if (outcome === 'gone') void deps.deleteRemote(url);
      continue;
    }

    if (job.writtenRevision !== job.revision) {
      const urls = job.photos.flatMap((p) => (p.kind === 'uploaded' ? [p.url] : []));
      deps.writePhotoUrls(job, urls);
      await updatePhotoQueue((queue) => {
        const current = queue[key];
        if (current && current.revision === job.revision) current.writtenRevision = job.revision;
      });
      continue;
    }

    if (job.removedUrls.length > 0) {
      const gone: string[] = [];
      for (const url of job.removedUrls) {
        if (await deps.deleteRemote(url)) gone.push(url);
      }
      await updatePhotoQueue((queue) => {
        const current = queue[key];
        if (current) current.removedUrls = current.removedUrls.filter((u) => !gone.includes(u));
      });
      if (gone.length < job.removedUrls.length) return;
      continue;
    }

    const finished = await updatePhotoQueue((queue) => {
      if (queue[key]?.revision !== job.revision) return false;
      delete queue[key];
      return true;
    });
    if (finished) {
      jobFiles(job).forEach((file) => deps.deleteFile(file));
      return;
    }
  }
}
