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
