import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { get, ref, remove, set } from 'firebase/database';

/**
 * Realtime Database rules: RTDB exists solely for the journey website's
 * "N people viewing now" presence counter (ADR-009 scope). The rules must
 * allow exactly the presence pattern for anonymous viewers and nothing else.
 */

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'kyuhachi-test',
    database: {
      rules: readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8'),
      host: 'localhost',
      port: 9000,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

afterEach(async () => {
  await testEnv.clearDatabase();
});

function unauthDb() {
  return testEnv.unauthenticatedContext().database();
}

describe('presence', () => {
  test('anonymous viewer: mark presence allowed', async () => {
    await assertSucceeds(set(ref(unauthDb(), 'presence/session-1'), true));
  });

  test('anonymous viewer: remove own presence allowed (onDisconnect path)', async () => {
    await assertSucceeds(set(ref(unauthDb(), 'presence/session-1'), true));
    await assertSucceeds(remove(ref(unauthDb(), 'presence/session-1')));
  });

  test('anonymous viewer: read the presence list allowed (the counter)', async () => {
    await assertSucceeds(get(ref(unauthDb(), 'presence')));
  });

  test('presence value other than true denied', async () => {
    await assertFails(set(ref(unauthDb(), 'presence/session-1'), 'garbage'));
    await assertFails(set(ref(unauthDb(), 'presence/session-1'), { nested: true }));
    await assertFails(set(ref(unauthDb(), 'presence/session-1'), 42));
  });

  test('writing the whole presence node denied', async () => {
    await assertFails(set(ref(unauthDb(), 'presence'), { a: true }));
  });
});

describe('everything else', () => {
  test('root read denied', async () => {
    await assertFails(get(ref(unauthDb(), '/')));
  });

  test('arbitrary path write denied', async () => {
    await assertFails(set(ref(unauthDb(), 'chat/msg-1'), 'hello'));
    await assertFails(set(ref(unauthDb(), 'views'), 1));
  });

  test('arbitrary path read denied', async () => {
    await assertFails(get(ref(unauthDb(), 'chat')));
  });
});
