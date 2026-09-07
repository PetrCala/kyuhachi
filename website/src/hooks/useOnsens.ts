import type { CatalogIndexDocument, CatalogIndexEntry, OnsenDocument } from '@kyuhachi/shared';
import { CATALOG_INDEX_DOC_ID, CATALOG_INDEX_SCHEMA_VERSION, COLLECTIONS } from '@kyuhachi/shared';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '../firebase';
import type { CatalogOnsen } from '../types';

interface State {
  onsens: Map<string, CatalogOnsen> | null;
  failed: boolean;
}

/**
 * The packing is a wire format and stops here: everything downstream of this
 * hook sees a plain map of onsens, exactly as the polyline decoding stops
 * inside useJourneyDays.
 *
 * A row shorter or longer than the tuple cannot arrive without the publisher
 * having changed the packing, which is what `schemaVersion` guards, so the
 * positional read needs no per-row guard.
 */
function unpack(entries: string): Map<string, CatalogOnsen> {
  const rows = JSON.parse(entries) as CatalogIndexEntry[];
  if (!Array.isArray(rows)) throw new Error('catalog index entries is not an array');
  const onsens = new Map<string, CatalogOnsen>();
  for (const [id, name, nameRomaji, areaName, prefecture, lat, lng] of rows) {
    onsens.set(id, { id, name, nameRomaji, areaName, prefecture, lat, lng });
  }
  return onsens;
}

/**
 * True while the index is not there to be read yet, which is two states, not
 * one: the document is absent, or the rules that make it public have not
 * reached production (Firestore denies a read on a path no rule matches, so the
 * read throws instead of returning an empty snapshot). Rules and website deploy
 * from the same push on separate workflows, and `npm run dev` on a branch talks
 * to production, so both states are real and both are transient.
 *
 * Anything else, including a document that does not parse, is a broken publish
 * rather than a missing one, and is left to throw.
 */
function isNotPublishedYet(err: unknown): boolean {
  return (err as { code?: string })?.code === 'permission-denied';
}

/**
 * /catalog_index/current, or null when it is not published yet.
 *
 * A document that exists but does not parse throws, and the caller says so
 * rather than quietly serving an older, slower catalog nobody would notice was
 * in use.
 */
async function readIndex(): Promise<Map<string, CatalogOnsen> | null> {
  const snap = await getDoc(doc(db, COLLECTIONS.CATALOG_INDEX, CATALOG_INDEX_DOC_ID)).catch(
    (err: unknown) => {
      if (isNotPublishedYet(err)) return null;
      throw err;
    }
  );
  if (snap == null || !snap.exists()) return null;
  const data = snap.data() as CatalogIndexDocument;
  if (data.schemaVersion !== CATALOG_INDEX_SCHEMA_VERSION) {
    throw new Error(`catalog index schemaVersion ${data.schemaVersion} is not readable here`);
  }
  return unpack(data.entries);
}

/**
 * The old read: all 161 documents with all 23 fields, 386 KB to render seven
 * fields per onsen.
 *
 * TEMPORARY. It exists only for the window between this deploying and the data
 * repo publishing the index, so the site never reads a document that is not
 * there. Once /catalog_index/current is live in production, delete this
 * function, `isNotPublishedYet`, the `.catch` in readIndex and the
 * `?? readFullCatalog()` below, and let readIndex return the map directly:
 * nothing downstream changes, because both paths produce the same map.
 */
async function readFullCatalog(): Promise<Map<string, CatalogOnsen>> {
  const snap = await getDocs(collection(db, COLLECTIONS.ONSENS));
  const onsens = new Map<string, CatalogOnsen>();
  for (const docSnap of snap.docs) {
    const { name, nameRomaji, areaName, prefecture, lat, lng } = docSnap.data() as OnsenDocument;
    onsens.set(docSnap.id, { id: docSnap.id, name, nameRomaji, areaName, prefecture, lat, lng });
  }
  return onsens;
}

/**
 * Every onsen the site can draw, active and archived alike, fetched once per
 * page load. The catalog changes only when the data repo publishes, so there is
 * no live subscription; a reload picks up a new catalog version.
 *
 * One document, ~24 KB, in place of the 161-document, 386 KB collection read:
 * the site reads seven fields per onsen and the rest of each document was
 * downloaded and thrown away. See CatalogIndexDocument in shared/.
 *
 * `failed` exists because a missing catalog is invisible on the map: every
 * layer still draws, just with nothing on it. The caller has to say so.
 */
export function useOnsens(): State {
  const [state, setState] = useState<State>({ onsens: null, failed: false });

  useEffect(() => {
    let cancelled = false;
    readIndex()
      .then(async (indexed) => {
        if (indexed) return indexed;
        console.warn('catalog index not published yet; reading the full catalog');
        return readFullCatalog();
      })
      .then((onsens) => {
        if (!cancelled) setState({ onsens, failed: false });
      })
      .catch((err) => {
        console.error('catalog fetch failed', err);
        // Hold on to whatever was loaded before rather than swapping in an
        // empty catalog: a stale map beats a confidently empty one.
        if (!cancelled) setState((prev) => ({ onsens: prev.onsens, failed: true }));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
