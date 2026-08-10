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
// /area_guides
// ---------------------------------------------------------------------------

describe('area_guides', () => {
  test('unauthenticated: read denied', async () => {
    await assertFails(getDoc(doc(unauthDb(), 'area_guides/area-1')));
  });

  test('authenticated: read allowed', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'area_guides/area-1'), { name: { en: 'Beppu', ja: '別府' } });
    });
    await assertSucceeds(getDoc(doc(authDb('user-1'), 'area_guides/area-1')));
  });

  test('authenticated: write denied', async () => {
    await assertFails(setDoc(doc(authDb('user-1'), 'area_guides/area-1'), { name: 'Hacked' }));
  });

  test('authenticated: delete denied', async () => {
    await assertFails(deleteDoc(doc(authDb('user-1'), 'area_guides/area-1')));
  });
});

// ---------------------------------------------------------------------------
// /area_guides_meta
// ---------------------------------------------------------------------------

describe('area_guides_meta', () => {
  test('unauthenticated: read denied', async () => {
    await assertFails(getDoc(doc(unauthDb(), 'area_guides_meta/current')));
  });

  test('authenticated: read allowed', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'area_guides_meta/current'), { version: 1 });
    });
    await assertSucceeds(getDoc(doc(authDb('user-1'), 'area_guides_meta/current')));
  });

  test('authenticated: write denied', async () => {
    await assertFails(setDoc(doc(authDb('user-1'), 'area_guides_meta/current'), { version: 999 }));
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

  test('unauthenticated: write denied', async () => {
    await assertFails(setDoc(doc(unauthDb(), 'users/user-1'), { displayName: 'Anon' }));
  });

  test('other user: update denied', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/user-1'), { defaultChallengeId: null });
    });
    await assertFails(
      updateDoc(doc(authDb('user-2'), 'users/user-1'), { defaultChallengeId: 'challenge-1' })
    );
  });

  test('other user: delete denied', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/user-1'), { displayName: 'Alice' });
    });
    await assertFails(deleteDoc(doc(authDb('user-2'), 'users/user-1')));
  });

  // The real client write path: switching, creating or deleting a challenge
  // repoints defaultChallengeId (app/app/challenge/list.tsx, preview.tsx).
  test('owner: update defaultChallengeId allowed', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/user-1'), { defaultChallengeId: null });
    });
    await assertSucceeds(
      updateDoc(doc(authDb('user-1'), 'users/user-1'), { defaultChallengeId: 'challenge-1' })
    );
  });

  // A challenge can be created before the onUserCreated Auth trigger has landed
  // the user document, so the client's set+merge has to work on a missing doc.
  test('owner: create own document allowed (before onUserCreated lands)', async () => {
    await assertSucceeds(
      setDoc(
        doc(authDb('user-1'), 'users/user-1'),
        { defaultChallengeId: 'challenge-1' },
        { merge: true }
      )
    );
  });

  /**
   * Pins the audited conclusion, not an aspiration: NO field on the user
   * document is trusted by client logic, by these rules, or by any Function.
   * The document holds displayName, email, defaultChallengeId and createdAt.
   * displayName/email are denormalized copies of the Auth record that nothing
   * reads back; defaultChallengeId only selects which of the owner's own
   * challenges the owner sees; no rule does a get() on this path and no
   * Function reads a field off it. There is no role, admin flag, entitlement,
   * or denormalized count here, so the blanket owner write grants nothing
   * beyond what the owner already has.
   *
   * If that ever stops being true, this test is the tripwire: adding a
   * server-only field means guarding it the way the challenges subcollection
   * guards earnedTier, which makes this assertion fail and forces the decision
   * to be made deliberately.
   */
  test('owner: no field on the user document is server-only', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/user-1'), {
        displayName: 'Alice',
        email: 'alice@example.com',
        defaultChallengeId: null,
      });
    });
    await assertSucceeds(
      updateDoc(doc(authDb('user-1'), 'users/user-1'), {
        displayName: 'Alice Renamed',
        email: 'someone-else@example.com',
      })
    );
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

  test('owner: create with a non-null earnedTierAt denied', async () => {
    await assertFails(
      setDoc(doc(authDb('user-1'), challengePath), { name: 'My Challenge', earnedTierAt: new Date() })
    );
  });

  test('owner: cannot change earnedTierAt (claim time is server-only)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), challengePath), {
        name: 'My Challenge',
        earnedTier: null,
        earnedTierAt: null,
      });
    });
    await assertFails(
      updateDoc(doc(authDb('user-1'), challengePath), { earnedTierAt: new Date() })
    );
  });

  // -------------------------------------------------------------------------
  // Frozen definition fields (ADR 003: snapshots are frozen at creation).
  //
  // These matter beyond tidiness: claimTier re-derives eligibility from
  // snapshotEligibleOnsenIds, typeId and startDate, so leaving them writable
  // would let the owner move the goalposts and then ask the server to bless the
  // result. See functions/src/util/tier.ts.
  // -------------------------------------------------------------------------

  /** A challenge as the client writes it at creation. */
  const seedChallenge = {
    typeId: 'kyushu-88',
    name: 'My Challenge',
    startDate: new Date('2026-01-01'),
    isDefault: true,
    snapshotEligibleOnsenIds: ['onsen-a', 'onsen-b'],
    snapshotCatalogVersion: 3,
    activeRouteId: null,
    earnedTier: null,
    earnedTierAt: null,
    completedAt: null,
    createdAt: new Date('2026-01-01'),
  };

  async function seed() {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), challengePath), seedChallenge);
    });
  }

  const frozen: [string, unknown][] = [
    ['typeId', 'kyushu-88-walk'],
    ['snapshotEligibleOnsenIds', ['onsen-a', 'onsen-b', 'onsen-forged']],
    ['snapshotCatalogVersion', 99],
    ['startDate', new Date('2020-01-01')],
    ['createdAt', new Date('2020-01-01')],
    ['completedAt', new Date('2026-06-01')],
  ];

  test.each(frozen)('owner: cannot change %s after creation', async (field, value) => {
    await seed();
    await assertFails(updateDoc(doc(authDb('user-1'), challengePath), { [field]: value }));
  });

  // The whole point of freezing the pool: widening it is the cheap half of
  // forging a tier (the other half, writing visit docs, the owner can already do).
  test('owner: cannot widen the eligible pool then claim against it', async () => {
    await seed();
    await assertFails(
      updateDoc(doc(authDb('user-1'), challengePath), {
        snapshotEligibleOnsenIds: [...seedChallenge.snapshotEligibleOnsenIds, 'onsen-forged'],
      })
    );
  });

  // The real client write paths must keep working: rename (challenge/list.tsx),
  // switch active (challenge/list.tsx), attach/clear a route (routes/index.tsx,
  // useActiveChallengeProgress.ts).
  test('owner: rename, re-default and re-route still allowed', async () => {
    await seed();
    await assertSucceeds(
      updateDoc(doc(authDb('user-1'), challengePath), {
        name: 'Renamed',
        isDefault: false,
        activeRouteId: 'route-9',
        updatedAt: new Date(),
      })
    );
  });

  // diff() reports only keys whose value actually changed, so a full-document
  // overwrite that carries the frozen fields through unchanged is fine. This is
  // what keeps the freeze from breaking any set() the client already does.
  test('owner: full overwrite preserving frozen fields allowed', async () => {
    await seed();
    await assertSucceeds(
      setDoc(doc(authDb('user-1'), challengePath), { ...seedChallenge, name: 'Renamed' })
    );
  });

  // The classic bypass: rather than editing a guarded field, drop it by
  // overwriting the document without it. Removing a key counts as an affected
  // key, so this is denied too.
  test('owner: full overwrite that drops a frozen field denied', async () => {
    await seed();
    const { snapshotEligibleOnsenIds: _dropped, ...withoutPool } = seedChallenge;
    await assertFails(setDoc(doc(authDb('user-1'), challengePath), withoutPool));
  });

  test('owner: full overwrite that drops earnedTier denied', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), challengePath), { ...seedChallenge, earnedTier: 'gold' });
    });
    const { earnedTier: _dropped, ...withoutTier } = seedChallenge;
    await assertFails(setDoc(doc(authDb('user-1'), challengePath), withoutTier));
  });

  test('unauthenticated: read denied', async () => {
    await seed();
    await assertFails(getDoc(doc(unauthDb(), challengePath)));
  });

  test('unauthenticated: write denied', async () => {
    await assertFails(setDoc(doc(unauthDb(), challengePath), { name: 'Anon' }));
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

  test('unauthenticated: write denied', async () => {
    await assertFails(setDoc(doc(unauthDb(), visitPath), { notes: 'anon' }));
  });

  test('other user: delete denied', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), visitPath), { visitedAt: new Date() });
    });
    await assertFails(deleteDoc(doc(authDb('user-2'), visitPath)));
  });

  // Un-recording a visit is a real client action (edit-visit.tsx), and the
  // delete trigger recomputes completedAt from what is left.
  test('owner: delete own visit allowed', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), visitPath), { visitedAt: new Date() });
    });
    await assertSucceeds(deleteDoc(doc(authDb('user-1'), visitPath)));
  });

  // Visits live under the challenge, so they must not be reachable through
  // another user's uid even when the challenge and onsen ids are guessed right.
  test('other user: cannot list visits under a challenge they do not own', async () => {
    await assertFails(
      getDocs(collection(authDb('user-2'), 'users/user-1/challenges/challenge-1/visits'))
    );
  });
});

