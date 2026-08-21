// Imported explicitly rather than relying on ambient @types/jest: Functions is
// installed standalone in CI, with no parent node_modules to pick those up from.
import { describe, expect, it } from '@jest/globals';
import { effectiveEligibleSet } from '../tier';

/**
 * The server half of ADR-010. These mirror the shared-package tests in the
 * app; the two implementations are kept in sync by hand (Functions cannot
 * import `@kyuhachi/shared`), so each side pins its own behaviour.
 */
describe('effectiveEligibleSet', () => {
  it('keeps a snapshot onsen eligible after it leaves the live pool', () => {
    expect(effectiveEligibleSet(['a', 'b'], ['b', 'c']).has('a')).toBe(true);
  });

  it('counts a live-pool addition immediately', () => {
    const pool = effectiveEligibleSet(['a', 'b'], ['b', 'c']);
    expect(pool.has('c')).toBe(true);
    expect(pool.size).toBe(3);
  });

  it('degrades to the snapshot alone when the type has no pool', () => {
    expect([...effectiveEligibleSet(['a', 'b'], undefined)]).toEqual(['a', 'b']);
  });
});
