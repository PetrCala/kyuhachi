const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

// expo-router needs this set to an absolute path before getDefaultConfig runs.
// In a monorepo the auto-detection fails; routes live in app/app/ relative to workspace root.
process.env.EXPO_ROUTER_APP_ROOT ??= path.resolve(projectRoot, 'app');

const config = getDefaultConfig(projectRoot);

// Watch the shared package so Metro picks up changes (preserve Expo defaults)
config.watchFolders = [workspaceRoot, ...(config.watchFolders ?? [])];

// Look for node_modules in both app/ and repo root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
