const googleServicesFile =
  process.env.GOOGLE_SERVICE_INFO_PLIST ?? "./GoogleService-Info.plist";

// Single source of truth for the marketing version (CFBundleShortVersionString).
// Bump it with `npm run version:bump` (see scripts/version.mjs). The iOS build
// number (CFBundleVersion) is intentionally NOT set here: it's auto-derived
// from TestFlight at build time (latest + 1, scoped to this version) by
// fastlane. See docs/ios-deploy.md.
const { version } = require("./package.json");

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  name: "Kyuhachi",
  slug: "kyuhachi",
  scheme: "kyuhachi",
  version,
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  // Localized InfoPlist overrides (iOS system permission prompts etc.). The
  // values in the expo-image-picker plugin below are the English base; iOS
  // swaps in these files when the device language matches.
  locales: {
    en: "./locales/en.json",
    ja: "./locales/ja.json",
  },
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#262837", // brand ink (see app/src/theme/colors.ts)
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: "com.kyuhachi.app",
    usesAppleSignIn: true,
    googleServicesFile,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
    // PrivacyInfo.xcprivacy for the app target. `expo prebuild` writes this to
    // ios/Kyuhachi/PrivacyInfo.xcprivacy and adds it to the Copy Bundle
    // Resources phase; pods ship their own manifests separately and Apple
    // aggregates all of them. The audit behind every entry (which dependency
    // reaches which API, and which manifests are NOT shipped by their pod) is
    // in docs/app-store-submission.md; re-run it when dependencies change.
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      NSPrivacyAccessedAPITypes: [
        {
          // C617.1: react-native-maps reads the modification date of its tile
          // cache inside the app container (AIRMapUrlTileCachedOverlay.m). Its
          // own manifest only ships with the Google Maps subspec, which we do
          // not use, so it has to be declared here.
          // 3B52.1: expo-document-picker reads contentModificationDateKey on
          // the .gpx/.kml/.tcx file the user picks for a route import. It ships
          // no manifest at all.
          NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryFileTimestamp",
          NSPrivacyAccessedAPITypeReasons: ["C617.1", "3B52.1"],
        },
        {
          // CA92.1: @react-native-firebase/app and /auth store their own state
          // in NSUserDefaults (RNFBPreferences, reCAPTCHA/auth state). Neither
          // package ships a privacy manifest.
          NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryUserDefaults",
          NSPrivacyAccessedAPITypeReasons: ["CA92.1"],
        },
      ],
      // Must stay in sync with the App Privacy answers in App Store Connect.
      // Nothing here is used for tracking, so every entry is
      // NSPrivacyCollectedDataTypeTracking: false.
      NSPrivacyCollectedDataTypes: [
        {
          // Firebase Auth account identifier.
          NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypeEmailAddress",
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: [
            "NSPrivacyCollectedDataTypePurposeAppFunctionality",
          ],
        },
        {
          // displayName on /users/{uid}: supplied by Sign in with Apple's
          // FULL_NAME scope, otherwise the local part of the email.
          NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypeName",
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: [
            "NSPrivacyCollectedDataTypePurposeAppFunctionality",
          ],
        },
        {
          // Visit photos, uploaded to Firebase Storage under the user's uid.
          NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypePhotosorVideos",
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: [
            "NSPrivacyCollectedDataTypePurposeAppFunctionality",
          ],
        },
        {
          // Device location, sent to Apple for the Finder's MKLocalSearch
          // lookups. Not stored on our backend, so it is not linked to the
          // account.
          NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypePreciseLocation",
          NSPrivacyCollectedDataTypeLinked: false,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: [
            "NSPrivacyCollectedDataTypePurposeAppFunctionality",
          ],
        },
        {
          NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypeCoarseLocation",
          NSPrivacyCollectedDataTypeLinked: false,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: [
            "NSPrivacyCollectedDataTypePurposeAppFunctionality",
          ],
        },
        {
          // Firebase Auth uid: the key every challenge, visit and route hangs off.
          NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypeUserID",
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: [
            "NSPrivacyCollectedDataTypePurposeAppFunctionality",
          ],
        },
        {
          // App Check device attestation token (DeviceCheck / App Attest).
          NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypeDeviceID",
          NSPrivacyCollectedDataTypeLinked: false,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: [
            "NSPrivacyCollectedDataTypePurposeAppFunctionality",
          ],
        },
      ],
    },
  },
  plugins: [
    "expo-router",
    "expo-font",
    [
      "expo-build-properties",
      {
        ios: {
          useFrameworks: "static",
        },
      },
    ],
    [
      "@react-native-firebase/app",
      {
        ios: { googleServicesFile },
      },
    ],
    "@react-native-firebase/auth",
    "@react-native-firebase/app-check",
    "expo-apple-authentication",
    "./plugins/withAllowNonModularIncludes",
    "react-native-maps",
    [
      "expo-image-picker",
      {
        "cameraPermission": "Allow Kyuhachi to access your camera to take visit photos.",
        "photosPermission": "Allow Kyuhachi to access your photos to add visit photos."
      }
    ],
    [
      "expo-location",
      {
        "locationWhenInUsePermission": "Allow Kyuhachi to use your location to show where you are on the map."
      }
    ],
  ],
  // Expo Router typed route generation breaks in this npm workspace layout:
  // Expo CLI resolves from the repo root, but expo-router is nested under
  // app/node_modules, so the generator cannot resolve expo-router/_ctx-shared.
  extra: {
    router: {},
    eas: {
      projectId: "52439120-a3fd-4ee0-a853-893741b69ea0",
    },
    // In-app developer tools (mock-data generators) gate. ON for the
    // development/preview EAS profiles (which set the env var) and any local
    // run; left unset → false for the production (App Store) build. Read via
    // DEV_TOOLS_ENABLED in app/src/lib/dev/flags.ts.
    enableDevTools: process.env.EXPO_PUBLIC_ENABLE_DEV_TOOLS === "true",
  },
  owner: "petr.cala",
};
