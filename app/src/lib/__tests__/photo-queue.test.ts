import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  discardPhotoJobs,
  drainPhotoQueue,
  photoJobKey,
  planSave,
  readPhotoQueue,
  savePhotoJob,
  type PhotoDrainDeps,
  type PhotoUploadJob,
} from '@/lib/photo-queue';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

beforeEach(() => AsyncStorage.clear());

const VISIT = { uid: 'u1', challengeId: 'c1', onsenId: 'o1' };
const KEY = photoJobKey('u1', 'c1', 'o1');

/** Drain side effects over an in-memory disk holding `files`. */
function fakeDeps(files: string[]) {
  const disk = new Set(files);
  const deps = {
    upload: jest.fn(async (_job: PhotoUploadJob, file: string) => `https://storage/${file}`),
    writePhotoUrls: jest.fn(),
    deleteRemote: jest.fn(async (_url: string): Promise<boolean> => true),
    fileExists: jest.fn((file: string) => disk.has(file)),
    deleteFile: jest.fn((file: string) => {
      disk.delete(file);
    }),
  } satisfies PhotoDrainDeps;
  return { deps, disk };
}

describe('planSave', () => {
  it('queues a new visit with fresh photos', () => {
    const { job } = planSave(undefined, {
      ...VISIT,
      photos: [{ kind: 'local', file: 'a.jpg' }],
      removedUrls: [],
    });
    expect(job).toMatchObject({ revision: 1, writtenRevision: null, removedUrls: [] });
  });

  it('queues nothing when there is nothing to upload, write or delete', () => {
    const { job } = planSave(undefined, {
      ...VISIT,
      photos: [{ kind: 'uploaded', url: 'https://storage/x' }],
      removedUrls: [],
    });
    expect(job).toBeNull();
  });

  it('carries over an upload that finished while the editor was open', () => {
    const prev: PhotoUploadJob = {
      ...VISIT,
      photos: [{ kind: 'uploaded', url: 'https://storage/a.jpg', file: 'a.jpg' }],
      removedUrls: [],
      revision: 1,
      writtenRevision: 1,
    };
    const { job, droppedFiles } = planSave(prev, {
      ...VISIT,
      photos: [{ kind: 'local', file: 'a.jpg' }],
      removedUrls: [],
    });
    expect(job?.photos).toEqual([{ kind: 'uploaded', url: 'https://storage/a.jpg', file: 'a.jpg' }]);
    expect(job?.revision).toBe(2);
    expect(droppedFiles).toEqual([]);
  });

  it('schedules a dropped upload for deletion and releases its file', () => {
    const prev: PhotoUploadJob = {
      ...VISIT,
      photos: [
        { kind: 'uploaded', url: 'https://storage/a.jpg', file: 'a.jpg' },
        { kind: 'local', file: 'b.jpg' },
      ],
      removedUrls: [],
      revision: 1,
      writtenRevision: null,
    };
    const { job, droppedFiles } = planSave(prev, {
      ...VISIT,
      photos: [{ kind: 'local', file: 'b.jpg' }],
      removedUrls: [],
    });
    expect(job?.removedUrls).toEqual(['https://storage/a.jpg']);
    expect(droppedFiles).toEqual(['a.jpg']);
  });
});

