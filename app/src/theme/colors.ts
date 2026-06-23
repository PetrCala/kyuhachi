/**
 * Color tokens. All color values in the app must reference this file.
 * Never use hex literals or named colors outside of this file.
 *
 * Structure: raw palette → semantic aliases exported as `colors`.
 * When dark mode is added, export a second `darkColors` object using the
 * same keys but different palette values — no other files need to change.
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

  // System red (destructive actions)
  red: '#ff3b30', // iOS system red

  // Brand (app icon / splash / logo mark — the vertical 九八 in Klee One)
  ink:   '#262837', // dark ground behind the mark
  amber: '#ffb300', // amber glyph on the mark

  // Onsen water — bath-blue used to mark visited onsens on the map
  water: '#2e8bc0',
} as const;

export const colors = {
  // Surfaces
  background:          palette.white,   // primary screen background
  backgroundSecondary: palette.gray100, // grouped lists, inset sections
  backgroundElevated:  palette.gray50,  // cards, text inputs

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

  // Brand mark (the logo tile on sign-in mirrors the app icon)
  brand:      palette.ink,   // brand surface / icon ground
  brandGlyph: palette.amber, // amber glyph on the brand surface

  // Map markers
  onsenVisited: palette.water, // bath-water blue pin for visited onsens
} as const;

export type Color = keyof typeof colors;
