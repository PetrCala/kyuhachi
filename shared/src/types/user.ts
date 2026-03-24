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
