import { initializeApp } from 'firebase-admin/app';

initializeApp();

export { onUserCreated } from './triggers/onUserCreated';
export { onUserDeleted } from './triggers/onUserDeleted';
export { onVisitCreated } from './triggers/onVisitCreated';
export { onVisitDeleted } from './triggers/onVisitDeleted';
export { claimTier } from './callables/claimTier';
export { publishJourneyDay } from './callables/publishJourneyDay';
export { deleteJourneyDay } from './callables/deleteJourneyDay';

// stravaSync is deliberately NOT exported: it needs Strava API access, which now
// costs a subscription we do not have (see docs/journey-days.md), so it has
// nothing to do. Exporting it actively breaks deploys: its defineSecret() calls
// make firebase-tools prompt for STRAVA_CLIENT_ID / _SECRET / _REFRESH_TOKEN,
// which do not exist in Secret Manager, and that prompt blocks EVERY functions
// deploy including targeted ones. To bring it back: create the three secrets
// (docs/journey-days.md), then restore the export below.
// export { stravaSync } from './scheduled/stravaSync';

// instagramJourney is deliberately NOT exported yet, for exactly the reason
// stravaSync is not: its defineSecret() calls make firebase-tools prompt for
// INSTAGRAM_USER_ID / INSTAGRAM_ACCESS_TOKEN, and a prompt for a secret that
// does not exist in Secret Manager blocks EVERY functions deploy, including
// targeted ones. The account it posts to does not exist yet either.
// To turn it on: create the Instagram account and its two secrets
// (docs/instagram.md), then restore the export below and deploy.
// export { instagramJourney } from './scheduled/instagramJourney';
