import { Image } from 'react-native';

const GLYPH = require('../../assets/onsen-symbol.png');

interface OnsenIconProps {
  /** Tint applied to the template glyph (the tab bar's active/inactive color). */
  color: string;
  /** Glyph size in points. */
  size: number;
}

/**
 * The classic Japanese hot-spring mark (♨) — three steam waves over a bowl —
 * for the Onsens tab. The canonical U+2668 glyph from Noto Sans Symbols 2 (SIL
 * OFL), rasterized to a white-on-transparent template and tinted at runtime, so
 * it picks up the tab bar's active/inactive color like the Ionicons on the other
 * tabs. Source art is rendered by scripts/render-onsen-icon.py.
 */
export default function OnsenIcon({ color, size }: OnsenIconProps) {
  return (
    <Image
      source={GLYPH}
      // width/height/tintColor are runtime values from props — the allowed
      // exception to the no-inline-literal style rule.
      style={{ width: size, height: size, tintColor: color }}
      resizeMode="contain"
    />
  );
}
