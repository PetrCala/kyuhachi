/**
 * Whether the app renders and prefetches onsen catalog photographs
 * (`OnsenDocument.imageUrl`).
 *
 * On for v1. The photos are rehosted from 88onsen.com, which is operated by
 * 一般社団法人 九州観光機構; they were originally gated off because there was no
 * cleared copyright provenance for them. Permission to display them was
 * requested through the site's contact form on 2026-08-12 and granted on
 * 2026-08-31, with no conditions attached to the grant. See
 * docs/storage-image-exposure.md for the full history.
 *
 * The request that was granted offered per-photo credit plus a link back to the
 * source, so `OnsenHeroImage` renders a credit over every photo even though the
 * reply imposed no conditions: the offer was part of what they said yes to.
 * That credit is not optional decoration. If photos are ever rendered somewhere
 * new, the credit goes with them.
 *
 * Every render and prefetch call site must check this flag rather than
 * `imageUrl` truthiness alone; grep for this constant to find them all. Turning
 * it back off is a complete kill switch (both hero call sites fall back to
 * `OnsenHeroMark`, both prefetchers become no-ops), which is what makes it the
 * right shape for a takedown request: the grant was offered on the terms that
 * we would honour one.
 */
export const SHOW_CATALOG_PHOTOS = true;
