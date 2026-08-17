/**
 * Guards the map-freeze trap that has now bitten twice (#109, then again when the
 * onsen preview sheet was added): a full-screen sibling over a native MapView can
 * swallow the map's pan gesture on iOS, leaving the map frozen while overlay
 * buttons still tap. `@gorhom/bottom-sheet` renders exactly such a sibling, an
 * `absoluteFill` `pointerEvents="box-none"` container, and it does so even while
 * the sheet is closed. So a sheet sharing a screen with a MapView must be mounted
 * conditionally, only while it has something to show, never left mounted idle.
 *
 * A source scan rather than a render test, for the same reason as
 * accessibility-coverage: the screens involved sit behind auth, location and
 * Firestore data, and a scan fails on the exact line that regressed.
 */
import * as fs from 'fs';
import * as path from 'path';

const APP_ROOT = path.resolve(__dirname, '../..');

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
 * True when the JSX element starting at `start` is rendered behind a condition,
 * i.e. the source right before it ends in a `&&`, a ternary branch, or an opening
 * parenthesis belonging to one. Comments are stripped first so an explanatory
 * `{/* ... *\/}` block between the guard and the element doesn't hide it.
 */
function isConditionallyRendered(source: string, start: number): boolean {
  const before = source
    .slice(0, start)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\/[^\n]*/g, '')
    .trimEnd();
  return /(&&|\?|:)\s*\(?$/.test(before);
}

describe('map overlay coverage', () => {
  const mapFiles = collectTsxFiles(path.join(APP_ROOT, 'app'))
    .concat(collectTsxFiles(path.join(APP_ROOT, 'src', 'components')))
    .filter((file) => /<MapView\b/.test(fs.readFileSync(file, 'utf8')));

  it('finds the screens that render a map', () => {
    // A broken path glob would make the real assertions below vacuously pass.
    expect(mapFiles.length).toBeGreaterThan(0);
  });

  it('mounts every bottom sheet on a map screen conditionally', () => {
    const unguarded: string[] = [];
    let sheetsFound = 0;

    for (const file of mapFiles) {
      const source = fs.readFileSync(file, 'utf8');
      for (const match of source.matchAll(/<([A-Z]\w*Sheet)\b/g)) {
        sheetsFound++;
        if (isConditionallyRendered(source, match.index)) continue;
        const line = source.slice(0, match.index).split('\n').length;
        unguarded.push(`${path.relative(APP_ROOT, file)}:${line} <${match[1]}>`);
      }
    }

    expect(unguarded).toEqual([]);
    // The map screen does render a preview sheet; if this ever hits zero the scan
    // has stopped matching (a rename) and is no longer guarding anything.
    expect(sheetsFound).toBeGreaterThan(0);
  });
});
