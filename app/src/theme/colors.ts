/**
 * Color tokens. All color values in the app must reference this file.
 * Never use hex literals or named colors outside of this file.
 *
 * Structure: raw palette → semantic aliases exported as `colors`.
 * When dark mode is added, export a second `darkColors` object using the
 * same keys but different palette values. No other files need to change.
 */

const palette = {
  black:   '#1a1a1a',
  white:   '#ffffff',
  gray50:  '#fafafa',
  gray100: '#f2f2f7', // iOS system grouped background
  gray200: '#e5e5ea', // iOS separator
  gray300: '#dddddd',
  gray500: '#999999',
  gray600: '#888888',
  gray700: '#555555',
  gray800: '#333333',

  // Tier metals (challenge badges)
  gold:   '#b8893b',
  silver: '#8a8a8f',
  bronze: '#a9663a',
  // Deeper shade of each metal: struck-rim outline + embossed glyph on the badge
  goldDeep:   '#7a5a23',
  silverDeep: '#5b5b60',
  bronzeDeep: '#7a4527',

  // System red (destructive actions)
  red: '#ff3b30', // iOS system red

  // Brand (app icon / splash / logo mark, the vertical 九八 in Klee One)
  ink:   '#262837', // dark ground behind the mark
  amber: '#ffb300', // amber glyph on the mark

  // Onsen water: bath-blue used to mark visited onsens on the map
  water: '#2e8bc0',

  // Categorical data-viz ramp (Stats charts). Six distinct, muted hues plus a
  // neutral for "unreported". Ordered so transport modes read slow→fast:
  // foot (green) · bicycle (teal) · public (amber) · car (rust).
  chart1: '#4c9f70', // green
  chart2: '#3aa6a8', // teal
  chart3: '#e0a458', // amber
  chart4: '#c2683f', // rust
  chart5: '#7e6aa8', // muted purple
  chart6: '#b0656f', // muted rose
  chartNeutral: '#b8b8bd', // unreported / no-data segments

  // Scrim behind modal sheets (semi-transparent black)
  scrim: 'rgba(0, 0, 0, 0.4)',

  // Onsen mark grounds: deep dye tones, named for the traditional Japanese
  // colour each is drawn from. Seven distinct hues plus a neutral, all dark
  // enough that inverted text laid over them stays legible.
  ai:          '#38558a', // 藍 indigo
  seiheki:     '#2d6b66', // 青碧 celadon teal
  edomurasaki: '#584a86', // 江戸紫 plum
  matsuba:     '#456b3c', // 松葉 pine green
  karashi:     '#93762c', // 芥子 ochre
  bengara:     '#a04a2b', // 弁柄 rust
  suou:        '#7c3242', // 蘇芳 crimson
  sumi:        '#4a4a52', // 墨 neutral ink
} as const;

export const colors = {
  // Surfaces
  background:          palette.white,   // primary screen background
  backgroundSecondary: palette.gray100, // grouped lists, inset sections
  backgroundElevated:  palette.gray50,  // cards, text inputs
  overlay:             palette.scrim,   // dimming behind bottom-sheet modals

  // Text
  textPrimary:     palette.black,  // headings, primary content
  textSecondary:   palette.gray800, // supporting text
  textTertiary:    palette.gray700, // hints, captions
  textMuted:       palette.gray600, // placeholder-level, divider labels
  textPlaceholder: palette.gray500, // TextInput placeholder color
  textInverted:    palette.white,   // text on dark fills

  // Interactive
  actionPrimary:     palette.black, // primary button fill
  actionPrimaryText: palette.white, // text on primary buttons
  destructive:       palette.red, // destructive actions (sign out, delete)

  // Bottom tab bar
  tabBarActive:   palette.black,   // focused tab icon + label
  tabBarInactive: palette.gray500, // unfocused tab icon + label

  // Borders
  border:    palette.gray300, // input borders, card outlines
  separator: palette.gray200, // list dividers

  // Tier badges (challenge tiers: bronze / silver / gold)
  tierGold:   palette.gold,
  tierSilver: palette.silver,
  tierBronze: palette.bronze,
  // Deeper metal shade for the challenge badge rim + embossed mark
  tierGoldDeep:   palette.goldDeep,
  tierSilverDeep: palette.silverDeep,
  tierBronzeDeep: palette.bronzeDeep,

  // Brand mark (the logo tile on sign-in mirrors the app icon)
  brand:      palette.ink,   // brand surface / icon ground
  brandGlyph: palette.amber, // amber glyph on the brand surface

  // Map markers
  onsenVisited: palette.water, // bath-water blue pin for visited onsens

  // Data visualization (Stats charts). Categorical series + neutrals; index a
  // series with the `CHART_SERIES` array in components/charts.
  chart1: palette.chart1,
  chart2: palette.chart2,
  chart3: palette.chart3,
  chart4: palette.chart4,
  chart5: palette.chart5,
  chart6: palette.chart6,
  chartNeutral: palette.chartNeutral, // unreported buckets
  chartTrack: palette.gray200, // empty bar/track background

  // Passport stamp (collectible seal in the stamp-book screen)
  stampInk:       palette.black,   // seal frame, kanji, and inked date
  stampFrame:     palette.gray300, // outline of an unstamped slot
  stampWatermark: palette.gray200, // faint ♨ inside an unstamped slot

  // Generated onsen hero marks: the ground each mark is drawn on. One per
  // Kyushu prefecture, so a mark reads as its place at a glance, plus a neutral
  // for an onsen whose prefecture is outside the seven or not yet published.
  // Indexed rather than named for a prefecture (like the chart ramp): the
  // prefecture → ground mapping lives in lib/onsen-mark.ts so the theme keeps
  // no domain knowledge. Every ground is dark enough to carry the inverted
  // onsen name the map preview sheet overlays on it.
  markGround1: palette.ai,
  markGround2: palette.seiheki,
  markGround3: palette.edomurasaki,
  markGround4: palette.matsuba,
  markGround5: palette.karashi,
  markGround6: palette.bengara,
  markGround7: palette.suou,
  markGroundNeutral: palette.sumi,
} as const;

export type Color = keyof typeof colors;
