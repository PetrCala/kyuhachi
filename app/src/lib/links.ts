import { Linking } from 'react-native';

// External destinations. Not translatable: these are configuration, not copy.
export const GITHUB_URL = 'https://github.com/PetrCala/kyuhachi';
export const ISSUES_URL = 'https://github.com/PetrCala/kyuhachi/issues';
export const NEW_ISSUE_URL = 'https://github.com/PetrCala/kyuhachi/issues/new';
export const DATA_SOURCE_URL = 'https://www.88onsen.com';
// Hosted on Firebase Hosting (default domain, no custom domain). Built from the
// source docs at docs/legal/{privacy,terms}.md by scripts/build-legal-html.mjs.
export const PRIVACY_URL = 'https://kyuhachi-fddcc.web.app/privacy';
export const TERMS_URL = 'https://kyuhachi-fddcc.web.app/terms';

// App Store Connect app id; mirrors submit.production.ios.ascAppId in eas.json.
const APP_STORE_ID = '6761064476';
export const APP_STORE_URL = `https://apps.apple.com/app/id${APP_STORE_ID}`;
// Apple's documented deep link to the review composer. A tapped "rate" row has
// to use this rather than StoreKit's requestReview: the HIG forbids wiring a
// control to the system prompt, which is rate-limited and often shows nothing.
export const WRITE_REVIEW_URL = `${APP_STORE_URL}?action=write-review`;

export function openUrl(url: string) {
  Linking.openURL(url).catch(() => {
    // Nothing actionable if the device has no handler for the URL.
  });
}
