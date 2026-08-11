/**
 * The generated onsen mark: everything that turns one catalog onsen into the
 * designed emblem `OnsenHeroMark` draws, with no I/O and no randomness.
 *
 * Catalog photographs are gated off (see `SHOW_CATALOG_PHOTOS`) and licensed
 * per-onsen photography isn't obtainable, so the hero slot carries a drawn mark
 * instead of an empty plate. To be worth the space it has to say something, so
 * every part of it is seeded from data the catalog already publishes:
 *
 * - `prefecture` picks the ground colour — seven Kyushu prefectures, seven inks.
 * - `springQuality` picks the traditional pattern tiled over it: 青海波 waves for
 *   a chloride spring, 麻の葉 for the mineral springs, bubbles for a carbonated
 *   one, steam for everything else.
 * - `id` (the stable kyuhachiId) seeds the pattern's phase and scale and the
 *   soft light pools behind it, so two onsens in the same prefecture with the
 *   same spring quality still look like themselves — identically, on every
 *   device, across reinstalls.
 *
 * Nothing here reads `imageUrl` or `blurhash`: the mark is deliberately
 * independent of the scraped photo set the app is walking away from.
 */
import { colors } from '@/theme';

/**
 * The mark's drawing space. All geometry below is in these units; the component
 * scales the viewBox to cover whatever frame it's given, so a mark looks the
 * same in the 140pt detail band and the 200pt map preview hero. The aspect is
 * narrower than either hero so the cover scale is always driven by width, which
 * keeps the seal at the same height in both.
 */
export const MARK_VIEWBOX_WIDTH = 180;
export const MARK_VIEWBOX_HEIGHT = 100;

/** The traditional pattern tiled behind the seal. */
export type MarkMotif = 'seigaiha' | 'asanoha' | 'bubbles' | 'steam';

/** One motif's repeating tile: a single path, sized to its own period. */
export interface MarkTile {
  /** Path data for one tile, in viewBox units. */
  d: string;
  width: number;
  height: number;
  strokeWidth: number;
}

/** A soft light pool behind the pattern; placement is seeded per onsen. */
export interface MarkDisc {
  cx: number;
  cy: number;
  r: number;
}

export interface OnsenMarkSpec {
  /** Ground colour, from the onsen's prefecture. */
  ground: string;
  motif: MarkMotif;
  tile: MarkTile;
  /** Pattern phase and scale, from the onsen's id. */
  patternX: number;
  patternY: number;
  patternScale: number;
  /** Light pools behind the pattern, largest first. */
  discs: MarkDisc[];
  /** Stable, collision-free SVG id for this onsen's `<Pattern>`. */
  patternId: string;
}

export interface OnsenMarkInput {
  /** The stable kyuhachiId. Seeds every per-onsen variation. */
  id: string;
  prefecture: string;
  springQuality: string | null;
}

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

