/**
 * Unit tests for the Functions package. Pure logic only (util/), run without
 * emulators: the triggers and callables are covered by the Firestore rules
 * suite in firebase/test and by manual verification, and nothing here needs a
 * running Firebase.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  // testRegex rather than testMatch: glob matching treats a dot-directory in
  // the absolute path as hidden, so a testMatch pattern finds nothing when the
  // checkout lives under one (a git worktree in .claude/worktrees, say).
  testRegex: '/__tests__/.*\\.test\\.ts$',
};
