import type {
  ChallengeDocument,
  JourneyDayDocument,
  OnsenDocument,
  VisitDocument,
} from '@kyuhachi/shared';
import type { LatLng } from './lib/geo';

/** A catalog onsen with its Firestore document id (the kyuhachiId). */
export interface OnsenWithId extends OnsenDocument {
  id: string;
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
