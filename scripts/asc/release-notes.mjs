/**
 * Loading and validating the per-release "What's New" text.
 *
 * Its own module, with no side effects and no network, so the rules below can
 * be exercised directly. `submit-version.mjs` runs on import (top-level await
 * against App Store Connect), so anything defined there is untestable in
 * practice.
 *
 * The notes live in release-notes/<version>/<locale>.txt. See
 * release-notes/README.md for why they are files rather than a constant.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** App Store Connect's ceiling for a single What's New field. */
export const WHATS_NEW_MAX = 4000;

/**
 * {locale: whatsNew} for `version`, from release-notes/<version>/<locale>.txt.
 *
 * Absent notes are a hard failure rather than a skip. These were a constant
 * inside submit-version.mjs until a release nearly shipped the previous
 * version's text: staging PATCHes whatever it has onto the localizations, so
 * "no notes" silently means "keep the last release's notes", and nothing
 * downstream notices. Failing here is the whole point of the directory.
 */
export function releaseNotes(version, repo = REPO) {
  const dir = join(repo, 'release-notes', version);
  let files;
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.txt'));
  } catch {
    throw new Error(
      `no release notes for ${version}: create ${dir}/<locale>.txt ` +
        `(see release-notes/README.md)`
    );
  }
  if (files.length === 0) throw new Error(`${dir} has no <locale>.txt files`);

  const notes = {};
  for (const file of files) {
    // Trailing whitespace only: leading space could be deliberate indentation,
    // and the body is uploaded exactly as written.
    const text = readFileSync(join(dir, file), 'utf8').trimEnd();
    if (!text) throw new Error(`${join(dir, file)} is empty`);
    if (text.length > WHATS_NEW_MAX) {
      throw new Error(
        `${join(dir, file)} is ${text.length} chars; App Store Connect allows ${WHATS_NEW_MAX}`
      );
    }
    notes[file.replace(/\.txt$/, '')] = text;
  }
  return notes;
}

/**
 * Throw unless every locale the App Store lists has notes.
 *
 * Skipping an uncovered locale instead of failing would leave it showing the
 * previous release's text. That is the one failure here that reaches production
 * looking like a success, so it is an error rather than a warning.
 */
export function assertEveryLocaleCovered(locales, notes, version) {
  const missing = locales.filter((locale) => !notes[locale]);
  if (missing.length === 0) return;
  throw new Error(
    `no release notes for ${missing.join(', ')}: add release-notes/${version}/<locale>.txt ` +
      `for each, or that locale keeps the previous release's What's New`
  );
}
