/**
 * Guards the map-freeze trap (#109, and again when the onsen preview sheet was
 * added) at its worst blast radius: the app root. `@gorhom/bottom-sheet` always
 * renders a full-screen `absoluteFill` / `pointerEvents="box-none"` container
 * (`BottomSheetHostingContainer`), and it does so even while the sheet is
 * closed. A sheet hosted by a provider in `app/_layout.tsx` therefore lays that
 * container over *every* screen, the map tab included, where it can swallow the
 * native MapView's pan gesture on iOS while overlay buttons still tap.
 *
 * So a root-mounted sheet must render its `BottomSheet` conditionally, only
 * while it has something to show, never left mounted idle.
 *
 * A source scan rather than a render test, for the same reason as
 * accessibility-coverage: the root layout sits behind auth, fonts and Firestore
 * data, and a scan fails on the exact line that regressed.
 */
import * as fs from 'fs';
import * as path from 'path';

const APP_ROOT = path.resolve(__dirname, '../..');
const ROOT_LAYOUT = path.join(APP_ROOT, 'app', '_layout.tsx');

/** Resolve an import specifier from the root layout to a .tsx file, if it is one. */
function resolveLocalImport(specifier: string): string | null {
  let base: string;
  if (specifier.startsWith('@/')) {
    base = path.join(APP_ROOT, 'src', specifier.slice(2));
  } else if (specifier.startsWith('.')) {
    base = path.resolve(path.dirname(ROOT_LAYOUT), specifier);
  } else {
    return null;
  }
  for (const candidate of [`${base}.tsx`, path.join(base, 'index.tsx')]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
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

describe('root sheet mounting', () => {
  const layoutSource = fs.readFileSync(ROOT_LAYOUT, 'utf8');

  // Everything the root layout pulls in directly: the providers wrapping the
  // whole app, which is where a permanently mounted sheet does the damage.
  const rootComponents = [...layoutSource.matchAll(/from\s+'([^']+)'/g)]
    .map((match) => resolveLocalImport(match[1]))
    .filter((file): file is string => file !== null);

  const rootSheetHosts = rootComponents.filter((file) =>
    /@gorhom\/bottom-sheet/.test(fs.readFileSync(file, 'utf8'))
  );

  it('finds the root-mounted components that host a bottom sheet', () => {
    // A broken resolver would make the real assertion below vacuously pass.
    expect(rootSheetHosts.length).toBeGreaterThan(0);
  });

  it('mounts every root-hosted bottom sheet conditionally', () => {
    const unguarded: string[] = [];

    for (const file of rootSheetHosts) {
      const source = fs.readFileSync(file, 'utf8');
      // Anchored to the start of a line so the `useRef<BottomSheet>` type
      // argument isn't mistaken for the element; formatting puts every JSX tag
      // on its own line.
      for (const match of source.matchAll(/^[ \t]*<BottomSheet(?!\w)/gm)) {
        if (isConditionallyRendered(source, match.index)) continue;
        const line = source.slice(0, match.index).split('\n').length;
        unguarded.push(`${path.relative(APP_ROOT, file)}:${line} <BottomSheet>`);
      }
    }

    expect(unguarded).toEqual([]);
  });
});
