import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'kyuhachi-test',
    storage: {
      rules: readFileSync(new URL('../storage.rules', import.meta.url), 'utf8'),
      host: 'localhost',
      port: 9199,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

afterEach(async () => {
  await testEnv.clearStorage();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function unauthStorage() {
  return testEnv.unauthenticatedContext().storage();
}

function authStorage(uid: string) {
  return testEnv.authenticatedContext(uid).storage();
}

/** A byte payload of exactly `bytes` length. Content is irrelevant to the rules. */
function payload(bytes: number): Uint8Array {
  return new Uint8Array(bytes);
}

const MB = 1024 * 1024;

// The app's real upload path: visits/{uid}/{challengeId}_{visitId}/{name}
// (see uploadPhotoFile in app/app/onsens/edit-visit.tsx).
const photoPath = 'visits/user-1/challenge-1_onsen-abc/photo_1_0.jpg';

/** Seeds an object at `path`, bypassing rules, so reads and deletes have a target. */
async function seed(path: string, bytes = 1024) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(ctx.storage(), path), payload(bytes));
  });
}

// ---------------------------------------------------------------------------
// /visits/{userId}/{visitId}/{fileName}
// ---------------------------------------------------------------------------

describe('visits photos', () => {
  test('owner: upload a normal photo allowed', async () => {
    await assertSucceeds(uploadBytes(ref(authStorage('user-1'), photoPath), payload(2 * MB)));
  });

  test('owner: read own photo allowed', async () => {
    await seed(photoPath);
    await assertSucceeds(getBytes(ref(authStorage('user-1'), photoPath)));
  });

  /**
   * The reason create/update and delete are separate rules. In Storage rules
   * `write` covers delete, and request.resource is null on a delete, so folding
   * the size check into a single `allow write` would deny every delete. The app
   * deletes whenever a photo is removed from a visit, so this must keep working.
   */
  test('owner: delete own photo allowed (size check must not apply)', async () => {
    await seed(photoPath);
    await assertSucceeds(deleteObject(ref(authStorage('user-1'), photoPath)));
  });

  test('owner: overwrite own photo allowed', async () => {
    await seed(photoPath);
    await assertSucceeds(uploadBytes(ref(authStorage('user-1'), photoPath), payload(1 * MB)));
  });

  // The cap itself. 10MB is the ceiling, so just over it must fail.
  test('owner: upload over the 10MB ceiling denied', async () => {
    await assertFails(uploadBytes(ref(authStorage('user-1'), photoPath), payload(11 * MB)));
  });

  test('owner: upload just under the 10MB ceiling allowed', async () => {
    await assertSucceeds(
      uploadBytes(ref(authStorage('user-1'), photoPath), payload(10 * MB - 1024))
    );
  });

  /**
   * No contentType condition exists, on purpose: the client sets that header, so
   * it stops no abuser, while RNFirebase can legitimately send
   * application/octet-stream when it cannot derive a type from the source URI's
   * extension. This pins that a non-image type is NOT what the rule filters on,
   * so nobody reintroduces the check without also weighing the photo-loss risk.
   */
  test('owner: upload allowed regardless of contentType', async () => {
    await assertSucceeds(
      uploadBytes(ref(authStorage('user-1'), photoPath), payload(1024), {
        contentType: 'application/octet-stream',
      })
    );
  });

  test('other user: upload to a foreign prefix denied', async () => {
    await assertFails(uploadBytes(ref(authStorage('user-2'), photoPath), payload(1024)));
  });

  test('other user: read denied', async () => {
    await seed(photoPath);
    await assertFails(getBytes(ref(authStorage('user-2'), photoPath)));
  });

  test('other user: delete denied', async () => {
    await seed(photoPath);
    await assertFails(deleteObject(ref(authStorage('user-2'), photoPath)));
  });

  test('unauthenticated: read denied', async () => {
    await seed(photoPath);
    await assertFails(getBytes(ref(unauthStorage(), photoPath)));
  });

  test('unauthenticated: upload denied', async () => {
    await assertFails(uploadBytes(ref(unauthStorage(), photoPath), payload(1024)));
  });
});

// ---------------------------------------------------------------------------
// /onsen-images/{fileName}
// ---------------------------------------------------------------------------

/**
 * Pins the existing deny. Note what these tests can and cannot show: they cover
 * the Storage SDK surface, which is the only surface rules govern. They say
 * nothing about the tokenized download URLs, which Firebase serves regardless of
 * rules. See docs/storage-image-exposure.md.
 */
describe('onsen catalog images', () => {
  const imagePath = 'onsen-images/abc-123.webp';

  test('authenticated: read denied', async () => {
    await seed(imagePath);
    await assertFails(getBytes(ref(authStorage('user-1'), imagePath)));
  });

  test('authenticated: write denied', async () => {
    await assertFails(uploadBytes(ref(authStorage('user-1'), imagePath), payload(1024)));
  });

  test('unauthenticated: read denied', async () => {
    await seed(imagePath);
    await assertFails(getBytes(ref(unauthStorage(), imagePath)));
  });
});
