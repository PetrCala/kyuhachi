#!/usr/bin/env node
/**
 * Check the App Store metadata tree against Apple's field length limits.
 *
 *   app/fastlane/metadata/<locale>/<field>.txt
 *
 * Apple counts characters, not bytes, and a Japanese character costs the same
 * as a Latin one, so this counts by code point ([...s].length rather than
 * s.length, which would double-count anything outside the BMP).
 *
 * Also enforces the keywords format: comma-separated with no space after the
 * commas, because a space is a wasted character out of the 100.
 *
 * Exits non-zero if anything is over, so it can gate a `deliver` run.
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const METADATA = join(ROOT, 'app', 'fastlane', 'metadata');
const LOCALES = ['en-US', 'ja'];

/** field file -> Apple's limit. Fields with no limit are checked for presence only. */
const LIMITS = {
  'name.txt': 30,
  'subtitle.txt': 30,
  'promotional_text.txt': 170,
  'keywords.txt': 100,
  'description.txt': 4000,
  'release_notes.txt': 4000,
};

const UNLIMITED = ['support_url.txt', 'marketing_url.txt', 'privacy_url.txt'];

let failed = false;

const fail = (message) => {
  failed = true;
  console.error(`  FAIL  ${message}`);
};

for (const locale of LOCALES) {
  console.log(locale);

  for (const [file, limit] of Object.entries(LIMITS)) {
    const path = join(METADATA, locale, file);
    if (!existsSync(path)) {
      fail(`${file} is missing`);
      continue;
    }

    // Trailing newlines are an artifact of the file, not part of the field.
    const text = readFileSync(path, 'utf8').replace(/\n+$/, '');
    const length = [...text].length;
    const over = length > limit;
    if (over) {
      fail(`${file} is ${length}/${limit} (${length - limit} over)`);
    } else {
      console.log(`  ok    ${file.padEnd(22)} ${String(length).padStart(4)}/${limit}`);
    }

    if (file === 'keywords.txt' && /,\s/.test(text)) {
      fail('keywords.txt has a space after a comma (each one wastes a character)');
    }
  }

  for (const file of UNLIMITED) {
    const path = join(METADATA, locale, file);
    if (!existsSync(path)) fail(`${file} is missing`);
    else if (!readFileSync(path, 'utf8').trim().startsWith('http')) {
      fail(`${file} is not a URL`);
    }
  }
}

// The placeholders that must be replaced before the first submission. Warn
// rather than fail: the tree is committed with them in place on purpose.
const placeholders = ['demo_user.txt', 'demo_password.txt', 'phone_number.txt'];
const outstanding = placeholders.filter((file) => {
  const path = join(METADATA, 'review_information', file);
  return existsSync(path) && readFileSync(path, 'utf8').includes('TODO_');
});

if (outstanding.length > 0) {
  console.log(`\nreview_information still has placeholders: ${outstanding.join(', ')}`);
  console.log('Replace them before submitting (see docs/app-store-listing.md).');
}

if (failed) {
  console.error('\nMetadata check failed.');
  process.exit(1);
}

console.log('\nAll fields within Apple’s limits.');
