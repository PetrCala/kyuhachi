#!/usr/bin/env node
/**
 * Build the hosted legal pages from their Markdown sources.
 *
 *   docs/legal/privacy.md  ->  firebase/public/privacy.html  (served at /privacy)
 *   docs/legal/terms.md    ->  firebase/public/terms.html    (served at /terms)
 *                              firebase/public/index.html     (served at /)
 *
 * The Markdown in docs/legal/ is the single source of truth. This script is the
 * only thing that writes firebase/public/, which is git-ignored and regenerated
 * on every `firebase deploy --only hosting` via the predeploy hook in
 * firebase.json. Nothing here is committed, so the two can never drift.
 *
 * Deliberately dependency-free: the legal copy uses a small, fixed slice of
 * Markdown (headings, paragraphs, bullet lists, bold, links, autolinks) that we
 * author and control, so a purpose-built converter is simpler and more robust
 * here than pulling a parser into the deploy path. If the copy ever needs richer
 * Markdown (tables, nested lists, code), swap this for `marked` rather than
 * growing the converter below.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = join(ROOT, 'docs', 'legal');
const OUT_DIR = join(ROOT, 'firebase', 'public');

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Convert the inline subset (autolinks, links, bold) within already-escaped text. */
function inline(text) {
  return escapeHtml(text)
    // autolinks: <https://…> — escaped above to &lt;…&gt;
    .replace(/&lt;(https?:\/\/[^\s&]+?)&gt;/g, (_m, url) => `<a href="${url}">${url}</a>`)
    // [label](url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) => `<a href="${url}">${label}</a>`)
    // **bold**
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

/** Convert the block subset to HTML and pull out the first H1 as the page title. */
function markdownToHtml(md) {
  const lines = md.replace(/<!--[\s\S]*?-->/g, '').split('\n');
  const blocks = [];
  let title = null;

  for (let i = 0; i < lines.length; ) {
    const line = lines[i];

    if (line.trim() === '') { i++; continue; }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const content = heading[2].trim();
      if (level === 1 && title === null) title = content;
      blocks.push(`<h${level}>${inline(content)}</h${level}>`);
      i++;
      continue;
    }

    if (/^-\s+/.test(line)) {
      const items = [];
      while (i < lines.length && lines[i].trim() !== '') {
        if (/^-\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^-\s+/, '').trim());
        } else if (/^\s+\S/.test(lines[i]) && items.length) {
          items[items.length - 1] += ' ' + lines[i].trim(); // wrapped continuation
        } else {
          break;
        }
        i++;
      }
      blocks.push(`<ul>\n${items.map((it) => `  <li>${inline(it)}</li>`).join('\n')}\n</ul>`);
      continue;
    }

    const para = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,3})\s+/.test(lines[i]) &&
      !/^-\s+/.test(lines[i])
    ) {
      para.push(lines[i].trim());
      i++;
    }
    blocks.push(`<p>${inline(para.join(' '))}</p>`);
  }

  return { title: title ?? 'Kyuhachi', html: blocks.join('\n') };
}

function page({ title, bodyHtml, otherHref, otherLabel }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="all" />
<title>${escapeHtml(title)} · Kyuhachi</title>
<style>
  :root { --ink: #262837; --amber: #ffb300; --text: #1a1a1a; --muted: #666; --rule: #e5e5ea; --link: #1a56db; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    color: var(--text);
    background: #fafafa;
    font: 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    -webkit-text-size-adjust: 100%;
  }
  .wrap { max-width: 720px; margin: 0 auto; padding: 24px 20px 64px; }
  header { display: flex; align-items: center; gap: 12px; padding: 8px 0 24px; }
  .mark {
    width: 44px; height: 44px; border-radius: 12px; background: var(--ink);
    color: var(--amber); display: grid; place-items: center;
    font-weight: 700; font-size: 13px; line-height: 1; text-align: center; letter-spacing: 1px;
  }
  .brand { font-weight: 600; font-size: 18px; }
  h1 { font-size: 28px; line-height: 1.25; margin: 8px 0 4px; }
  h2 { font-size: 19px; margin: 32px 0 8px; }
  h3 { font-size: 16px; margin: 24px 0 8px; }
  p, li { color: var(--text); }
  ul { padding-left: 22px; }
  li { margin: 6px 0; }
  a { color: var(--link); text-decoration: none; }
  a:hover { text-decoration: underline; }
  hr { border: 0; border-top: 1px solid var(--rule); margin: 40px 0 20px; }
  footer { color: var(--muted); font-size: 14px; }
  footer a { color: var(--muted); text-decoration: underline; }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <div class="mark">九<br />八</div>
      <div class="brand">Kyuhachi</div>
    </header>
    <main>
${bodyHtml
  .split('\n')
  .map((l) => '      ' + l)
  .join('\n')}
    </main>
    <hr />
    <footer>
      <a href="/">Home</a> · <a href="${otherHref}">${escapeHtml(otherLabel)}</a>
    </footer>
  </div>
</body>
</html>
`;
}

function indexPage(privacyTitle, termsTitle) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Kyuhachi</title>
<style>
  :root { --ink: #262837; --amber: #ffb300; --text: #1a1a1a; --muted: #666; --rule: #e5e5ea; --link: #1a56db; }
  * { box-sizing: border-box; }
  body {
    margin: 0; color: #1a1a1a; background: #fafafa;
    font: 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  .wrap { max-width: 720px; margin: 0 auto; padding: 48px 20px 64px; }
  header { display: flex; align-items: center; gap: 12px; padding-bottom: 24px; }
  .mark {
    width: 44px; height: 44px; border-radius: 12px; background: var(--ink);
    color: var(--amber); display: grid; place-items: center;
    font-weight: 700; font-size: 13px; line-height: 1; text-align: center; letter-spacing: 1px;
  }
  .brand { font-weight: 600; font-size: 18px; }
  p { color: var(--muted); }
  ul { list-style: none; padding: 0; }
  li { margin: 12px 0; }
  a.row {
    display: block; padding: 16px 18px; background: #fff; border: 1px solid var(--rule);
    border-radius: 12px; color: #1a56db; text-decoration: none; font-weight: 500;
  }
  a.row:hover { border-color: #d0d0d6; }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <div class="mark">九<br />八</div>
      <div class="brand">Kyuhachi</div>
    </header>
    <p>Legal documents for the Kyuhachi app.</p>
    <ul>
      <li><a class="row" href="/privacy">${escapeHtml(privacyTitle)} →</a></li>
      <li><a class="row" href="/terms">${escapeHtml(termsTitle)} →</a></li>
    </ul>
  </div>
</body>
</html>
`;
}

function build() {
  mkdirSync(OUT_DIR, { recursive: true });

  const privacy = markdownToHtml(readFileSync(join(SRC_DIR, 'privacy.md'), 'utf8'));
  const terms = markdownToHtml(readFileSync(join(SRC_DIR, 'terms.md'), 'utf8'));

  writeFileSync(
    join(OUT_DIR, 'privacy.html'),
    page({ title: privacy.title, bodyHtml: privacy.html, otherHref: '/terms', otherLabel: terms.title }),
  );
  writeFileSync(
    join(OUT_DIR, 'terms.html'),
    page({ title: terms.title, bodyHtml: terms.html, otherHref: '/privacy', otherLabel: privacy.title }),
  );
  writeFileSync(join(OUT_DIR, 'index.html'), indexPage(privacy.title, terms.title));

  console.log(`Built legal pages -> ${OUT_DIR}`);
  console.log('  /            index.html');
  console.log('  /privacy     privacy.html');
  console.log('  /terms       terms.html');
}

build();
