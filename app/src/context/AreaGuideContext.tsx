import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  collection,
  doc,
  getDocsFromServer,
  onSnapshot,
  type FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import type { AreaGuideDocument, AreaGuideMetaDocument, CachedAreaGuide } from '@kyuhachi/shared';
import { COLLECTIONS, AREA_GUIDES_META_DOC_ID } from '@kyuhachi/shared';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/firebase';
import {
  loadStoredAreaGuides,
  sortAreaGuides,
  storeAreaGuides,
  toCachedAreaGuide,
} from '@/lib/area-guide-store';

interface AreaGuideContextValue {
  /** Every published area guide, in stable areaId order. */
  guides: CachedAreaGuide[];
  /** The same guides keyed by areaId, for the onsen-detail join and lookups. */
  guideMap: Map<string, CachedAreaGuide>;
  /** The area-guides version currently served, or null before any exist. */
  version: number | null;
  /** True until the device-local store has been read and the first sync settled. */
  loading: boolean;
}

const AreaGuideContext = createContext<AreaGuideContextValue>({
  guides: [],
  guideMap: new Map(),
  version: null,
  loading: true,
});

/**
 * The single source of area-guide data for the app: a device-local, versioned
 * snapshot of /area_guides so the editorial region content is readable with no
 * network at all. Mirrors OnsenCatalogContext (ADR-007) exactly, minus the photo
 * prefetch (guides carry no images).
 *
 * On mount the last stored snapshot is served immediately. A live listener on
 * /area_guides_meta/current (the data pipeline bumps `version` on every publish)
 * re-syncs whenever the published version moves past the stored one: the whole
 * collection is re-fetched from the server (a cache read can be silently partial),
 * persisted as one blob, and swapped in. includeMetadataChanges so a sync that
 * failed offline retries on reconnect.
 *
 * Display data only: independent of challenges and visits, it never affects
 * completion.
 */
export function AreaGuideProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [guides, setGuides] = useState<CachedAreaGuide[]>([]);
  const [version, setVersion] = useState<number | null>(null);
  const [storeLoaded, setStoreLoaded] = useState(false);
  const [syncSettled, setSyncSettled] = useState(false);
  // The served version, readable synchronously by the meta listener and the
  // store loader (both race against each other on a cold start).
  const versionRef = useRef(0);
  const syncingRef = useRef(false);

  // Serve whatever the last session stored, before (and regardless of) any
  // network activity. The version guard keeps a slow store read from clobbering
  // a fresher snapshot a fast first sync already put in place.
  useEffect(() => {
    let cancelled = false;
    loadStoredAreaGuides().then((stored) => {
      if (cancelled) return;
      if (stored && stored.version > versionRef.current) {
        versionRef.current = stored.version;
        setGuides(stored.guides);
        setVersion(stored.version);
      }
      setStoreLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Replace the local guides with the server's, stamped as `targetVersion` (the
  // version that announced it). If a publish lands mid-fetch, the meta listener
  // fires again and re-syncs.
  const sync = useCallback(async (targetVersion: number) => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    try {
      const snap = await getDocsFromServer(collection(db, COLLECTIONS.AREA_GUIDES));
      const fetched = sortAreaGuides(
        snap.docs.map((d: FirebaseFirestoreTypes.QueryDocumentSnapshot) =>
          toCachedAreaGuide(d.id, d.data() as AreaGuideDocument)
        )
      );
      // An empty read would wipe a good cache, so keep what we have. (Guarding a
      // half-seeded emulator or a botched publish.)
      if (fetched.length > 0) {
        versionRef.current = targetVersion;
        setGuides(fetched);
        setVersion(targetVersion);
        void storeAreaGuides({ version: targetVersion, fetchedAt: Date.now(), guides: fetched });
      }
    } catch {
      // Offline or transient: the meta listener re-fires on reconnect (it
      // includes metadata changes), which retries this sync.
    } finally {
      syncingRef.current = false;
      setSyncSettled(true);
    }
  }, []);

  // Watch the published area-guides version. Rules require auth for reads, so the
  // listener waits for a signed-in user; the stored snapshot above is served
  // either way.
  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(
      doc(db, COLLECTIONS.AREA_GUIDES_META, AREA_GUIDES_META_DOC_ID),
      { includeMetadataChanges: true },
      (snapshot: FirebaseFirestoreTypes.DocumentSnapshot) => {
        const meta = snapshot.exists() ? (snapshot.data() as AreaGuideMetaDocument) : null;
        if (!meta || meta.version <= versionRef.current) {
          setSyncSettled(true);
          return;
        }
        void sync(meta.version);
      },
      () => setSyncSettled(true)
    );
    return unsubscribe;
  }, [user, sync]);

  const value = useMemo<AreaGuideContextValue>(
    () => ({
      guides,
      guideMap: new Map(guides.map((g) => [g.id, g])),
      version,
      loading: !storeLoaded || (guides.length === 0 && !syncSettled),
    }),
    [guides, version, storeLoaded, syncSettled]
  );

  return <AreaGuideContext.Provider value={value}>{children}</AreaGuideContext.Provider>;
}

export function useAreaGuides(): AreaGuideContextValue {
  return useContext(AreaGuideContext);
}
