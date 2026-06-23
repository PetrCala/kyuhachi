import { render, screen } from '@testing-library/react-native';
import type { ActiveChallengeProgress } from '@/hooks/useActiveChallengeProgress';
import { useActiveChallengeProgress } from '@/hooks/useActiveChallengeProgress';
import Stats from '../../app/(tabs)/stats';

// Translate keys to themselves (interpolating {{vars}}) so assertions can match
// on stable keys + the real formatted yen values from the screen's compute path.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts
        ? Object.keys(opts).reduce(
            (out, k) => out.replace(new RegExp(`{{${k}}}`, 'g'), String(opts[k])),
            key
          )
        : key,
  }),
}));

jest.mock('@/hooks/useActiveChallengeProgress', () => ({
  useActiveChallengeProgress: jest.fn(),
}));

const mockHook = useActiveChallengeProgress as jest.Mock;

function mockProgress(overrides: Partial<ActiveChallengeProgress>): void {
  mockHook.mockReturnValue({
    loading: false,
    challenge: null,
    completionCount: null,
    visitedIds: new Set<string>(),
    visits: new Map(),
    onsenMap: new Map(),
    ...overrides,
  } as unknown as ActiveChallengeProgress);
}

describe('Stats screen', () => {
  afterEach(() => mockHook.mockReset());

  it('renders the budget cards and breakdowns from visit data', () => {
    mockProgress({
      challenge: { snapshotEligibleOnsenIds: ['a', 'b', 'c', 'd'] } as never,
      completionCount: 3,
      visitedIds: new Set(['a', 'b']),
      visits: new Map<string, never>([
        ['a', { structuredData: { transportMode: 'foot' } } as never],
        ['b', { structuredData: { transportMode: 'car' } } as never],
      ]),
      onsenMap: new Map<string, never>([
        ['a', { name: 'A', areaName: '', prefecture: '大分県', lat: 0, lng: 0, adultFee: 500 } as never],
        ['b', { name: 'B', areaName: '', prefecture: '大分県', lat: 0, lng: 0, adultFee: 300 } as never],
        ['c', { name: 'C', areaName: '', prefecture: '熊本県', lat: 0, lng: 0, adultFee: 200 } as never],
        ['d', { name: 'D', areaName: '', prefecture: '熊本県', lat: 0, lng: 0, adultFee: null } as never],
      ]),
    });

    render(<Stats />);

    // Projected total = 800 spent + 200 (cheapest unvisited) ; avg = 800 / 2.
    expect(screen.getByText('¥1,000')).toBeTruthy();
    expect(screen.getByText('¥400')).toBeTruthy();
    // Prefecture label is Firestore data, shown untranslated.
    expect(screen.getByText('大分県')).toBeTruthy();
    // Transport rows for the two reported modes.
    expect(screen.getByText('stats.transport.foot')).toBeTruthy();
    expect(screen.getByText('stats.transport.car')).toBeTruthy();
    // Priced-coverage note + the "by prefecture" section header are present.
    expect(screen.getByText('stats.pricedNote')).toBeTruthy();
    expect(screen.getByText('stats.byPrefecture')).toBeTruthy();
  });

  it('shows the empty state with no active challenge', () => {
    mockProgress({ challenge: null });
    render(<Stats />);
    expect(screen.getByText('stats.empty')).toBeTruthy();
  });
});
