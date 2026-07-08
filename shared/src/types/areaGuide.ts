/**
 * Area guides: evergreen, editorial "about this place" content for the coarse
 * tourist regions the onsen pool spans: local food specialties, regional
 * produce and crafts, landmarks and famous spots, history, and living culture.
 *
 * Unlike the Finder (live MKLocalSearch POIs, online-only) this content is
 * curated once and served offline. The data repo publishes it on the same model
 * as the onsen catalog (a versioned collection cached whole on the device), and
 * it is display-only: independent of challenges and visits, it never affects
 * completion (the same way imported routes don't).
 *
 * Deliberately TIME-AGNOSTIC. Guides carry only content that does not go stale:
 * specialties, produce, landmarks, history, culture. They never carry opening
 * hours, prices, dated events, or named shops/restaurants. Anything that can
 * close or change date is out, which is what keeps the feature publish-once.
 *
 * Authored bilingually. Every user-facing string is LocalizedText: this is
 * editorial copy written for the app's readers (who skew toward visitors), not
 * scraped onsen data, so unlike Firestore onsen content it is translated.
 */

import type { Timestamp } from './firestore';
import type { LocalizedText } from './onsen';

/**
 * The kinds of section a guide can contain. Section labels are rendered by the
 * app from these keys via t() (i18n-clean chrome); only the prose is data.
 */
export type AreaGuideSectionKind =
  | 'specialties' // local dishes and food the region is known for
  | 'produce' // regional ingredients, sake/shochu, crafts
  | 'attractions' // landmarks, scenery, famous spots
  | 'history' // historic relevance of the area
  | 'culture'; // customs, festivals-as-heritage, local character

/** Canonical display order of guide sections. */
export const AREA_GUIDE_SECTION_KINDS: readonly AreaGuideSectionKind[] = [
  'specialties',
  'produce',
  'attractions',
  'history',
  'culture',
] as const;

/**
 * One section of a guide. `body` is a short evergreen paragraph (2 to 4
 * sentences); `highlights` are optional scannable bullets. A guide contains
 * only the sections that have content; absent kinds are simply omitted.
 */
export interface AreaGuideSection {
  kind: AreaGuideSectionKind;
  body: LocalizedText;
  highlights?: LocalizedText[];
}

/**
 * /area_guides/{areaId}
 *
 * One coarse tourist region. `areaId` is a stable UUID assigned by the data
 * repo, which owns how onsen `areaName`s roll up into regions; the app joins an
 * onsen to its guide via OnsenDocument.areaId. `center` resolves the user's
 * current region offline (nearest region to their location) and places the
 * region on a map. Guides are never versioned per-region beyond the publish
 * `version`; a retired region is dropped from a later publish.
 */
export interface AreaGuideDocument {
  name: LocalizedText;
  /**
   * Optional one-line hook shown under the region name in the guide's hero
   * (e.g. "Japan's onsen capital"). A guide without one shows just the name and
   * goes straight to sections. Not surfaced on the onsen screen, whose "About
   * this area" row is intentionally plain.
   */
  tagline?: LocalizedText;
  /** Representative center point of the region (for "your area" + map display). */
  center: { lat: number; lng: number };
  /** Ordered sections; only kinds with content are present. */
  sections: AreaGuideSection[];
  /** The area-guides publish version this document was written at. */
  version: number;
  updatedAt: Timestamp;
}

/**
 * /area_guides_meta/current
 *
 * Written atomically by the data repo publish script; the app listens on it to
 * learn when a new area-guides version is available, exactly as it does for the
 * onsen catalog via /catalog_meta/current.
 */
export interface AreaGuideMetaDocument {
  version: number;
  publishedAt: Timestamp;
  totalCount: number;
}

/**
 * One guide as stored in the device-local cache: the Firestore document minus
 * its Timestamp (not JSON-serializable, unread by any screen) plus its document
 * id (the areaId).
 */
export type CachedAreaGuide = Omit<AreaGuideDocument, 'updatedAt'> & {
  id: string;
};

/**
 * The device-local snapshot of the published area guides, persisted as one JSON
 * blob and versioned exactly like CachedCatalog: replaced whole when the
 * published version moves past `version`, never patched incrementally.
 */
export interface CachedAreaGuides {
  version: number;
  /** Epoch ms when the device stored this snapshot. Diagnostics only. */
  fetchedAt: number;
  guides: CachedAreaGuide[];
}
