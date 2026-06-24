import { render, screen } from '@testing-library/react-native';
import type { ActiveChallengeProgress } from '@/hooks/useActiveChallengeProgress';
import { useActiveChallengeProgress } from '@/hooks/useActiveChallengeProgress';
import { days, onsen, visit } from '@/lib/stats/__fixtures__/factories';
import { ts } from '@/lib/stats/__fixtures__/factories';

import StatsHub from '../../app/stats/index';
import StatsBudget from '../../app/stats/budget';
import StatsProgress from '../../app/stats/progress';
import StatsGeography from '../../app/stats/geography';
import StatsTimeline from '../../app/stats/timeline';
import StatsTransport from '../../app/stats/transport';
import StatsExperience from '../../app/stats/experience';

// Screens set their header via <Stack.Screen>; render it (and icons / svg) as
// no-ops so the tests run under react-test-renderer without a navigator.
jest.mock('expo-router', () => ({ Stack: { Screen: () => null }, router: { push: jest.fn() } }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-svg', () => ({
  __esModule: true,
  default: 'Svg',
  Svg: 'Svg',
  Circle: 'Circle',
  G: 'G',
  Path: 'Path',
  Polyline: 'Polyline',
}));

// Keys translate to themselves (interpolating {{vars}}) so assertions can match
// stable keys and the real formatted yen from the compute path.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts
        ? Object.keys(opts).reduce(
            (out, k) => out.replace(new RegExp(`{{${k}}}`, 'g'), String(opts[k])),
            key
          )
        : key,
    i18n: { language: 'en' },
  }),
}));

// Mock the data source only; the real useStats + lib do the computing, so these
// are integration smoke tests through the whole stats pipeline.
jest.mock('@/hooks/useActiveChallengeProgress', () => ({
  useActiveChallengeProgress: jest.fn(),
}));
const mockHook = useActiveChallengeProgress as jest.Mock;

const BASE = {
  loading: false,
  hasChallenge: true,
  challengeId: 'c1',
  claiming: false,
  claimTier: jest.fn(),
  activeRoute: null,
  clearRoute: jest.fn(),
  selectRoute: jest.fn(),
  rows: [],
  tiers: [],
  ranks: [],
  currentRank: null,
  nextRank: null,
  eligibleTier: null,
};

function populated(): Partial<ActiveChallengeProgress> {
  const eligible = ['a', 'b', 'c', 'd'];
  return {
    ...BASE,
    challenge: { snapshotEligibleOnsenIds: eligible, startDate: ts(0), completedAt: null } as never,
    completionCount: 4,
    baseMode: 'foot',
    eligibleVisitCount: 3,
    distinctPrefectures: 2,
    visitedIds: new Set(['a', 'b', 'c']),
    visits: new Map<string, never>([
      [
        'a',
        visit({
          visitedAtMs: days(1),
          photoUrls: ['p'],
          data: {
            transportMode: 'foot',
            rating: 8,
            valueRating: 9,
            wouldReturn: true,
            duration: 60,
            perceivedHeat: 'hot',
            crowdLevel: 'quiet',
            visitedWith: 'alone',
            saunaUsed: true,
            saunaRating: 7,
            waterTemp: '42°C',
            interactedWithLocals: true,
            localInteractionRating: 6,
            hadSoap: true,
          },
        }) as never,
      ],
      ['b', visit({ visitedAtMs: days(2), data: { transportMode: 'car', rating: 6 } }) as never],
      ['c', visit({ visitedAtMs: days(40), data: { transportMode: 'public', rating: 7 } }) as never],
    ]),
    onsenMap: new Map<string, never>([
      ['a', onsen({ name: 'A', prefecture: '大分県', areaName: 'Beppu', lat: 33.3, lng: 131.5, adultFee: 500 }) as never],
      ['b', onsen({ name: 'B', prefecture: '大分県', areaName: 'Yufu', lat: 33.2, lng: 131.3, adultFee: 300 }) as never],
      ['c', onsen({ name: 'C', prefecture: '熊本県', areaName: 'Aso', lat: 32.9, lng: 131.0, adultFee: 200 }) as never],
      ['d', onsen({ name: 'D', prefecture: '熊本県', areaName: 'Aso', lat: 32.8, lng: 130.8, adultFee: null }) as never],
    ]),
  };
}

