import { Text } from 'react-native';
import { render, screen, waitFor, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { onSnapshot, getDocsFromServer } from '@react-native-firebase/firestore';
import { OnsenCatalogProvider, useOnsenCatalog } from '@/context/OnsenCatalogContext';
import { storeCatalog, loadStoredCatalog, toCachedOnsen } from '@/lib/catalog-store';
import { onsenDoc } from '@/lib/__fixtures__/onsen-doc';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('@/firebase', () => ({ db: {} }));
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'u1' }, isLoading: false }),
}));
jest.mock('expo-image', () => ({ Image: { prefetch: jest.fn() } }));
jest.mock('@react-native-firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  onSnapshot: jest.fn(),
  getDocsFromServer: jest.fn(),
}));

const mockOnSnapshot = onSnapshot as jest.Mock;
const mockGetDocsFromServer = getDocsFromServer as jest.Mock;
const mockPrefetch = Image.prefetch as jest.Mock;

/** What the /catalog_meta/current listener would deliver. */
function metaSnapshot(version: number, fromCache = false) {
  return {
    exists: () => true,
    data: () => ({ version, publishedAt: null, totalCount: 2, activeCount: 2 }),
    metadata: { fromCache, hasPendingWrites: false },
  };
}

/** Fire the captured meta listener: onSnapshot(ref, options, next, error). */
async function fireMeta(version: number, fromCache = false) {
  const next = mockOnSnapshot.mock.calls[0][2];
  await act(async () => {
    next(metaSnapshot(version, fromCache));
  });
}

/** A getDocsFromServer result over full OnsenDocuments. */
function serverDocs(entries: Record<string, ReturnType<typeof onsenDoc>>) {
  return {
    docs: Object.entries(entries).map(([id, data]) => ({ id, data: () => data })),
  };
}

function Probe() {
  const { onsens, version, loading } = useOnsenCatalog();
  return (
    <>
      <Text testID="loading">{String(loading)}</Text>
      <Text testID="version">{String(version)}</Text>
      <Text testID="names">{onsens.map((o) => o.name).join('|')}</Text>
    </>
  );
}

function renderProvider() {
  return render(
    <OnsenCatalogProvider>
      <Probe />
    </OnsenCatalogProvider>
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockOnSnapshot.mockReturnValue(jest.fn());
  await AsyncStorage.clear();
});

it('serves the stored catalog and skips the network when the published version matches', async () => {
  await storeCatalog({
    version: 2,
    fetchedAt: 1,
    onsens: [toCachedOnsen('a', onsenDoc({ name: '竹瓦温泉' }))],
  });

  renderProvider();
  await waitFor(() => expect(screen.getByTestId('version')).toHaveTextContent('2'));
  expect(screen.getByTestId('loading')).toHaveTextContent('false');
  expect(screen.getByTestId('names')).toHaveTextContent('竹瓦温泉');

  await fireMeta(2);
  expect(mockGetDocsFromServer).not.toHaveBeenCalled();
});

it('re-syncs from the server when a newer catalog version is published', async () => {
  await storeCatalog({
    version: 2,
    fetchedAt: 1,
    onsens: [toCachedOnsen('a', onsenDoc({ name: '旧温泉' }))],
  });
  mockGetDocsFromServer.mockResolvedValue(
    serverDocs({
      a: onsenDoc({ name: '新温泉', imageUrl: 'https://img.example/a.jpg' }),
      b: onsenDoc({ name: '別温泉' }),
    })
  );

  renderProvider();
  await waitFor(() => expect(screen.getByTestId('version')).toHaveTextContent('2'));

  await fireMeta(3);
  await waitFor(() => expect(screen.getByTestId('version')).toHaveTextContent('3'));
  // Same area, so ordered by name code points: 別 (U+5225) before 新 (U+65B0).
  expect(screen.getByTestId('names')).toHaveTextContent('別温泉|新温泉');

  // The new snapshot is persisted for the next (possibly offline) launch, and
  // its photos are handed to the disk prefetcher.
  await waitFor(async () => expect((await loadStoredCatalog())?.version).toBe(3));
  expect(mockPrefetch).toHaveBeenCalledWith(['https://img.example/a.jpg'], {
    cachePolicy: 'disk',
  });
});

it('keeps the existing catalog when a sync returns no documents', async () => {
  await storeCatalog({
    version: 2,
    fetchedAt: 1,
    onsens: [toCachedOnsen('a', onsenDoc({ name: '旧温泉' }))],
  });
  mockGetDocsFromServer.mockResolvedValue({ docs: [] });

  renderProvider();
  await waitFor(() => expect(screen.getByTestId('version')).toHaveTextContent('2'));

  await fireMeta(3);
  await waitFor(() => expect(mockGetDocsFromServer).toHaveBeenCalled());
  expect(screen.getByTestId('version')).toHaveTextContent('2');
  expect(screen.getByTestId('names')).toHaveTextContent('旧温泉');
});

it('settles (not loading, empty) when the first-ever sync fails offline', async () => {
  mockGetDocsFromServer.mockRejectedValue(new Error('unavailable'));

  renderProvider();
  await waitFor(() => expect(mockOnSnapshot).toHaveBeenCalled());

  await fireMeta(1, true);
  await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
  expect(screen.getByTestId('version')).toHaveTextContent('null');
  expect(screen.queryByText(/温泉/)).toBeNull();
});
