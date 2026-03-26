/**
 * Typography tokens.
 * All fontSize and fontWeight values must reference this file.
 *
 * Sizes loosely follow iOS Dynamic Type scale but are fixed values for Phase 1.
 * Dynamic Type support can be added in Phase 4 without changing these tokens.
 */

export const typography = {
  sizes: {
    xs:   12, // captions, badges
    sm:   14, // footnotes, secondary labels, button sub-labels
    md:   16, // body text, text inputs, primary button labels
    lg:   17, // standard iOS body (reserved for future use)
    xl:   20, // section headings
    xxl:  26, // screen titles (sign-in)
    xxxl: 28, // hero titles (home screen)
  },
  weights: {
    regular:  '400' as const,
    medium:   '500' as const,
    semibold: '600' as const,
    bold:     '700' as const,
  },
} as const;
