import { Text } from 'react-native';
import { render, screen, waitFor, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onSnapshot, getDocsFromServer } from '@react-native-firebase/firestore';
import { AreaGuideProvider, useAreaGuides } from '@/context/AreaGuideContext';
import { storeAreaGuides, loadStoredAreaGuides, toCachedAreaGuide } from '@/lib/area-guide-store';
import { areaGuideDoc } from '@/lib/__fixtures__/area-guide-doc';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('@/firebase', () => ({ db: {} }));
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'u1' }, isLoading: false }),
}));
jest.mock('@react-native-firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  onSnapshot: jest.fn(),
  getDocsFromServer: jest.fn(),
}));

const mockOnSnapshot = onSnapshot as jest.Mock;
const mockGetDocsFromServer = getDocsFromServer as jest.Mock;

/** What the /area_guides_meta/current listener would deliver. */
function metaSnapshot(version: number, fromCache = false) {
  return {
    exists: () => true,
    data: () => ({ version, publishedAt: null, totalCount: 1 }),
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

/** A getDocsFromServer result over full AreaGuideDocuments. */
function serverDocs(entries: Record<string, ReturnType<typeof areaGuideDoc>>) {
  return {
    docs: Object.entries(entries).map(([id, data]) => ({ id, data: () => data })),
  };
}

function Probe() {
  const { guides, version, loading } = useAreaGuides();
  return (
    <>
      <Text testID="loading">{String(loading)}</Text>
      <Text testID="version">{String(version)}</Text>
      <Text testID="ids">{guides.map((g) => g.id).join('|')}</Text>
    </>
  );
}

function renderProvider() {
  return render(
    <AreaGuideProvider>
      <Probe />
    </AreaGuideProvider>
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockOnSnapshot.mockReturnValue(jest.fn());
  await AsyncStorage.clear();
});

it('serves the stored guides and skips the network when the published version matches', async () => {
  await storeAreaGuides({
    version: 2,
    fetchedAt: 1,
    guides: [toCachedAreaGuide('beppu', areaGuideDoc())],
  });

  renderProvider();
  await waitFor(() => expect(screen.getByTestId('version')).toHaveTextContent('2'));
  expect(screen.getByTestId('loading')).toHaveTextContent('false');
  expect(screen.getByTestId('ids')).toHaveTextContent('beppu');

  await fireMeta(2);
  expect(mockGetDocsFromServer).not.toHaveBeenCalled();
});

it('re-syncs from the server when a newer version is published, and persists it', async () => {
  await storeAreaGuides({
    version: 2,
    fetchedAt: 1,
    guides: [toCachedAreaGuide('beppu', areaGuideDoc())],
  });
  mockGetDocsFromServer.mockResolvedValue(
    serverDocs({ beppu: areaGuideDoc(), yufuin: areaGuideDoc() })
  );

  renderProvider();
  await waitFor(() => expect(screen.getByTestId('version')).toHaveTextContent('2'));

  await fireMeta(3);
  await waitFor(() => expect(screen.getByTestId('version')).toHaveTextContent('3'));
  // Sorted by areaId.
  expect(screen.getByTestId('ids')).toHaveTextContent('beppu|yufuin');
  await waitFor(async () => expect((await loadStoredAreaGuides())?.version).toBe(3));
});

it('keeps the existing guides when a sync returns no documents', async () => {
  await storeAreaGuides({
    version: 2,
    fetchedAt: 1,
    guides: [toCachedAreaGuide('beppu', areaGuideDoc())],
  });
  mockGetDocsFromServer.mockResolvedValue({ docs: [] });

  renderProvider();
  await waitFor(() => expect(screen.getByTestId('version')).toHaveTextContent('2'));

  await fireMeta(3);
  await waitFor(() => expect(mockGetDocsFromServer).toHaveBeenCalled());
  expect(screen.getByTestId('version')).toHaveTextContent('2');
  expect(screen.getByTestId('ids')).toHaveTextContent('beppu');
});

it('settles (not loading, empty) when the first-ever sync fails offline', async () => {
  mockGetDocsFromServer.mockRejectedValue(new Error('unavailable'));

  renderProvider();
  await waitFor(() => expect(mockOnSnapshot).toHaveBeenCalled());

  await fireMeta(1, true);
  await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
  expect(screen.getByTestId('version')).toHaveTextContent('null');
  expect(screen.getByTestId('ids')).toHaveTextContent('');
});
