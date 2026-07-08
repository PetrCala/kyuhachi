import type { Timestamp } from './firestore';

/**
 * /users/{userId}
 *
 * Created by the onUserCreated Auth trigger on first sign-in.
 * Never written directly by client code.
 */
export interface UserDocument {
  displayName: string;
  email: string;
  /** The challenge shown by default on launch */
  defaultChallengeId: string | null;
  createdAt: Timestamp;
}

/**
 * /users/{userId}/favorites/{onsenId}
 *
 * The doc id is the onsen's kyuhachiId, so favoriting is structurally
 * deduplicated (same trick as visits). Favorites are challenge-independent:
 * they survive challenge resets and never affect completion.
 */
export interface FavoriteDocument {
  createdAt: Timestamp;
}
