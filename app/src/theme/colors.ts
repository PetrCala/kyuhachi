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

  // Borders
  border:    palette.gray300, // input borders, card outlines
  separator: palette.gray200, // list dividers
} as const;

export type Color = keyof typeof colors;
