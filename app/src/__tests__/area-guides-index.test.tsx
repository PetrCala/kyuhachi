import { render, screen, fireEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { useAreaGuides } from '@/context/AreaGuideContext';
import { useUserLocation } from '@/hooks/useUserLocation';
import { toCachedAreaGuide } from '@/lib/area-guide-store';
import { areaGuideDoc } from '@/lib/__fixtures__/area-guide-doc';

import AreaGuidesScreen from '../../app/area-guides/index';

// toCachedAreaGuide (via area-guide-store) pulls in AsyncStorage at module load.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Header/icons render as no-ops; router.push is a spy.
jest.mock('expo-router', () => ({ Stack: { Screen: () => null }, router: { push: jest.fn() } }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

// t returns the key; language is English so pickLocalized yields the en names.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

// Drive the two data hooks per test.
jest.mock('@/context/AreaGuideContext', () => ({ useAreaGuides: jest.fn() }));
jest.mock('@/context/OnsenCatalogContext', () => ({
  useOnsenCatalog: () => ({ activeOnsens: [] }),
}));
jest.mock('@/hooks/useUserLocation', () => ({ useUserLocation: jest.fn(() => null) }));
// A fixed dev coordinate just north of Beppu, so the nearest region is Beppu.
jest.mock('@/lib/dev-location', () => ({
  simulatedCoordinate: () => ({ latitude: 33.3, longitude: 131.49 }),
}));

const mockGuides = useAreaGuides as jest.Mock;
const mockLocation = useUserLocation as jest.Mock;
const mockPush = router.push as jest.Mock;

const beppu = toCachedAreaGuide(
  'beppu',
  areaGuideDoc({ name: { en: 'Beppu', ja: '別府' }, center: { lat: 33.28, lng: 131.5 } })
);
const aso = toCachedAreaGuide(
  'aso',
  areaGuideDoc({ name: { en: 'Aso', ja: '阿蘇' }, tagline: undefined, center: { lat: 32.88, lng: 131.1 } })
);
const yufuin = toCachedAreaGuide(
  'yufuin',
  areaGuideDoc({ name: { en: 'Yufuin', ja: '由布院' }, center: { lat: 33.26, lng: 131.36 } })
);

function loaded(guides = [yufuin, beppu, aso]) {
  return { guides, guideMap: new Map(guides.map((g) => [g.id, g])), version: 1, loading: false };
}

const realDev = (globalThis as { __DEV__?: boolean }).__DEV__;
afterEach(() => {
  mockGuides.mockReset();
  mockLocation.mockReset();
  mockPush.mockClear();
  (globalThis as { __DEV__?: boolean }).__DEV__ = realDev;
});

describe('Area guides browse screen', () => {
  it('lists every region by name with the nearest pinned as "your area"', () => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = true; // dev = simulated location
    mockGuides.mockReturnValue(loaded());

    render(<AreaGuidesScreen />);

    expect(screen.getByText('areaGuide.yourArea')).toBeTruthy();
    expect(screen.getByText('areaGuide.allRegions')).toBeTruthy();
    // Beppu is nearest, so it appears twice: the pinned card and its list row.
    expect(screen.getAllByText('Beppu')).toHaveLength(2);
    expect(screen.getByText('Aso')).toBeTruthy();
    expect(screen.getByText('Yufuin')).toBeTruthy();
  });

  it('opens the by-id route from the card and from a row', () => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    mockGuides.mockReturnValue(loaded());

    render(<AreaGuidesScreen />);

    fireEvent.press(screen.getByTestId('area-your-area'));
    expect(mockPush).toHaveBeenCalledWith('/area-guides/beppu');

    fireEvent.press(screen.getByTestId('area-region-aso'));
    expect(mockPush).toHaveBeenCalledWith('/area-guides/aso');
  });

  it('omits the "your area" card when there is no location', () => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = false; // prod path uses useUserLocation
    mockLocation.mockReturnValue(null);
    mockGuides.mockReturnValue(loaded());

    render(<AreaGuidesScreen />);

    expect(screen.queryByText('areaGuide.yourArea')).toBeNull();
    expect(screen.queryByTestId('area-your-area')).toBeNull();
    // The list still renders; browsing never requires location.
    expect(screen.getByText('areaGuide.allRegions')).toBeTruthy();
    expect(screen.getByText('Beppu')).toBeTruthy();
  });

  it('shows a spinner while loading with no cached guides', () => {
    mockGuides.mockReturnValue({ guides: [], guideMap: new Map(), version: null, loading: true });
    render(<AreaGuidesScreen />);
    expect(screen.getByTestId('area-loading')).toBeTruthy();
  });

  it('shows the empty state when no guides are published', () => {
    mockGuides.mockReturnValue({ guides: [], guideMap: new Map(), version: 1, loading: false });
    render(<AreaGuidesScreen />);
    expect(screen.getByText('areaGuide.empty')).toBeTruthy();
  });
});
