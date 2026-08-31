/**
 * Tests for the release-notes loader. Run with `npm run test:scripts`.
 *
 * Node's built-in runner rather than jest: the app's jest config explicitly
 * ignores everything outside app/, and these have no React or Firebase
 * dependency to justify pulling that setup out here.
 *
 * The failure cases are the point. A release-notes bug is silent in
 * production: staging succeeds, the wrong What's New goes live, and nothing
 * downstream disagrees. Every rule below therefore asserts on the throw.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertEveryLocaleCovered, releaseNotes, WHATS_NEW_MAX } from './release-notes.mjs';

/** A throwaway repo root holding `release-notes/<version>/<locale>.txt`. */
function repoWith(version, files) {
  const repo = mkdtempSync(join(tmpdir(), 'kyuhachi-notes-'));
  mkdirSync(join(repo, 'release-notes', version), { recursive: true });
  for (const [locale, text] of Object.entries(files)) {
    writeFileSync(join(repo, 'release-notes', version, `${locale}.txt`), text);
  }
  return repo;
}

describe('assertEveryLocaleCovered', () => {
  it('passes when every listed locale has notes', () => {
    assertEveryLocaleCovered(['en-US', 'ja'], { 'en-US': 'a', ja: 'b' }, '1.1.0');
  });

  it('names the locale that would silently keep the previous release notes', () => {
    assert.throws(
      () => assertEveryLocaleCovered(['en-US', 'ja'], { 'en-US': 'a' }, '1.1.0'),
      /no release notes for ja/
    );
  });

  it('names every missing locale, not just the first', () => {
    assert.throws(
      () => assertEveryLocaleCovered(['en-US', 'ja', 'de-DE'], {}, '1.1.0'),
      /en-US, ja, de-DE/
    );
  });

  it('tolerates notes for a locale the App Store does not list', () => {
    // Harmless: a locale can be added to the repo before it exists in ASC.
    assertEveryLocaleCovered(['en-US'], { 'en-US': 'a', ja: 'b' }, '1.1.0');
  });
});

describe('releaseNotes', () => {
  it('reads each locale and trims trailing whitespace', () => {
    const repo = repoWith('2.0.0', { 'en-US': '- hello\n\n', ja: '- こんにちは\n' });
    assert.deepEqual(releaseNotes('2.0.0', repo), { 'en-US': '- hello', ja: '- こんにちは' });
  });

  it('refuses a version with no directory', () => {
    const repo = repoWith('2.0.0', { 'en-US': '- hello' });
    assert.throws(() => releaseNotes('3.0.0', repo), /no release notes for 3\.0\.0/);
  });

  it('refuses a directory with no locale files', () => {
    const repo = mkdtempSync(join(tmpdir(), 'kyuhachi-notes-'));
    mkdirSync(join(repo, 'release-notes', '4.0.0'), { recursive: true });
    assert.throws(() => releaseNotes('4.0.0', repo), /has no <locale>\.txt/);
  });

  it('refuses a whitespace-only file, which would publish as blank', () => {
    const repo = repoWith('4.0.0', { ja: '   \n' });
    assert.throws(() => releaseNotes('4.0.0', repo), /is empty/);
  });

  it('refuses notes past App Store Connect’s limit', () => {
    const repo = repoWith('4.0.0', { ja: 'x'.repeat(WHATS_NEW_MAX + 1) });
    assert.throws(() => releaseNotes('4.0.0', repo), /App Store Connect allows 4000/);
  });

  it('accepts notes exactly at the limit', () => {
    const repo = repoWith('4.0.0', { ja: 'x'.repeat(WHATS_NEW_MAX) });
    assert.equal(releaseNotes('4.0.0', repo).ja.length, WHATS_NEW_MAX);
  });

  it('ignores non-.txt files so a README can sit alongside', () => {
    const repo = repoWith('5.0.0', { 'en-US': '- hello' });
    writeFileSync(join(repo, 'release-notes', '5.0.0', 'notes.md'), 'scratch');
    assert.deepEqual(Object.keys(releaseNotes('5.0.0', repo)), ['en-US']);
  });
});

describe('the committed notes', () => {
  it('covers both locales the App Store lists for 1.1.0', () => {
    const notes = releaseNotes('1.1.0');
    assert.deepEqual(Object.keys(notes).sort(), ['en-US', 'ja']);
    assertEveryLocaleCovered(['en-US', 'ja'], notes, '1.1.0');
  });
});
