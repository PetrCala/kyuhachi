import { render, screen } from '@testing-library/react-native';
import { useActiveChallengeProgress } from '@/hooks/useActiveChallengeProgress';
import { useOnsenCatalog } from '@/context/OnsenCatalogContext';

import OnsenBrowse from '../../app/(tabs)/onsens';

// The list's search box and the preferences it reads both touch AsyncStorage.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('expo-router', () => ({ Tabs: { Screen: () => null }, router: { push: jest.fn() } }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

jest.mock('@/hooks/useActiveChallengeProgress', () => ({
  useActiveChallengeProgress: jest.fn(),
}));
jest.mock('@/context/OnsenCatalogContext', () => ({ useOnsenCatalog: jest.fn() }));
jest.mock('@/context/FavoritesContext', () => ({
  useFavorites: () => ({ favoriteIds: new Set<string>() }),
}));
// No nearby section: this exercises the visited/unvisited ordering only.
jest.mock('@/context/PreferencesContext', () => ({
  usePreferences: () => ({
    showNearby: false,
    nearRadiusKm: 20,
    showReadings: false,
    loaded: true,
  }),
}));

const mockProgress = useActiveChallengeProgress as jest.Mock;
const mockCatalog = useOnsenCatalog as jest.Mock;

const onsen = (id: string, name: string) => ({
  id,
  name,
  nameKana: null,
  nameRomaji: null,
  areaName: 'Beppu',
  prefecture: 'Oita',
  lat: 33.28,
  lng: 131.5,
  isActive: true,
});

const CATALOG = [onsen('a', 'Onsen A'), onsen('b', 'Onsen B')];

afterEach(() => {
  mockProgress.mockReset();
  mockCatalog.mockReset();
});

describe('Onsens tab first paint', () => {
  // Visited state decides which block a row lands in, so painting the list
  // before the visits resolve would show one order and then re-shuffle.
  it('waits for the visits to load before rendering rows', () => {
    mockCatalog.mockReturnValue({ activeOnsens: CATALOG, loading: false });
    mockProgress.mockReturnValue({ visitedIds: new Set<string>(), loading: true });

    render(<OnsenBrowse />);

    expect(screen.queryByText('Onsen A')).toBeNull();
  });

  it('renders once the catalog and the visits are both resolved', () => {
    mockCatalog.mockReturnValue({ activeOnsens: CATALOG, loading: false });
    mockProgress.mockReturnValue({ visitedIds: new Set(['b']), loading: false });

    render(<OnsenBrowse />);

    expect(screen.getByText('Onsen A')).toBeTruthy();
    expect(screen.getByText('Onsen B')).toBeTruthy();
  });
});
