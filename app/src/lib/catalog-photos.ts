/**
 * Whether the app renders and prefetches onsen catalog photographs
 * (`OnsenDocument.imageUrl`).
 *
 * Off for v1: the catalog photos were scraped from 88onsen.com and rehosted
 * into Firebase Storage before the app had a copyright provenance story for
 * them, and shipping to the App Store makes that a live exposure with no
 * good defence. The factual onsen data (name, address, hours, fees) has no
 * such problem and is unaffected.
 *
 * This does not delete anything: `imageUrl` and `blurhash` are still
 * published by the data repo and still typed on `OnsenDocument`, so the
 * catalog stays intact and this is a one-line flip back to `true` if
 * provenance is later cleared. See docs/storage-image-exposure.md for what
 * else has to happen (outside this repo) for the photos to stop being
 * publicly reachable, independent of this flag.
 *
 * Every render and prefetch call site must check this flag rather than
 * `imageUrl` truthiness alone; grep for this constant to find them all.
 */
export const SHOW_CATALOG_PHOTOS = false;
