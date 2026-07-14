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
import { Image } from 'expo-image';
import {
  collection,
  doc,
  getDocsFromServer,
  onSnapshot,
  type FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import type { CachedOnsen, CatalogMetaDocument, OnsenDocument } from '@kyuhachi/shared';
import { COLLECTIONS, CATALOG_META_DOC_ID } from '@kyuhachi/shared';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/firebase';
import { loadStoredCatalog, sortCatalog, storeCatalog, toCachedOnsen } from '@/lib/catalog-store';

interface OnsenCatalogContextValue {
  /** Every onsen ever published (active and archived), in areaName/name order. */
  onsens: CachedOnsen[];
  /** The same onsens keyed by kyuhachiId, for single-onsen lookups. */
  onsenMap: Map<string, CachedOnsen>;
  /** Just the active (non-deprecated) onsens: what browse surfaces show. */
  activeOnsens: CachedOnsen[];
  /** The catalog version currently served, or null before any catalog exists. */
  version: number | null;
  /**
   * True until the device-local store has been read and, when it was empty
   * (first launch), the first sync attempt has settled; so screens show a
   * spinner on a cold first load but never block on the network when a cached
   * catalog exists.
   */
  loading: boolean;
}

const OnsenCatalogContext = createContext<OnsenCatalogContextValue>({
  onsens: [],
  onsenMap: new Map(),
  activeOnsens: [],
  version: null,
  loading: true,
});

/**
 * The single source of catalog data for the app: a device-local, versioned
 * snapshot of /onsens so the full catalog (names, readings, addresses, hours,
 * fees, coordinates) is readable with no network at all, not just when
 * Firestore's incidental query cache happens to hold it.
 *
 * On mount the last stored snapshot is served immediately. A live listener on
 * /catalog_meta/current (the data pipeline bumps `version` on every publish)
 * then re-syncs whenever the published version moves past the stored one: the
 * whole collection is re-fetched *from the server* (a cache read can be
 * silently partial), persisted as one blob, and swapped in. The listener runs
 * with includeMetadataChanges so a sync that failed offline retries when
 * connectivity returns, without polling or a network-info dependency.
 *
 * After a sync (and once per launch from an existing cache) every catalog
 * photo is prefetched into expo-image's disk cache so onsen images are also
 * available offline; the blurhash placeholder remains the fallback for any
 * photo that never made it.
 *
 * Frozen-challenge-snapshot invariant: this cache is display data only. It is
 * never consulted when a challenge is created: `snapshotCatalogVersion` still
 * comes from a direct /catalog_meta read and the eligible pool from
 * /challenge_types: so the cache cannot change which catalog version a
 * challenge is pinned to.
 */
export function OnsenCatalogProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [onsens, setOnsens] = useState<CachedOnsen[]>([]);
  const [version, setVersion] = useState<number | null>(null);
  const [storeLoaded, setStoreLoaded] = useState(false);
  const [syncSettled, setSyncSettled] = useState(false);
  // The served version, readable synchronously by the meta listener and the
  // store loader (both race against each other on a cold start).
  const versionRef = useRef(0);
  const syncingRef = useRef(false);
  // Catalog versions whose photos were already handed to the prefetcher this
  // launch, so re-renders don't re-issue the sweep.
  const prefetchedVersionRef = useRef<number | null>(null);

  // Serve whatever the last session stored, before (and regardless of) any
  // network activity. The version guard keeps a slow store read from
  // clobbering a fresher catalog a fast first sync already put in place.
  useEffect(() => {
    let cancelled = false;
    loadStoredCatalog().then((stored) => {
      if (cancelled) return;
      if (stored && stored.version > versionRef.current) {
        versionRef.current = stored.version;
        setOnsens(stored.onsens);
        setVersion(stored.version);
      }
      setStoreLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Replace the local catalog with the server's, stamped as `targetVersion`
  // (the version that announced it). If a publish lands mid-fetch, the meta
  // listener fires again and re-syncs; no need to re-read the meta doc here.
  const sync = useCallback(async (targetVersion: number) => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    try {
      const snap = await getDocsFromServer(collection(db, COLLECTIONS.ONSENS));
      const fetched = sortCatalog(
        snap.docs.map((d: FirebaseFirestoreTypes.QueryDocumentSnapshot) =>
          toCachedOnsen(d.id, d.data() as OnsenDocument)
        )
      );
      // An empty read would wipe a good cache; keep what we have. (The
      // catalog is never empty once published; this guards a half-seeded
      // emulator or a botched publish.)
      if (fetched.length > 0) {
        versionRef.current = targetVersion;
        setOnsens(fetched);
        setVersion(targetVersion);
        void storeCatalog({ version: targetVersion, fetchedAt: Date.now(), onsens: fetched });
      }
    } catch {
      // Offline or transient: the meta listener re-fires on reconnect (it
      // includes metadata changes), which retries this sync.
    } finally {
      syncingRef.current = false;
      setSyncSettled(true);
    }
  }, []);

  // Watch the published catalog version. Rules require auth for catalog reads,
  // so the listener waits for a signed-in user; the stored catalog above is
  // served either way.
  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(
      doc(db, COLLECTIONS.CATALOG_META, CATALOG_META_DOC_ID),
      { includeMetadataChanges: true },
      (snapshot: FirebaseFirestoreTypes.DocumentSnapshot) => {
        const meta = snapshot.exists() ? (snapshot.data() as CatalogMetaDocument) : null;
        if (!meta || meta.version <= versionRef.current) {
          // Nothing newer published (or no meta doc yet); we are as fresh as
          // we can be, so a first launch stops showing its spinner.
          setSyncSettled(true);
          return;
        }
        void sync(meta.version);
      },
      () => setSyncSettled(true)
    );
    return unsubscribe;
  }, [user, sync]);

  // Warm expo-image's disk cache with every catalog photo, once per catalog
  // version per launch: after the first sync, after each version bump, and on
  // launches from an existing cache (re-fetching anything the image cache
  // evicted). Already-cached URLs are skipped by the prefetcher, so the warm
  // path costs nothing. Fire-and-forget by design: a photo that never lands
  // falls back to its blurhash placeholder.
  useEffect(() => {
    if (version === null || onsens.length === 0) return;
    if (prefetchedVersionRef.current === version) return;
    prefetchedVersionRef.current = version;
    const urls = onsens.flatMap((o) => (o.imageUrl ? [o.imageUrl] : []));
    if (urls.length > 0) {
      void Image.prefetch(urls, { cachePolicy: 'disk' });
    }
  }, [version, onsens]);

  const value = useMemo<OnsenCatalogContextValue>(
    () => ({
      onsens,
      onsenMap: new Map(onsens.map((o) => [o.id, o])),
      activeOnsens: onsens.filter((o) => o.isActive),
      version,
      loading: !storeLoaded || (onsens.length === 0 && !syncSettled),
    }),
    [onsens, version, storeLoaded, syncSettled]
  );

  return <OnsenCatalogContext.Provider value={value}>{children}</OnsenCatalogContext.Provider>;
}

export function useOnsenCatalog(): OnsenCatalogContextValue {
  return useContext(OnsenCatalogContext);
}
