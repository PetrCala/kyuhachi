/**
 * Guards the "one tab layout, one MapView" invariant at its source.
 *
 * `/`, `/map`, `/onsens` and `/menu` live inside `(tabs)`. Every other screen
 * under `app/` is a root-stack sibling of that layout, and from one of those a
 * `push`, `replace`, `navigate` or `<Redirect>` to a tab route resolves against
 * the root stack (expo-router's `findDivergentState` stops at the first level,
 * where the current route is the sibling, not `(tabs)`), which mounts a *second*
 * tab layout on top of the first: two live MapViews, the first left to rot, and
 * a root stack deep enough to arm iOS 26's content-wide swipe-back over the
 * map. That is one documented cause of the frozen map (#238), and it came back
 * through `replace('/')` after the pushes were fixed.
 *
 * The only way into the tabs from a root-level screen is `router.dismissTo`
 * (POP_TO: returns to the existing layout, or replaces the current route when
 * there is none) or the `RedirectHome` component that wraps it.
 *
 * A source scan rather than a render test, in the house style of the other
 * coverage scans: it fails on the exact line that regressed.
 */
import * as fs from 'fs';
import * as path from 'path';

const APP_ROOT = path.resolve(__dirname, '../..');
const ROUTES_DIR = path.join(APP_ROOT, 'app');
const TABS_DIR = path.join(ROUTES_DIR, '(tabs)');

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

// A tab route as a string literal: '/', '/map', '/onsens', '/menu', or the
// group itself, optionally with the '(tabs)/' prefix.
const TAB_HREF = String.raw`['"]\/(?:\(tabs\)\/?)?(?:map|onsens|menu|index)?['"]`;

const FORBIDDEN: { label: string; pattern: RegExp }[] = [
  {
    label: 'router.push/replace/navigate to a tab route',
    pattern: new RegExp(String.raw`\.(?:push|replace|navigate)\(\s*${TAB_HREF}`, 'g'),
  },
  {
    label: 'router.push/replace/navigate with a tab pathname',
    pattern: new RegExp(
      String.raw`\.(?:push|replace|navigate)\(\s*\{[^}]*pathname:\s*${TAB_HREF}`,
      'g'
    ),
  },
  {
    label: '<Redirect> to a tab route',
    pattern: new RegExp(String.raw`<Redirect\s[^>]*href=${TAB_HREF}`, 'g'),
  },
  {
    label: '<Link> to a tab route',
    pattern: new RegExp(String.raw`<Link\s[^>]*href=${TAB_HREF}`, 'g'),
  },
];

describe('root-level navigation into the tab layout', () => {
  const rootLevelScreens = collectTsxFiles(ROUTES_DIR).filter(
    (file) => !file.startsWith(TABS_DIR + path.sep)
  );

  it('finds the root-level screens', () => {
    // A broken path glob would make the real assertion below vacuously pass.
    expect(rootLevelScreens.length).toBeGreaterThan(0);
  });

  it('never pushes, replaces, or redirects into a tab route (use router.dismissTo or RedirectHome)', () => {
    const offenders: string[] = [];
    for (const file of rootLevelScreens) {
      const source = fs.readFileSync(file, 'utf8');
      for (const { label, pattern } of FORBIDDEN) {
        for (const match of source.matchAll(pattern)) {
          const line = source.slice(0, match.index).split('\n').length;
          offenders.push(`${path.relative(APP_ROOT, file)}:${line} ${label}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('still allows the tab layout itself to jump between tabs', () => {
    // The home screen's "View route on map" push is inside the tab layout and
    // resolves against the tab navigator; it must not be caught by the scan.
    const home = fs.readFileSync(path.join(TABS_DIR, 'index.tsx'), 'utf8');
    expect(home).toMatch(/pathname: '\/map'/);
  });
});
