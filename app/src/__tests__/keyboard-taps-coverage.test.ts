/**
 * Guards against the "first tap only closes the keyboard" bug: a scrollable that
 * sits on the same screen as a text input swallows the first tap on any row or
 * button while the keyboard is up, because React Native defaults
 * `keyboardShouldPersistTaps` to 'never'. Every such scrollable must set the
 * prop explicitly ('handled' in practice, so a tap that a child handles goes
 * through and a tap on empty space still dismisses the keyboard).
 *
 * A source scan rather than a render test, for the same reason as
 * accessibility-coverage: the screens involved sit behind auth, location and
 * Firestore data, and a scan fails on the exact line that regressed.
 */
import * as fs from 'fs';
import * as path from 'path';

const APP_ROOT = path.resolve(__dirname, '../..');

const SCROLLABLE_TAGS = [
  'ScrollView',
  'FlatList',
  'SectionList',
  'BottomSheetScrollView',
  'BottomSheetFlatList',
  'BottomSheetSectionList',
];

function collectTsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectTsxFiles(full));
    } else if (entry.name.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Returns the source of the opening JSX tag starting at `start`, i.e. everything
 * up to the `>` that closes it. Brace depth is tracked so a `>` inside a prop
 * expression (an arrow function, a comparison) doesn't end the tag early.
 */
function openingTag(source: string, start: number): string {
  let depth = 0;
  let i = start;
  while (i < source.length) {
    const char = source[i];
    if (char === '{') depth++;
    else if (char === '}') depth--;
    else if (char === '>' && depth === 0) break;
    i++;
  }
  return source.slice(start, i);
}

describe('keyboard tap coverage', () => {
  const files = [
    ...collectTsxFiles(path.join(APP_ROOT, 'app')),
    ...collectTsxFiles(path.join(APP_ROOT, 'src', 'components')),
  ];

  it('scans a meaningful number of files', () => {
    // A broken path glob would make the real assertion below vacuously pass.
    expect(files.length).toBeGreaterThan(50);
  });

  it('sets keyboardShouldPersistTaps on scrollables that share a screen with a text input', () => {
    const pattern = new RegExp(`<(${SCROLLABLE_TAGS.join('|')})\\b`, 'g');
    const gaps: string[] = [];

    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      if (!/<TextInput\b/.test(source)) continue;
      for (const match of source.matchAll(pattern)) {
        const tag = openingTag(source, match.index);
        if (/keyboardShouldPersistTaps/.test(tag)) continue;
        const line = source.slice(0, match.index).split('\n').length;
        gaps.push(`${path.relative(APP_ROOT, file)}:${line} <${match[1]}>`);
      }
    }

    expect(gaps).toEqual([]);
  });
});
