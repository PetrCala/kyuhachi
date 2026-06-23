/**
 * Jest config for the app workspace. Uses the jest-expo preset (RN/Expo
 * transforms + environment) and mirrors the tsconfig path aliases so tests
 * resolve `@/…` and `@kyuhachi/shared` the same way Metro does.
 */
module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@kyuhachi/shared$': '<rootDir>/../shared/src/index.ts',
  },
  // Keep the route files (app/) out of the test run; tests live under src/.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/app/'],
};