function empty(): Partial<ActiveChallengeProgress> {
  return {
    ...BASE,
    hasChallenge: false,
    challenge: null,
    completionCount: null,
    baseMode: null,
    eligibleVisitCount: 0,
    distinctPrefectures: 0,
    visitedIds: new Set<string>(),
    visits: new Map(),
    onsenMap: new Map(),
  };
}

function mock(overrides: Partial<ActiveChallengeProgress>): void {
  mockHook.mockReturnValue(overrides as unknown as ActiveChallengeProgress);
}

afterEach(() => mockHook.mockReset());

describe('Stats hub', () => {
  it('renders highlights and all six section cards', () => {
    mock(populated());
    render(<StatsHub />);
    expect(screen.getByText('stats.hub.highlightsTitle')).toBeTruthy();
    // The four highlight labels: projected finish, prefectures, rank, top-rated.
    expect(screen.getByText('stats.highlight.projectedFinish')).toBeTruthy();
    expect(screen.getByText('stats.highlight.prefectures')).toBeTruthy();
    expect(screen.getByText('stats.highlight.rank')).toBeTruthy();
    expect(screen.getByText('stats.highlight.topRated')).toBeTruthy();
    expect(screen.getByText('stats.progress.title')).toBeTruthy();
    expect(screen.getByText('stats.geography.title')).toBeTruthy();
    expect(screen.getByText('stats.timeline.title')).toBeTruthy();
    expect(screen.getByText('stats.transport.title')).toBeTruthy();
    expect(screen.getByText('stats.budget.title')).toBeTruthy();
    expect(screen.getByText('stats.experience.title')).toBeTruthy();
  });

  it('shows the empty state with no challenge', () => {
    mock(empty());
    render(<StatsHub />);
    expect(screen.getByText('stats.empty')).toBeTruthy();
  });
});

describe('Stats budget (migrated)', () => {
  it('renders aggregate cost cards and breakdowns from real compute', () => {
    mock(populated());
    render(<StatsBudget />);
    // spentSoFar = 500 + 300 + 200 = 1000; nothing priced remaining → projected = 1000.
    expect(screen.getAllByText('¥1,000').length).toBeGreaterThan(0);
    // avg = 1000 / 3 priced ≈ 333.
    expect(screen.getByText('¥333')).toBeTruthy();
    // Prefecture labels are untranslated Firestore data.
    expect(screen.getByText('大分県')).toBeTruthy();
    expect(screen.getByText('stats.byTransport')).toBeTruthy();
  });

  it('shows the empty state with no challenge', () => {
    mock(empty());
    render(<StatsBudget />);
    expect(screen.getByText('stats.empty')).toBeTruthy();
  });
});

describe('Stats detail screens render from compute', () => {
  it('progress shows its metrics', () => {
    mock(populated());
    render(<StatsProgress />);
    expect(screen.getByText('stats.progress.metricVisits')).toBeTruthy();
  });

  it('geography shows prefecture coverage', () => {
    mock(populated());
    render(<StatsGeography />);
    expect(screen.getByText('stats.geography.coverageTitle')).toBeTruthy();
  });

  it('timeline shows the cumulative section', () => {
    mock(populated());
    render(<StatsTimeline />);
    expect(screen.getByText('stats.timeline.cumulativeTitle')).toBeTruthy();
  });

  it('transport shows the mix section', () => {
    mock(populated());
    render(<StatsTransport />);
    expect(screen.getByText('stats.transport.mixTitle')).toBeTruthy();
  });

  it('experience shows the overall rating from reported visits', () => {
    mock(populated());
    render(<StatsExperience />);
    expect(screen.getByText('stats.experience.overallTitle')).toBeTruthy();
  });

  it('every detail screen falls back to the empty state with no challenge', () => {
    for (const Screen of [
      StatsProgress,
      StatsGeography,
      StatsTimeline,
      StatsTransport,
      StatsExperience,
    ]) {
      mock(empty());
      const { unmount } = render(<Screen />);
      expect(screen.getByText('stats.empty')).toBeTruthy();
      unmount();
    }
  });
});
