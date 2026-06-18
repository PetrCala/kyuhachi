/**
 * Firestore Timestamp — used as a type alias so both the app
 * (@react-native-firebase Timestamp) and functions (firebase-admin Timestamp)
 * can satisfy it without coupling shared types to either SDK.
 *
 * Both SDKs implement the same shape: { seconds: number; nanoseconds: number }
 */
export interface Timestamp {
	seconds: number
	nanoseconds: number
	toDate(): Date
	toMillis(): number
}

/** Firestore collection path constants — avoids string literals scattered in code */
export const COLLECTIONS = {
	ONSENS: "onsens",
	CATALOG_META: "catalog_meta",
	CHALLENGE_TYPES: "challenge_types",
	USERS: "users",
} as const

export const SUBCOLLECTIONS = {
	CHALLENGES: "challenges",
	VISITS: "visits",
	ROUTES: "routes",
} as const

export const CATALOG_META_DOC_ID = "current"
