import { challengeRouteAction } from '../route-challenge';

describe('challengeRouteAction', () => {
  it('returns null when there is no active challenge', () => {
    expect(challengeRouteAction('r1', null, null)).toBeNull();
    expect(challengeRouteAction('r1', null, 'r1')).toBeNull();
  });

  it('offers "use in challenge" for a route that is not attached', () => {
    expect(challengeRouteAction('r1', 'c1', null)).toEqual({
      labelKey: 'routes.useInChallenge',
      nextActiveRouteId: 'r1',
    });
    expect(challengeRouteAction('r1', 'c1', 'r2')).toEqual({
      labelKey: 'routes.useInChallenge',
      nextActiveRouteId: 'r1',
    });
  });

  it('offers "remove from challenge" for the currently attached route', () => {
    expect(challengeRouteAction('r1', 'c1', 'r1')).toEqual({
      labelKey: 'routes.removeFromChallenge',
      nextActiveRouteId: null,
    });
  });
});
