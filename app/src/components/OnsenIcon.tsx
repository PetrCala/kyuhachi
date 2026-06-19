import { Image } from 'react-native';

const FILLED = require('../../assets/onsen-symbol.png');
const OUTLINE = require('../../assets/onsen-symbol-outline.png');

interface OnsenIconProps {
  /** Tint applied to the template glyph (active/inactive tab color). */
  color: string;
  /** Glyph size in points. */
  size: number;
  /** Filled bowl when focused, open dish outline otherwise. */
  focused: boolean;
}

/**
 * The classic Japanese hot-spring mark (♨) — three steam waves over a bowl —
 * for the Onsens tab. A white-on-transparent template PNG tinted at runtime, so
 * it picks up the tab bar's active/inactive color exactly like the Ionicons on
 * the other tabs. Source art is rendered by scripts/render-onsen-icon.py.
 */
export default function OnsenIcon({ color, size, focused }: OnsenIconProps) {
  return (
    <Image
      source={focused ? FILLED : OUTLINE}
      // width/height/tintColor are runtime values from props — the allowed
      // exception to the no-inline-literal style rule.
      style={{ width: size, height: size, tintColor: color }}
      resizeMode="contain"
    />
  );
}
