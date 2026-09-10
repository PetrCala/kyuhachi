import { Directory, File, Paths } from 'expo-file-system';

/**
 * Where queued visit photos wait for upload (ADR-013): under Documents, which
 * iOS never purges, unlike the caches folder the picker and the downscaler
 * write to.
 *
 * Jobs store bare file names, never URIs. The app container's absolute path
 * changes when the app is updated, so a stored URI would dangle after the next
 * TestFlight build; the name is resolved against the current folder each time.
 */
function queueDir(): Directory {
  return new Directory(Paths.document, 'visit-photo-queue');
}

/** Copies a picked photo into the queue folder and returns its file name. */
export function stageQueuedPhoto(uri: string): string {
  const dir = queueDir();
  dir.create({ intermediates: true, idempotent: true });
  const name = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}.jpg`;
  new File(uri).copy(new File(dir, name));
  return name;
}

export function queuedPhotoUri(file: string): string {
  return new File(queueDir(), file).uri;
}

export function queuedPhotoExists(file: string): boolean {
  return new File(queueDir(), file).exists;
}

/** Best-effort: a file that won't delete only costs disk space. */
export function deleteQueuedPhoto(file: string): void {
  try {
    const f = new File(queueDir(), file);
    if (f.exists) f.delete();
  } catch {
    // See above.
  }
}
