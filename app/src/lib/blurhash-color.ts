/**
 * Derives just the average ("DC") colour out of a BlurHash string, without
 * decoding the full image. A BlurHash packs its average colour into
 * characters 2-5: a base83-encoded 24-bit RGB value, produced by averaging
 * the source image in linear light and re-encoding to sRGB. This is a small
 * slice of the full BlurHash decode algorithm, not a new colour model, kept
 * local rather than pulling in the `blurhash` package for one value.
 *
 * Algorithm reference: https://github.com/woltapp/blurhash/blob/master/Algorithm.md
 */
import { colors } from '@/theme';

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const BASE83_CHARS =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~';

function decode83(str: string): number {
  let value = 0;
  for (const char of str) {
    value = value * 83 + BASE83_CHARS.indexOf(char);
  }
  return value;
}

function sRGBToLinear(value: number): number {
  const v = value / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function linearToSRGB(value: number): number {
  const v = Math.max(0, Math.min(1, value));
  return v <= 0.0031308
    ? Math.round(v * 12.92 * 255)
    : Math.round((1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255);
}

function hexToRgb(hex: string): Rgb {
  const int = parseInt(hex.slice(1), 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

// Token fallback for onsens with no BlurHash yet (blurhash === null is a real
// published state, not an error: see onsenDoc() in __fixtures__/onsen-doc.ts).
// A neutral surface tone rather than a fixed brand colour; derived from the
// token itself rather than a literal so the two never drift apart.
const FALLBACK_RGB: Rgb = hexToRgb(colors.backgroundSecondary);

/**
 * The average colour of the photo a BlurHash was generated from. Returns a
 * neutral fallback for `null` (no BlurHash published) or a malformed string.
 */
export function averageRgbFromBlurhash(blurhash: string | null): Rgb {
  if (!blurhash || blurhash.length < 6) return FALLBACK_RGB;
  const value = decode83(blurhash.slice(2, 6));
  return {
    r: linearToSRGB(sRGBToLinear(value >> 16)),
    g: linearToSRGB(sRGBToLinear((value >> 8) & 255)),
    b: linearToSRGB(sRGBToLinear(value & 255)),
  };
}

/** CSS-usable form of an {@link Rgb}, for a runtime-computed `backgroundColor`. */
export function rgbToCss({ r, g, b }: Rgb): string {
  return `rgb(${r}, ${g}, ${b})`;
}

// Perceived-brightness threshold (ITU-R BT.601 luma) below which a colour
// reads as dark. Picks a legible glyph tint against an arbitrary derived
// tint: light photos get the dark ink, dark photos get the inverted one.
const LUMA_THRESHOLD = 140;

/** A glyph colour that stays legible against `rgb`, however light or dark. */
export function contrastingTint(rgb: Rgb): string {
  const luma = rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114;
  return luma >= LUMA_THRESHOLD ? colors.textPrimary : colors.textInverted;
}