describe('drainPhotoQueue', () => {
  it('uploads in order, writes the list once, then clears the job and its files', async () => {
    const { deps, disk } = fakeDeps(['a.jpg', 'b.jpg']);
    await savePhotoJob({
      ...VISIT,
      photos: [
        { kind: 'uploaded', url: 'https://storage/old' },
        { kind: 'local', file: 'a.jpg' },
        { kind: 'local', file: 'b.jpg' },
      ],
      removedUrls: [],
    });

    await drainPhotoQueue('u1', deps);

    expect(deps.upload.mock.calls.map(([, file]) => file)).toEqual(['a.jpg', 'b.jpg']);
    expect(deps.writePhotoUrls).toHaveBeenCalledTimes(1);
    expect(deps.writePhotoUrls.mock.calls[0][1]).toEqual([
      'https://storage/old',
      'https://storage/a.jpg',
      'https://storage/b.jpg',
    ]);
    expect(await readPhotoQueue()).toEqual({});
    expect(disk.size).toBe(0);
  });

  it('keeps a job whose upload fails and resumes it without re-uploading', async () => {
    const { deps } = fakeDeps(['a.jpg', 'b.jpg']);
    deps.upload
      .mockImplementationOnce(async (_job, file) => `https://storage/${file}`)
      .mockRejectedValueOnce(new Error('offline'));
    await savePhotoJob({
      ...VISIT,
      photos: [
        { kind: 'local', file: 'a.jpg' },
        { kind: 'local', file: 'b.jpg' },
      ],
      removedUrls: [],
    });

    await drainPhotoQueue('u1', deps);
    expect(deps.writePhotoUrls).not.toHaveBeenCalled();
    expect((await readPhotoQueue())[KEY].photos[0]).toMatchObject({ kind: 'uploaded' });

    await drainPhotoQueue('u1', deps);
    expect(deps.upload.mock.calls.map(([, file]) => file)).toEqual(['a.jpg', 'b.jpg', 'b.jpg']);
    expect(deps.writePhotoUrls).toHaveBeenCalledTimes(1);
    expect(await readPhotoQueue()).toEqual({});
  });

  it('writes the newer list when the visit is saved again mid-upload', async () => {
    const { deps } = fakeDeps(['a.jpg', 'b.jpg', 'c.jpg']);
    await savePhotoJob({
      ...VISIT,
      photos: [
        { kind: 'local', file: 'a.jpg' },
        { kind: 'local', file: 'b.jpg' },
      ],
      removedUrls: [],
    });
    // While a.jpg uploads, the user drops b.jpg and adds c.jpg.
    deps.upload.mockImplementationOnce(async (_job, file) => {
      await savePhotoJob({
        ...VISIT,
        photos: [
          { kind: 'local', file: 'a.jpg' },
          { kind: 'local', file: 'c.jpg' },
        ],
        removedUrls: [],
      });
      return `https://storage/${file}`;
    });

    await drainPhotoQueue('u1', deps);

    expect(deps.upload.mock.calls.map(([, file]) => file)).toEqual(['a.jpg', 'c.jpg']);
    expect(deps.writePhotoUrls.mock.calls.at(-1)?.[1]).toEqual([
      'https://storage/a.jpg',
      'https://storage/c.jpg',
    ]);
    expect(await readPhotoQueue()).toEqual({});
  });

  it('deletes removed photos after the write, and retries a failed delete later', async () => {
    const { deps } = fakeDeps([]);
    deps.deleteRemote.mockResolvedValueOnce(false);
    await savePhotoJob({
      ...VISIT,
      photos: [{ kind: 'uploaded', url: 'https://storage/keep' }],
      removedUrls: ['https://storage/gone'],
    });

    await drainPhotoQueue('u1', deps);
    expect(deps.writePhotoUrls).toHaveBeenCalledTimes(1);
    expect((await readPhotoQueue())[KEY].removedUrls).toEqual(['https://storage/gone']);

    await drainPhotoQueue('u1', deps);
    expect(deps.writePhotoUrls).toHaveBeenCalledTimes(1);
    expect(await readPhotoQueue()).toEqual({});
  });

  it('drops a waiting photo whose file is gone instead of retrying it forever', async () => {
    const { deps } = fakeDeps(['a.jpg']);
    await savePhotoJob({
      ...VISIT,
      photos: [
        { kind: 'local', file: 'a.jpg' },
        { kind: 'local', file: 'lost.jpg' },
      ],
      removedUrls: [],
    });

    await drainPhotoQueue('u1', deps);

    expect(deps.writePhotoUrls.mock.calls[0][1]).toEqual(['https://storage/a.jpg']);
    expect(await readPhotoQueue()).toEqual({});
  });

  it("leaves another user's jobs alone", async () => {
    const { deps } = fakeDeps(['a.jpg']);
    await savePhotoJob({
      ...VISIT,
      uid: 'someone-else',
      photos: [{ kind: 'local', file: 'a.jpg' }],
      removedUrls: [],
    });

    await drainPhotoQueue('u1', deps);

    expect(deps.upload).not.toHaveBeenCalled();
    expect(Object.keys(await readPhotoQueue())).toHaveLength(1);
  });

  it('deletes an upload that finishes after its visit was discarded', async () => {
    const { deps } = fakeDeps(['a.jpg']);
    await savePhotoJob({ ...VISIT, photos: [{ kind: 'local', file: 'a.jpg' }], removedUrls: [] });
    deps.upload.mockImplementationOnce(async (_job, file) => {
      await discardPhotoJobs(() => true);
      return `https://storage/${file}`;
    });

    await drainPhotoQueue('u1', deps);

    expect(deps.deleteRemote).toHaveBeenCalledWith('https://storage/a.jpg');
    expect(deps.writePhotoUrls).not.toHaveBeenCalled();
  });
});
