const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch all files in the monorepo
config.watchFolders = [monorepoRoot];

// Resolve modules from mobile app first, then monorepo root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Pin react-native to the monorepo root's copy (0.81.5) so all packages
// resolve the same instance regardless of where they are installed.
config.resolver.extraNodeModules = {
  'react-native': path.resolve(monorepoRoot, 'node_modules/react-native'),
};

// lru-cache v10+ and path-scurry use private class fields (#field syntax)
// which Hermes in Expo Go cannot parse — force Babel to transform them.
config.transformer.transformIgnorePatterns = [
  'node_modules/(?!(react-native|@react-native|react-native-reanimated|react-native-gesture-handler|react-native-drawer-layout|expo|@expo|@unimodules|unimodules|socket\\.io-client|engine\\.io-client|@socket\\.io|lru-cache|path-scurry)/)',
];

module.exports = config;
