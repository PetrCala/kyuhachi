import type { CatalogIndexDocument, CatalogIndexEntry } from '@kyuhachi/shared';
import { CATALOG_INDEX_DOC_ID, CATALOG_INDEX_SCHEMA_VERSION, COLLECTIONS } from '@kyuhachi/shared';
import { doc, getDoc } from 'firebase/firestore';
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
 * The published catalog index, unpacked.
 *
 * A missing document is a broken publish rather than a state to fall back on:
 * the data repo rewrites /catalog_index/current from the same live read that
 * writes /catalog_meta, on every publish, so the only way it is absent is that
 * something went wrong. Same for a schemaVersion this build does not know: the
 * packing is not something to guess at. Both throw, and the caller turns that
 * into the "part of the journey could not be loaded" banner rather than a
 * quietly empty map.
 */
async function readIndex(): Promise<Map<string, CatalogOnsen>> {
  const snap = await getDoc(doc(db, COLLECTIONS.CATALOG_INDEX, CATALOG_INDEX_DOC_ID));
  if (!snap.exists()) throw new Error('catalog_index/current is missing');
  const data = snap.data() as CatalogIndexDocument;
  if (data.schemaVersion !== CATALOG_INDEX_SCHEMA_VERSION) {
    throw new Error(`catalog index schemaVersion ${data.schemaVersion} is not readable here`);
  }
  return unpack(data.entries);
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
