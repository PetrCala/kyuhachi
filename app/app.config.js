const googleServicesFile =
  process.env.GOOGLE_SERVICE_INFO_PLIST ?? "./GoogleService-Info.plist";

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  name: "Kyuhachi",
  slug: "kyuhachi",
  scheme: "kyuhachi",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#ffffff",
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
  ],
  // Expo Router typed route generation breaks in this npm workspace layout:
  // Expo CLI resolves from the repo root, but expo-router is nested under
  // app/node_modules, so the generator cannot resolve expo-router/_ctx-shared.
  extra: {
    router: {},
    eas: {
      projectId: "52439120-a3fd-4ee0-a853-893741b69ea0",
    },
  },
  owner: "petr.cala",
};