// FNV-1a, 32-bit. A hash rather than `Math.random` so a mark is the same on
// every device and after a reinstall: the id is the only input.
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** 32-bit FNV-1a over the string's UTF-16 code units. */
export function hashString(value: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

/**
 * Byte `index` of `seed`, mapped onto `[min, max]`. Four independent values per
 * hash; anything needing more takes a second hash of a salted id rather than
 * re-slicing bits it already spent.
 */
function seeded(seed: number, index: number, min: number, max: number): number {
  const byte = (seed >>> (index * 8)) & 0xff;
  return min + (byte / 255) * (max - min);
}

// ---------------------------------------------------------------------------
// Prefecture → ground
// ---------------------------------------------------------------------------

// Keyed on the bare prefecture name so a catalog that publishes 大分 and one
// that publishes 大分県 both land on the same ink.
const PREFECTURE_GROUNDS: Record<string, string> = {
  福岡: colors.markGround1,
  佐賀: colors.markGround2,
  長崎: colors.markGround3,
  熊本: colors.markGround4,
  大分: colors.markGround5,
  宮崎: colors.markGround6,
  鹿児島: colors.markGround7,
};

/** The ground ink for a prefecture; a neutral for anything outside Kyushu. */
export function groundForPrefecture(prefecture: string): string {
  const bare = prefecture.trim().replace(/[県]$/, '');
  return PREFECTURE_GROUNDS[bare] ?? colors.markGroundNeutral;
}

// ---------------------------------------------------------------------------
// Spring quality → motif
// ---------------------------------------------------------------------------

// `springQuality` is free Japanese text straight from the catalog
// (単純温泉, ナトリウム－炭酸水素塩泉, 含硫黄－ナトリウム－塩化物泉, …), so this
// matches by substring rather than trying to parse it. First match wins, which
// is what decides a compound quality like 炭酸水素塩・塩化物泉. Anything
// unrecognized — and a null quality, which is a real published state — falls
// through to steam, the motif that fits any hot spring.
const SPRING_MOTIFS: readonly (readonly [string, MarkMotif])[] = [
  ['硫黄', 'asanoha'],
  ['硫酸塩', 'asanoha'],
  ['含鉄', 'asanoha'],
  ['炭酸', 'bubbles'],
  ['放射能', 'bubbles'],
  ['塩化物', 'seigaiha'],
  ['単純', 'steam'],
];

const DEFAULT_MOTIF: MarkMotif = 'steam';

/** The motif a spring quality draws; `steam` when null or unrecognized. */
export function motifForSpringQuality(springQuality: string | null): MarkMotif {
  if (!springQuality) return DEFAULT_MOTIF;
  for (const [needle, motif] of SPRING_MOTIFS) {
    if (springQuality.includes(needle)) return motif;
  }
  return DEFAULT_MOTIF;
}

// ---------------------------------------------------------------------------
// Motif tiles
// ---------------------------------------------------------------------------

/** Two decimal places, trailing zeros dropped: keeps generated path data short. */
function n(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function line(from: readonly [number, number], to: readonly [number, number]): string {
  return `M${n(from[0])} ${n(from[1])}L${n(to[0])} ${n(to[1])}`;
}

/**
 * 青海波 — interlocking fans of concentric arcs, the wave scales that show up on
 * every other bathhouse noren. The tile is one full period of the alternation:
 * a row of fans on the half-height baseline, the next row offset by half a fan.
 */
function seigaihaTile(): MarkTile {
  const width = 12;
  const height = 24;
  const radii = [11.5, 8, 4.5];
  const parts: string[] = [];
  const fan = (cx: number, cy: number) => {
    for (const r of radii) {
      parts.push(`M${n(cx - r)} ${n(cy)}A${n(r)} ${n(r)} 0 0 1 ${n(cx + r)} ${n(cy)}`);
    }
  };
  for (const cx of [0, 12]) fan(cx, height / 2);
  for (const cx of [-6, 6, 18]) fan(cx, height);
  return { d: parts.join(''), width, height, strokeWidth: 0.9 };
}

/**
 * 麻の葉 — the hemp-leaf lattice: a hexagon grid, each hexagon spoked to its
 * vertices with the leaf medians drawn in. Fans out from a pointy-top hex
 * lattice, so the tile is one lattice period (√3·r across, 3·r down) with the
 * neighbouring centres drawn in and clipped by the tile.
 */
function asanohaTile(): MarkTile {
  const r = 9;
  const width = Math.sqrt(3) * r;
  const height = 3 * r;
  const parts: string[] = [];
  for (let row = 0; row <= 2; row += 1) {
    for (let col = -1; col <= 1; col += 1) {
      const cx = col * width + (row % 2 === 0 ? 0 : width / 2);
      const cy = row * 1.5 * r;
      const vertices = [0, 1, 2, 3, 4, 5].map((k) => {
        const angle = ((90 + 60 * k) * Math.PI) / 180;
        return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)] as const;
      });
      const midpoints = vertices.map(([x, y]) => [(cx + x) / 2, (cy + y) / 2] as const);
      for (let k = 0; k < 6; k += 1) {
        const next = (k + 1) % 6;
        parts.push(line(vertices[k], vertices[next])); // hexagon edge
        parts.push(line([cx, cy], vertices[k])); // spoke
        parts.push(line(vertices[k], midpoints[next])); // leaf
        parts.push(line(vertices[next], midpoints[k])); // leaf, mirrored
      }
    }
  }
  // One path, so the shared edges every hexagon draws twice are stroked once
  // and the overlaps don't darken.
  return { d: parts.join(''), width, height, strokeWidth: 0.55 };
}

