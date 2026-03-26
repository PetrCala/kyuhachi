/**
 * Spacing tokens. 4pt base grid.
 * All padding, margin, and gap values must use these tokens.
 *
 * Usage: spacing[4] → 16px, spacing[6] → 24px
 * The key is the multiplier (×4pt); the value is the pixel size.
 */

export const spacing = {
  1:   4,  // micro: marginTop on tightly stacked form elements
  2:   8,  // tight: small padding, compact buttons
  3:  12,  // form: input inner padding
  4:  16,  // base: standard margin/padding unit
  5:  20,  // medium: section separators, horizontal screen padding (compact)
  6:  24,  // large: screen padding
  8:  32,  // wide: screen padding (sign-in form)
  10: 40,  // xl: large vertical separators
  12: 48,  // hero: title bottom margin
} as const;

export type SpacingKey = keyof typeof spacing;
