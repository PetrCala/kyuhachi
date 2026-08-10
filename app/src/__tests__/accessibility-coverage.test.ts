/**
 * Guards the accessibility pass from rotting: every interactive element in a
 * shipped screen or component must carry at least one accessibility prop, so
 * VoiceOver announces a role rather than reading raw glyphs (or nothing).
 *
 * This is deliberately a source scan rather than a render test. Interactive
 * elements are spread over ~80 files and most sit behind data that a unit test
 * would have to fake; a scan covers all of them at once and fails on the exact
 * line that regressed.
 *
 * What counts as "enough" is one of accessibilityRole / accessibilityLabel /
 * accessible / accessibilityElementsHidden / importantForAccessibility. A
 * Pressable wrapping a <Text> already gets its spoken label from that child, so
 * accessibilityRole="button" alone is a complete fix there; an icon-only control
 * needs accessibilityLabel.
 */
import * as fs from 'fs';
import * as path from 'path';

const APP_ROOT = path.resolve(__dirname, '../..');

/** Screens under app/dev are gated behind DEV_TOOLS_ENABLED and never ship. */
const EXCLUDED = [path.join('app', 'dev')];

const INTERACTIVE_TAGS = [
  'Pressable',
  'TouchableOpacity',
  'TouchableHighlight',
  'TouchableWithoutFeedback',
  'Switch',
  'TextInput',
];

const A11Y_PROP =
  /accessibilityLabel|accessibilityRole|accessibilityElementsHidden|importantForAccessibility|accessible=|accessible\s*$/;

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

describe('accessibility coverage', () => {
  const files = [
    ...collectTsxFiles(path.join(APP_ROOT, 'app')),
    ...collectTsxFiles(path.join(APP_ROOT, 'src', 'components')),
  ].filter((file) => !EXCLUDED.some((excluded) => file.includes(excluded)));

  it('scans a meaningful number of files', () => {
    // A broken path glob would make the real assertion below vacuously pass.
    expect(files.length).toBeGreaterThan(50);
  });

  it('gives every interactive element an accessibility prop', () => {
    const pattern = new RegExp(`<(${INTERACTIVE_TAGS.join('|')})\\b`, 'g');
    const gaps: string[] = [];

    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      for (const match of source.matchAll(pattern)) {
        const tag = openingTag(source, match.index);
        if (A11Y_PROP.test(tag)) continue;
        const line = source.slice(0, match.index).split('\n').length;
        gaps.push(`${path.relative(APP_ROOT, file)}:${line} <${match[1]}>`);
      }
    }

    expect(gaps).toEqual([]);
  });
});
