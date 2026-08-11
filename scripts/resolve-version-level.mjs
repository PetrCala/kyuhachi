#!/usr/bin/env node
// Decide how far to bump the marketing version for a push to master.
//
// Used by .github/workflows/deploy.yml, which gathers the inputs (they all
// arrive as env vars) and feeds the answer to scripts/version.mjs. Kept as a
// separate script rather than inline YAML so the policy is readable in one
// place and runnable by hand:
//
//   PR_LABELS='version:minor' CHANGED_FILES=$'app/src/x.ts\ndocs/y.md' \
//     node scripts/resolve-version-level.mjs
//
// Prints two lines to stdout: `level=<major|minor|patch|none>` and
// `reason=<why>`, in GITHUB_OUTPUT format, so the workflow can redirect it
// straight there.
//
// Resolution order (first match wins):
//   1. DISPATCH_LEVEL  explicit workflow_dispatch input
//   2. PR_LABELS       `version:<level>` labels on the PRs released by this run
//   3. CHANGED_FILES   patch if the range touches shipped code, else none
//
// `major` and `minor` are never inferred. A release that big is a decision, so
// it takes a label or a manual dispatch. The inferred default is deliberately
// conservative: it keeps the public number honest (every TestFlight build under
// a distinct version) without inflating it one minor per feature.
//
// The inputs describe a *range* (everything since the last `v*` tag), not a
// single commit, because a push that resolves to `none` leaves no tag behind
// and its files roll into the next release. So several PRs can contribute
// labels at once; the strongest one wins.

// Ordered strongest to weakest. Index doubles as the precedence rank.
const LEVELS = ["major", "minor", "patch", "none"];

// Prefixes whose contents end up in the shipped binary or its backend. A push
// that touches none of them (docs, CI, firebase rules, store metadata) gets a
// build number but no new marketing version.
const SHIPPED_PATHS = ["app/", "shared/", "functions/"];

// Paths under a shipped prefix that still don't reach users. Tests and the
// fastlane metadata tree live inside app/, so without this a screenshot
// recapture would look like an app change.
const UNSHIPPED_WITHIN_SHIPPED = [
  "app/__tests__/",
  "app/fastlane/metadata/",
  "app/fastlane/screenshots/",
];

function fail(msg) {
  console.error(`resolve-version-level: ${msg}`);
  process.exit(1);
}

/** Split a newline-separated env var into trimmed, non-empty entries. */
function lines(value) {
  return (value ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function emit(level, reason) {
  if (!LEVELS.includes(level)) fail(`resolved an invalid level "${level}"`);
  console.log(`level=${level}`);
  console.log(`reason=${reason}`);
  process.exit(0);
}

const dispatchLevel = (process.env.DISPATCH_LEVEL ?? "").trim().toLowerCase();
if (dispatchLevel && dispatchLevel !== "auto") {
  if (!LEVELS.includes(dispatchLevel)) {
    fail(
      `DISPATCH_LEVEL "${dispatchLevel}" is not one of ${LEVELS.join(", ")}, auto.`
    );
  }
  emit(dispatchLevel, `workflow_dispatch requested ${dispatchLevel}`);
}

// Labels arrive one per line from `gh pr view --json labels`, for every PR in
// the range. Anything that isn't a version label is ignored.
const requested = lines(process.env.PR_LABELS)
  .filter((label) => label.toLowerCase().startsWith("version:"))
  .map((label) => label.slice("version:".length).trim().toLowerCase());

const unknown = requested.filter((level) => !LEVELS.includes(level));
if (unknown.length > 0) {
  fail(
    `unknown label(s) version:${unknown.join(", version:")}. Expected one of ${LEVELS.join(", ")}.`
  );
}

if (requested.length > 0) {
  // Strongest wins: if one PR in this release asked for minor and another for
  // patch, the release is a minor.
  const strongest = requested.reduce((a, b) =>
    LEVELS.indexOf(a) <= LEVELS.indexOf(b) ? a : b
  );
  const from =
    requested.length === 1
      ? `version:${strongest} label`
      : `strongest of ${requested.length} version labels`;
  emit(strongest, `${from} on the released PR(s)`);
}

// No explicit instruction: infer from what the range actually changed.
const changed = lines(process.env.CHANGED_FILES);
if (changed.length === 0) {
  emit("none", "no changed files reported");
}

const shipped = changed.filter(
  (file) =>
    SHIPPED_PATHS.some((prefix) => file.startsWith(prefix)) &&
    !UNSHIPPED_WITHIN_SHIPPED.some((prefix) => file.startsWith(prefix))
);

if (shipped.length === 0) {
  emit("none", "no shipped code changed (docs, CI, or config only)");
}

emit("patch", `${shipped.length} shipped file(s) changed, e.g. ${shipped[0]}`);
