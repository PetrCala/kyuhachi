#!/usr/bin/env node
// Bump the app's marketing version (CFBundleShortVersionString) in one step.
//
// Single source of truth: app/package.json "version". app/app.config.js reads
// it (`require("./package.json").version`), so `expo prebuild` -> Info.plist ->
// fastlane all derive from this one field. The iOS *build number*
// (CFBundleVersion) is NOT bumped here — it's auto-derived from TestFlight at
// build time (latest + 1, scoped to this marketing version). See
// docs/ios-deploy.md.
//
// Usage (run from anywhere; npm script lives at the repo root):
//   npm run version:bump -- patch     1.0.0 -> 1.0.1
//   npm run version:bump -- minor     1.0.0 -> 1.1.0
//   npm run version:bump -- major     1.0.0 -> 2.0.0
//   npm run version:bump -- 1.2.3     explicit version
//
// Edits app/package.json and the "app" workspace entry in package-lock.json in
// place, preserving each file's formatting. We do surgical string replacements
// rather than JSON re-serialize on purpose: the lockfile is tab-indented and a
// full re-serialize would rewrite all ~5k lines. Keeping the lockfile's app
// version in sync is required — `npm ci` (CI + the deploy runner) fails if the
// lockfile and package.json disagree.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const appPkgPath = join(repoRoot, "app", "package.json");
const lockPath = join(repoRoot, "package-lock.json");

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?$/;

function fail(msg) {
  console.error(`version:bump — ${msg}`);
  process.exit(1);
}

const arg = process.argv[2];
if (!arg) {
  fail("missing argument. Usage: npm run version:bump -- <patch|minor|major|X.Y.Z>");
}

const appPkgRaw = readFileSync(appPkgPath, "utf8");
const current = JSON.parse(appPkgRaw).version;
const m = SEMVER.exec(current);
if (!m) fail(`current version in app/package.json is not semver: "${current}"`);

let next;
if (arg === "patch" || arg === "minor" || arg === "major") {
  let [maj, min, pat] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (arg === "major") {
    maj++;
    min = 0;
    pat = 0;
  } else if (arg === "minor") {
    min++;
    pat = 0;
  } else {
    pat++;
  }
  next = `${maj}.${min}.${pat}`;
} else if (SEMVER.test(arg)) {
  next = arg;
} else {
  fail(`invalid argument "${arg}". Use patch|minor|major or an explicit X.Y.Z.`);
}

if (next === current) fail(`version is already ${current}; nothing to do.`);

// app/package.json — replace only the first "version" (the package's own).
// Dependencies are keyed by name with range values, so there is no other bare
// "version" key to collide with.
const appVersionRe = /("version"\s*:\s*")[^"]+(")/;
if (!appVersionRe.test(appPkgRaw)) {
  fail("could not find a version field in app/package.json");
}
const appOut = appPkgRaw.replace(appVersionRe, `$1${next}$2`);

// package-lock.json — replace the version inside the "app" workspace block.
// The regex tolerates tab/space/newline indentation. The node_modules/app
// symlink entry is keyed "node_modules/app" (no bare "app": token) and has no
// "version", so it cannot match.
let lockOut;
let lockTouched = false;
try {
  const lockRaw = readFileSync(lockPath, "utf8");
  const lockAppRe = /("app"\s*:\s*\{\s*"version"\s*:\s*")[^"]+(")/;
  if (lockAppRe.test(lockRaw)) {
    lockOut = lockRaw.replace(lockAppRe, `$1${next}$2`);
    lockTouched = true;
  } else {
    console.warn(
      'version:bump — warning: could not locate the "app" entry in ' +
        "package-lock.json; run `npm install` to resync the lockfile before " +
        "committing (otherwise `npm ci` will fail in CI)."
    );
  }
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}

writeFileSync(appPkgPath, appOut);
if (lockTouched) writeFileSync(lockPath, lockOut);

console.log(`version:bump — ${current} -> ${next}`);
console.log(
  `  updated app/package.json${lockTouched ? " and package-lock.json" : ""}`
);
console.log(
  "  app.config.js reads this version automatically (single source of truth)."
);
console.log(
  "  iOS build number is auto-derived from TestFlight at build time — not set here."
);
console.log(
  "  Next: commit the change; pushing to master triggers the TestFlight deploy."
);
