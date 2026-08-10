import { averageRgbFromBlurhash, contrastingTint, rgbToCss } from '@/lib/blurhash-color';
import { colors } from '@/theme';

// Each hash below is a minimal (1x1-component, no AC) BlurHash whose DC chars
// were hand-encoded for an exact known average colour, so the decode can be
// checked byte-for-byte rather than just "looks plausible".
const PURE_RED = '00TI:j'; // DC packs (255, 0, 0)
const PURE_BLUE = '000036'; // DC packs (0, 0, 255)
const MID_GRAY = '00Eyb['; // DC packs (128, 128, 128)

describe('averageRgbFromBlurhash', () => {
  it('decodes the DC component of a known BlurHash', () => {
    expect(averageRgbFromBlurhash(PURE_RED)).toEqual({ r: 255, g: 0, b: 0 });
    expect(averageRgbFromBlurhash(PURE_BLUE)).toEqual({ r: 0, g: 0, b: 255 });
  });

  it('round-trips a mid-tone through the sRGB<->linear conversion', () => {
    expect(averageRgbFromBlurhash(MID_GRAY)).toEqual({ r: 128, g: 128, b: 128 });
  });

  it('falls back to a token colour for null (no BlurHash published yet)', () => {
    expect(averageRgbFromBlurhash(null)).toEqual({ r: 242, g: 242, b: 247 });
  });

  it('falls back to the same token colour for a malformed hash', () => {
    expect(averageRgbFromBlurhash('bad')).toEqual(averageRgbFromBlurhash(null));
  });
});

describe('rgbToCss', () => {
  it('formats an Rgb as a CSS rgb() string', () => {
    expect(rgbToCss({ r: 255, g: 0, b: 0 })).toBe('rgb(255, 0, 0)');
  });
});

describe('contrastingTint', () => {
  it('picks the dark ink for a light average colour', () => {
    expect(contrastingTint({ r: 255, g: 255, b: 255 })).toBe(colors.textPrimary);
  });

  it('picks the inverted (light) ink for a dark average colour', () => {
    expect(contrastingTint({ r: 0, g: 0, b: 0 })).toBe(colors.textInverted);
  });
});
