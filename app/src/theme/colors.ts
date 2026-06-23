/**
 * Color tokens. All color values in the app must reference this file.
 * Never use hex literals or named colors outside of this file.
 *
 * Structure: raw palette → semantic aliases. `colors` (light) is the source of
 * truth for the shape; `darkColors` is typed `typeof colors`, so a missing or
 * extra key is a compile error (same guarantee as `ja.ts` for i18n).
 *
 * Components must NOT import `colors` directly if they want to react to theme
 * changes — a `StyleSheet.create()` reads its values once at module load and
 * never updates. Instead read the active palette from `useTheme()` and build
 * styles with `useThemedStyles()`. The static `colors` export remains the light
 * default for screens not yet converted.
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
  // Deeper shade of each metal — struck-rim outline + embossed glyph on the badge
  goldDeep:   '#7a5a23',
  silverDeep: '#5b5b60',
  bronzeDeep: '#7a4527',

  // System red (destructive actions)
  red: '#ff3b30', // iOS system red

  // Brand (app icon / splash / logo mark — the vertical 九八 in Klee One)
  ink:   '#262837', // dark ground behind the mark
  amber: '#ffb300', // amber glyph on the mark

  // Onsen water — bath-blue used to mark visited onsens on the map
  water: '#2e8bc0',

  // Scrim behind modal sheets (semi-transparent black)
  scrim: 'rgba(0, 0, 0, 0.4)',
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
} as const;

export type Color = keyof typeof colors;

/**
 * The shape every theme must satisfy: every semantic key from `colors`, mapped
 * to a (widened) color string. Light is the source of truth for the key set;
 * `darkColors` is checked against it. Same guarantee as `ja.ts` for i18n.
 */
export type ThemeColors = Record<Color, string>;

// Dark raw palette. iOS dark convention: the base screen is darkest and each
// elevation step gets lighter (the inverse of light mode).
const darkPalette = {
  bgBase:     '#000000', // grouped-list backdrop (darkest layer)
  bgSurface:  '#1c1c1e', // cards, primary surfaces
  bgElevated: '#2c2c2e', // inputs, raised controls

  textHigh:   '#f5f5f7', // headings, primary content
  textMid:    '#c7c7cc', // supporting text
  textLow:    '#aeaeb2', // hints, captions
  textFaint:  '#8e8e93', // placeholder-level, divider labels
  textGhost:  '#636366', // TextInput placeholder color

  separator:  '#38383a', // hairlines, input borders

  red: '#ff453a', // iOS dark-mode system red

  scrim: 'rgba(0, 0, 0, 0.6)', // heavier dim behind sheets on a dark ground
} as const;

/**
 * Dark theme. Keys mirror `colors` exactly (enforced by the `ThemeColors`
 * annotation). Tier metals and the brand mark are identity colors and read
 * fine on a dark ground, so they are intentionally carried over unchanged.
 */
export const darkColors: ThemeColors = {
  // Surfaces
  background:          darkPalette.bgSurface,
  backgroundSecondary: darkPalette.bgBase,
  backgroundElevated:  darkPalette.bgElevated,
  overlay:             darkPalette.scrim,

  // Text
  textPrimary:     darkPalette.textHigh,
  textSecondary:   darkPalette.textMid,
  textTertiary:    darkPalette.textLow,
  textMuted:       darkPalette.textFaint,
  textPlaceholder: darkPalette.textGhost,
  textInverted:    palette.black, // dark text on light/amber fills

  // Interactive — primary button inverts to a light fill with dark text
  actionPrimary:     darkPalette.textHigh,
  actionPrimaryText: palette.black,
  destructive:       darkPalette.red,

  // Bottom tab bar
  tabBarActive:   darkPalette.textHigh,
  tabBarInactive: darkPalette.textFaint,

  // Borders
  border:    darkPalette.separator,
  separator: darkPalette.separator,

  // Tier badges — carried over (identity colors)
  tierGold:   palette.gold,
  tierSilver: palette.silver,
  tierBronze: palette.bronze,
  tierGoldDeep:   palette.goldDeep,
  tierSilverDeep: palette.silverDeep,
  tierBronzeDeep: palette.bronzeDeep,

  // Brand mark — carried over (identity colors)
  brand:      palette.ink,
  brandGlyph: palette.amber,

  // Map markers — carried over
  onsenVisited: palette.water,
};

export const themes = {
  light: colors,
  dark: darkColors,
} as const;

export type ColorScheme = keyof typeof themes;
