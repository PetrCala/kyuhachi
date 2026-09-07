import type { ChallengeDocument, JourneyDayDocument, VisitDocument } from '@kyuhachi/shared';
import type { LatLng } from './lib/geo';

/**
 * An onsen as the site knows it: its id (the kyuhachiId) and the six fields the
 * map, the stats and the visit panel actually render. Everything else a catalog
 * document carries (opening hours, fees, spring quality, photos) belongs to the
 * app, and the site never reads it, so it is never fetched either. Decoded from
 * the packed /catalog_index/current by useOnsens, the same way WalkedDay below
 * is decoded from a polyline.
 */
export interface CatalogOnsen {
  id: string;
  name: string;
  nameRomaji: string | null;
  areaName: string;
  prefecture: string;
  lat: number;
  lng: number;
}

/** Petr's default challenge with its Firestore document id. */
export interface JourneyChallenge extends ChallengeDocument {
  id: string;
}

/** A visit keyed by the onsen it belongs to (the visit doc id IS the onsen id). */
export interface VisitWithOnsenId extends VisitDocument {
  onsenId: string;
}

/**
 * A walked day with its track decoded back into points. Firestore stores the
 * track as an encoded polyline, which is a wire format and nothing else: the
 * hook decodes it once, and the map and the stats never see the encoding.
 */
export interface WalkedDay extends Omit<JourneyDayDocument, 'polyline'> {
  points: LatLng[];
}

/** Which map layers are shown; the LayerPanel toggles these. */
export interface LayerVisibility {
  walked: boolean;
  planned: boolean;
  visited: boolean;
  plannedOnsens: boolean;
  allOnsens: boolean;
  terrain: boolean;
}
