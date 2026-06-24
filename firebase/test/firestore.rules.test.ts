import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'kyuhachi-test',
    firestore: {
      rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
      host: 'localhost',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function unauthDb() {
  return testEnv.unauthenticatedContext().firestore();
}

function authDb(uid: string) {
  return testEnv.authenticatedContext(uid).firestore();
}

// ---------------------------------------------------------------------------
// /onsens
// ---------------------------------------------------------------------------

describe('onsens', () => {
  test('unauthenticated: read denied', async () => {
    await assertFails(getDoc(doc(unauthDb(), 'onsens/onsen-1')));
  });

  test('authenticated: read allowed', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'onsens/onsen-1'), { name: 'Test Onsen' });
    });
    await assertSucceeds(getDoc(doc(authDb('user-1'), 'onsens/onsen-1')));
  });

  test('authenticated: write denied', async () => {
    await assertFails(setDoc(doc(authDb('user-1'), 'onsens/onsen-1'), { name: 'Test' }));
  });

  test('authenticated: delete denied', async () => {
    await assertFails(deleteDoc(doc(authDb('user-1'), 'onsens/onsen-1')));
  });
});

// ---------------------------------------------------------------------------
// /catalog_meta
// ---------------------------------------------------------------------------

describe('catalog_meta', () => {
  test('unauthenticated: read denied', async () => {
    await assertFails(getDoc(doc(unauthDb(), 'catalog_meta/current')));
  });

  test('authenticated: read allowed', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'catalog_meta/current'), { version: 1 });
    });
    await assertSucceeds(getDoc(doc(authDb('user-1'), 'catalog_meta/current')));
  });

  test('authenticated: write denied', async () => {
    await assertFails(setDoc(doc(authDb('user-1'), 'catalog_meta/current'), { version: 999 }));
  });
});

// ---------------------------------------------------------------------------
// /challenge_types
// ---------------------------------------------------------------------------

describe('challenge_types', () => {
  test('unauthenticated: read denied', async () => {
    await assertFails(getDoc(doc(unauthDb(), 'challenge_types/kyushu-88')));
  });

  test('authenticated: read allowed', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'challenge_types/kyushu-88'), { name: 'Kyushu 88' });
    });
    await assertSucceeds(getDoc(doc(authDb('user-1'), 'challenge_types/kyushu-88')));
  });

  test('authenticated: write denied', async () => {
    await assertFails(
      setDoc(doc(authDb('user-1'), 'challenge_types/kyushu-88'), { name: 'Hacked' })
    );
  });
});

// ---------------------------------------------------------------------------
// /users/{userId}
// ---------------------------------------------------------------------------

describe('users', () => {
  test('owner: read own document allowed', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/user-1'), { displayName: 'Alice' });
    });
    await assertSucceeds(getDoc(doc(authDb('user-1'), 'users/user-1')));
  });

  test('owner: write own document allowed', async () => {
    await assertSucceeds(
      setDoc(doc(authDb('user-1'), 'users/user-1'), { displayName: 'Alice' })
    );
  });

  test('other user: read denied', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/user-1'), { displayName: 'Alice' });
    });
    await assertFails(getDoc(doc(authDb('user-2'), 'users/user-1')));
  });

  test('other user: write denied', async () => {
    await assertFails(
      setDoc(doc(authDb('user-2'), 'users/user-1'), { displayName: 'Hacked' })
    );
  });

  test('unauthenticated: read denied', async () => {
    await assertFails(getDoc(doc(unauthDb(), 'users/user-1')));
  });
});

// ---------------------------------------------------------------------------
// /users/{userId}/challenges
// ---------------------------------------------------------------------------

describe('users/challenges', () => {
  const challengePath = 'users/user-1/challenges/challenge-1';

  test('owner: read own challenge allowed', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), challengePath), { name: 'My Challenge' });
    });
    await assertSucceeds(getDoc(doc(authDb('user-1'), challengePath)));
  });

  test('owner: write own challenge allowed', async () => {
    await assertSucceeds(
      setDoc(doc(authDb('user-1'), challengePath), { name: 'My Challenge' })
    );
  });

  test('other user: read denied', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), challengePath), { name: 'My Challenge' });
    });
    await assertFails(getDoc(doc(authDb('user-2'), challengePath)));
  });

  test('other user: write denied', async () => {
    await assertFails(
      setDoc(doc(authDb('user-2'), challengePath), { name: 'Hacked' })
    );
  });

  test('owner: create with null earnedTier allowed', async () => {
    await assertSucceeds(
      setDoc(doc(authDb('user-1'), challengePath), { name: 'My Challenge', earnedTier: null })
    );
  });

  test('owner: create with a non-null earnedTier denied', async () => {
    await assertFails(
      setDoc(doc(authDb('user-1'), challengePath), { name: 'My Challenge', earnedTier: 'gold' })
    );
  });

  test('owner: update other fields (not earnedTier) allowed', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), challengePath), {
        name: 'My Challenge',
        earnedTier: null,
        activeRouteId: null,
      });
    });
    await assertSucceeds(
      updateDoc(doc(authDb('user-1'), challengePath), { name: 'Renamed', activeRouteId: 'route-9' })
    );
  });

  test('owner: cannot change earnedTier (claim is server-only)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), challengePath), { name: 'My Challenge', earnedTier: null });
    });
    await assertFails(
      updateDoc(doc(authDb('user-1'), challengePath), { earnedTier: 'gold' })
    );
  });
});

// ---------------------------------------------------------------------------
// /users/{userId}/challenges/{challengeId}/visits
// ---------------------------------------------------------------------------

describe('users/challenges/visits', () => {
  const visitPath = 'users/user-1/challenges/challenge-1/visits/onsen-abc';

  test('owner: read own visit allowed', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), visitPath), { visitedAt: new Date() });
    });
    await assertSucceeds(getDoc(doc(authDb('user-1'), visitPath)));
  });

  test('owner: create visit allowed', async () => {
    await assertSucceeds(
      setDoc(doc(authDb('user-1'), visitPath), { notes: null })
    );
  });

  test('owner: overwrite visit allowed (deduplication is structural)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), visitPath), { notes: 'first' });
    });
    await assertSucceeds(
      setDoc(doc(authDb('user-1'), visitPath), { notes: 'second' })
    );
  });

  test('other user: read denied', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), visitPath), { visitedAt: new Date() });
    });
    await assertFails(getDoc(doc(authDb('user-2'), visitPath)));
  });

  test('other user: write denied', async () => {
    await assertFails(
      setDoc(doc(authDb('user-2'), visitPath), { notes: 'hacked' })
    );
  });

  test('unauthenticated: read denied', async () => {
    await assertFails(getDoc(doc(unauthDb(), visitPath)));
  });
});

// ---------------------------------------------------------------------------
// /users/{userId}/routes
// ---------------------------------------------------------------------------

describe('users/routes', () => {
  const routePath = 'users/user-1/routes/route-1';

  test('owner: read own route allowed', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), routePath), { name: 'My Route' });
    });
    await assertSucceeds(getDoc(doc(authDb('user-1'), routePath)));
  });

  test('owner: write own route allowed', async () => {
    await assertSucceeds(
      setDoc(doc(authDb('user-1'), routePath), { name: 'My Route', points: [] })
    );
  });

  test('other user: read denied', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), routePath), { name: 'My Route' });
    });
    await assertFails(getDoc(doc(authDb('user-2'), routePath)));
  });

  test('other user: write denied', async () => {
    await assertFails(
      setDoc(doc(authDb('user-2'), routePath), { name: 'Hacked' })
    );
  });
});
