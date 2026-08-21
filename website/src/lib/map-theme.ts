/**
 * Map colours, read from the stylesheet tokens rather than repeated here.
 *
 * Every colour on the map has a twin in the side panel: the legend swatch next
 * to each layer toggle is a CSS rule, the line or circle itself is a MapLibre
 * paint property in JS. When the two were both hex literals they drifted. The
 * tokens in styles.css are the single source; this reads them once at module
 * load, since MapLibre wants plain strings and the site has no theme switch to
 * invalidate them.
 */

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export const MAP_COLORS: {
  walked: string;
  gap: string;
  planned: string;
  plannedOnsenRing: string;
  plannedOnsenFill: string;
  visited: string;
  visitedRing: string;
  visitedRingSelected: string;
  allOnsen: string;
  allOnsenRing: string;
  headRing: string;
} = {
  walked: token('--map-walked'),
  gap: token('--map-gap'),
  planned: token('--map-planned'),
  plannedOnsenRing: token('--map-planned-onsen-ring'),
  plannedOnsenFill: token('--map-planned-onsen-fill'),
  visited: token('--map-visited'),
  visitedRing: token('--map-visited-ring'),
  visitedRingSelected: token('--map-visited-ring-selected'),
  allOnsen: token('--map-all-onsen'),
  allOnsenRing: token('--map-all-onsen-ring'),
  // The one colour without a stylesheet twin: the timeline head marker has no
  // legend swatch to drift from, and a "current position" dot wants a plain
  // white ring on any palette, so a literal here is honest rather than lazy.
  headRing: '#ffffff',
};
