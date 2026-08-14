import type { ChallengeDocument, OnsenDocument, VisitDocument } from '@kyuhachi/shared';

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

/** Which map layers are shown; the LayerPanel toggles these. */
export interface LayerVisibility {
  walked: boolean;
  planned: boolean;
  visited: boolean;
  plannedOnsens: boolean;
  allOnsens: boolean;
  terrain: boolean;
}
