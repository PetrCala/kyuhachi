module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // In this monorepo, babel-preset-expo is hoisted to the workspace root
      // but expo-router lives only in app/node_modules/. babel-preset-expo's
      // hasModule('expo-router') check therefore fails and the expo-router
      // Babel plugin — which substitutes process.env.EXPO_ROUTER_APP_ROOT so
      // require.context() receives a string literal — is never added.
      // Add it here explicitly to work around the hoisting gap.
      require('babel-preset-expo/build/expo-router-plugin').expoRouterBabelPlugin,
      // Do NOT add 'react-native-worklets/plugin' here. Unlike expo-router,
      // react-native-worklets resolves from the workspace root, so babel-preset-expo
      // already adds it automatically (in the required last position). Adding it
      // again double-applies the worklet transform and silently breaks Reanimated
      // animations — e.g. the gorhom onsen-preview sheet stops opening.
    ],
  };
};
