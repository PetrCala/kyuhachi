/**
 * Border radius tokens.
 * All borderRadius values must reference this file.
 */

export const radii = {
  sm:   6,
  md:   8,    // buttons, inputs — most common
  lg:   12,
  xl:   16,
  full: 9999, // pills, circular elements
} as const;

export type Radius = keyof typeof radii;