/** Rising bubbles, for the carbonated springs. Circles as two half-arc turns. */
function bubblesTile(): MarkTile {
  const width = 20;
  const height = 20;
  const circles: readonly (readonly [number, number, number])[] = [
    [5, 6, 3],
    [14, 4, 1.6],
    [16, 12, 2.4],
    [8, 15, 1.9],
    [3, 17, 1.2],
  ];
  const d = circles
    .map(
      ([cx, cy, r]) =>
        `M${n(cx - r)} ${n(cy)}a${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-2 * r)} 0`
    )
    .join('');
  return { d, width, height, strokeWidth: 0.8 };
}

/**
 * Steam: plumes drifting up off the water. Each plume's control points are
 * mirrored top and bottom, so the tangent leaving the top of a tile matches the
 * one entering the next and the plumes read as continuous columns.
 */
function steamTile(): MarkTile {
  const width = 18;
  const height = 18;
  const d = [3, 9, 15]
    .map((x, index) => {
      const lean = index % 2 === 0 ? 2.4 : -2.4;
      return (
        `M${n(x)} ${n(height)}` +
        `C${n(x + lean)} 14 ${n(x + lean)} 10 ${n(x)} 9` +
        `C${n(x - lean)} 8 ${n(x - lean)} 4 ${n(x)} 0`
      );
    })
    .join('');
  return { d, width, height, strokeWidth: 0.9 };
}

// Built once at module load: the tiles are fixed geometry, and only the phase,
// scale and ground applied to them vary per onsen.
const TILES: Record<MarkMotif, MarkTile> = {
  seigaiha: seigaihaTile(),
  asanoha: asanohaTile(),
  bubbles: bubblesTile(),
  steam: steamTile(),
};

/** The repeating tile for a motif. */
export function tileForMotif(motif: MarkMotif): MarkTile {
  return TILES[motif];
}

// ---------------------------------------------------------------------------
// The mark
// ---------------------------------------------------------------------------

// How far the seeded values are allowed to roam. The scale range stays narrow
// enough that the pattern never stops reading as itself.
const PATTERN_SCALE_MIN = 0.85;
const PATTERN_SCALE_MAX = 1.25;
const DISC_RADIUS_MIN = 22;
const DISC_RADIUS_MAX = 44;
// The smaller pool, as a fraction of the larger one.
const DISC_SECONDARY_RATIO = 0.55;

/**
 * The full drawing spec for one onsen's mark. Pure and total: same input, same
 * output, and every field is populated for any prefecture and any (or no)
 * spring quality.
 */
export function onsenMark({ id, prefecture, springQuality }: OnsenMarkInput): OnsenMarkSpec {
  const motif = motifForSpringQuality(springQuality);
  const tile = tileForMotif(motif);
  // Two hashes: four independent bytes each, and the composition shouldn't
  // correlate with the pattern phase.
  const patternSeed = hashString(id);
  const discSeed = hashString(`${id}:disc`);

  const primary: MarkDisc = {
    cx: seeded(discSeed, 0, 10, MARK_VIEWBOX_WIDTH - 10),
    cy: seeded(discSeed, 1, 5, MARK_VIEWBOX_HEIGHT - 5),
    r: seeded(patternSeed, 3, DISC_RADIUS_MIN, DISC_RADIUS_MAX),
  };

  return {
    ground: groundForPrefecture(prefecture),
    motif,
    tile,
    patternX: seeded(patternSeed, 0, 0, tile.width),
    patternY: seeded(patternSeed, 1, 0, tile.height),
    patternScale: seeded(patternSeed, 2, PATTERN_SCALE_MIN, PATTERN_SCALE_MAX),
    discs: [
      primary,
      {
        cx: seeded(discSeed, 2, 10, MARK_VIEWBOX_WIDTH - 10),
        cy: seeded(discSeed, 3, 5, MARK_VIEWBOX_HEIGHT - 5),
        r: primary.r * DISC_SECONDARY_RATIO,
      },
    ],
    // SVG ids share one namespace across every mounted mark, so this has to be
    // unique per onsen; the id already is, once stripped to id-safe characters.
    patternId: `onsen-mark-${id.replace(/[^a-zA-Z0-9_-]/g, '')}`,
  };
}