// ---------------------------------------------------------------------------
// /users/{userId}/favorites
// ---------------------------------------------------------------------------

describe('users/favorites', () => {
  const favoritePath = 'users/user-1/favorites/onsen-abc';

  test('owner: read own favorite allowed', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), favoritePath), { createdAt: new Date() });
    });
    await assertSucceeds(getDoc(doc(authDb('user-1'), favoritePath)));
  });

  test('owner: create favorite allowed', async () => {
    await assertSucceeds(
      setDoc(doc(authDb('user-1'), favoritePath), { createdAt: new Date() })
    );
  });

  test('owner: delete favorite allowed', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), favoritePath), { createdAt: new Date() });
    });
    await assertSucceeds(deleteDoc(doc(authDb('user-1'), favoritePath)));
  });

  test('other user: read denied', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), favoritePath), { createdAt: new Date() });
    });
    await assertFails(getDoc(doc(authDb('user-2'), favoritePath)));
  });

  test('other user: write denied', async () => {
    await assertFails(
      setDoc(doc(authDb('user-2'), favoritePath), { createdAt: new Date() })
    );
  });

  test('unauthenticated: read denied', async () => {
    await assertFails(getDoc(doc(unauthDb(), favoritePath)));
  });

  test('unauthenticated: write denied', async () => {
    await assertFails(setDoc(doc(unauthDb(), favoritePath), { createdAt: new Date() }));
  });

  test('other user: delete denied', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), favoritePath), { createdAt: new Date() });
    });
    await assertFails(deleteDoc(doc(authDb('user-2'), favoritePath)));
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

  test('other user: delete denied', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), routePath), { name: 'My Route' });
    });
    await assertFails(deleteDoc(doc(authDb('user-2'), routePath)));
  });

  // Drag-reorder writes sortOrder across the list (routes/index.tsx).
  test('owner: reorder and delete own route allowed', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), routePath), { name: 'My Route', sortOrder: 0 });
    });
    await assertSucceeds(updateDoc(doc(authDb('user-1'), routePath), { sortOrder: 3 }));
    await assertSucceeds(deleteDoc(doc(authDb('user-1'), routePath)));
  });

  test('unauthenticated: read denied', async () => {
    await assertFails(getDoc(doc(unauthDb(), routePath)));
  });

  test('unauthenticated: write denied', async () => {
    await assertFails(setDoc(doc(unauthDb(), routePath), { name: 'Anon' }));
  });

  test('other user: cannot list routes they do not own', async () => {
    await assertFails(getDocs(collection(authDb('user-2'), 'users/user-1/routes')));
  });
});
