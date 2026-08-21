import { effectiveEligibleIds } from '@kyuhachi/shared';

/**
 * Pins the two invariants ADR-010 rests on. If either fails, a catalog publish
 * can once again change what counts under a running challenge.
 */
describe('effectiveEligibleIds', () => {
  it('keeps a snapshot onsen eligible after it leaves the live pool', () => {
    // 'a' was in the pool at creation and was later removed upstream.
    const pool = effectiveEligibleIds(['a', 'b'], ['b', 'c']);
    expect(pool.has('a')).toBe(true);
  });

  it('lets a live-pool addition count immediately', () => {
    // 'c' joined the pool after this challenge was created.
    const pool = effectiveEligibleIds(['a', 'b'], ['b', 'c']);
    expect(pool.has('c')).toBe(true);
    expect(pool.size).toBe(3);
  });

  it('degrades to the snapshot alone while the live pool is unloaded', () => {
    expect([...effectiveEligibleIds(['a', 'b'], null)]).toEqual(['a', 'b']);
    expect([...effectiveEligibleIds(['a', 'b'], undefined)]).toEqual(['a', 'b']);
  });

  it('is identity when the pools coincide, so shipping before the publish is a no-op', () => {
    const ids = ['a', 'b', 'c'];
    expect([...effectiveEligibleIds(ids, ids)]).toEqual(ids);
  });
});
