import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Path, Pattern, Rect, Text as SvgText } from 'react-native-svg';
import {
  MARK_VIEWBOX_HEIGHT,
  MARK_VIEWBOX_WIDTH,
  onsenMark,
  type OnsenMarkInput,
} from '@/lib/onsen-mark';
import { colors, spacing, typography } from '@/theme';

// Ink weights. Everything above the ground is drawn in the inverted ink at low
// opacity, so a mark holds together on any of the seven grounds without a
// second colour token per prefecture.
const DISC_OPACITIES = [0.11, 0.08];
const MOTIF_OPACITY = 0.16;

// The seal: its own square layer rather than part of the tiled ground, because
// the ground is cover-scaled (it crops differently in a 140pt band than in a
// 200pt hero) while the seal has to land in the same place in both — above the
// scrim the map preview sheet lays over the bottom half of its hero.
const SEAL_SIZE = 48;
// Drawing geometry inside the seal's own viewBox — runtime drawing values, not
// layout spacing, the same way StampingLoader keeps its stamp-block geometry.
const SEAL_VIEWBOX = 40;
const SEAL_RADIUS = 5;
const SEAL_STROKE = 1.9;
// Inset of the inner rule, echoing the double-ruled seal in Stamp.tsx.
const SEAL_RULE_INSET = 3.5;
const SEAL_RULE_STROKE = 0.8;
const SEAL_GLYPH_SIZE = 23;
// Baseline nudge that optically centres a CJK glyph in the frame.
const SEAL_GLYPH_BASELINE = SEAL_VIEWBOX / 2 + SEAL_GLYPH_SIZE * 0.36;
const SEAL_FILL_OPACITY = 0.16;
const SEAL_STROKE_OPACITY = 0.85;
const SEAL_RULE_OPACITY = 0.5;

// The glyph at the centre of the seal — the 湯 that hangs outside every
// bathhouse. Part of the drawn mark, not user-facing copy, so it isn't
// translated (same rule as the 九八 seal in StampingLoader and Stamp).
const SEAL_GLYPH = '湯';

interface OnsenHeroMarkProps {
  onsen: OnsenMarkInput;
}

/**
 * An onsen's generated hero mark: a designed emblem drawn from the catalog,
 * shown where a photograph would be.
 *
 * The ground is the onsen's prefecture, the pattern tiled over it is its spring
 * quality (青海波 waves, 麻の葉, bubbles, or steam), and its id seeds the pattern's
 * phase and scale and the two soft light pools behind it, so every onsen gets a
 * distinct composition that is identical on every device and after a reinstall.
 * The 湯 seal keeps it unmistakably a drawn mark rather than a stand-in for a
 * photo. See lib/onsen-mark.ts for how each part is derived.
 *
 * Wholly local: no network, no Storage, no licensing surface, and nothing to
 * load before it can draw, so it works offline from the first frame. The spec
 * is memoized and the tiling is native, which matters because this renders
 * inside the map preview sheet while the sheet animates.
 */
export default function OnsenHeroMark({ onsen }: OnsenHeroMarkProps) {
  const { id, prefecture, springQuality } = onsen;
  const mark = useMemo(
    () => onsenMark({ id, prefecture, springQuality }),
    [id, prefecture, springQuality]
  );
  const { tile } = mark;

  return (
    <View style={styles.frame}>
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${MARK_VIEWBOX_WIDTH} ${MARK_VIEWBOX_HEIGHT}`}
        // Cover the frame rather than letterbox it: the pattern keeps its scale
        // and its aspect whatever height the caller's hero is.
        preserveAspectRatio="xMidYMid slice"
      >
        <Defs>
          <Pattern
            id={mark.patternId}
            patternUnits="userSpaceOnUse"
            x={mark.patternX}
            y={mark.patternY}
            width={tile.width}
            height={tile.height}
            patternTransform={`scale(${mark.patternScale})`}
          >
            <Path
              d={tile.d}
              fill="none"
              stroke={colors.textInverted}
              strokeOpacity={MOTIF_OPACITY}
              strokeWidth={tile.strokeWidth}
              strokeLinecap="round"
            />
          </Pattern>
        </Defs>

        <Rect
          width={MARK_VIEWBOX_WIDTH}
          height={MARK_VIEWBOX_HEIGHT}
          // The one runtime-derived colour in the mark: the ground comes from
          // the onsen's prefecture, so it can't live in the stylesheet.
          fill={mark.ground}
        />

        {mark.discs.map((disc, index) => (
          <Circle
            key={index}
            cx={disc.cx}
            cy={disc.cy}
            r={disc.r}
            fill={colors.textInverted}
            fillOpacity={DISC_OPACITIES[index]}
          />
        ))}

        <Rect
          width={MARK_VIEWBOX_WIDTH}
          height={MARK_VIEWBOX_HEIGHT}
          fill={`url(#${mark.patternId})`}
        />
      </Svg>

      <View style={styles.sealLayer} pointerEvents="none">
        <Svg
          width={SEAL_SIZE}
          height={SEAL_SIZE}
          viewBox={`0 0 ${SEAL_VIEWBOX} ${SEAL_VIEWBOX}`}
        >
          <Rect
            x={SEAL_STROKE / 2}
            y={SEAL_STROKE / 2}
            width={SEAL_VIEWBOX - SEAL_STROKE}
            height={SEAL_VIEWBOX - SEAL_STROKE}
            rx={SEAL_RADIUS}
            fill={colors.textPrimary}
            fillOpacity={SEAL_FILL_OPACITY}
            stroke={colors.textInverted}
            strokeOpacity={SEAL_STROKE_OPACITY}
            strokeWidth={SEAL_STROKE}
          />
          <Rect
            x={SEAL_RULE_INSET}
            y={SEAL_RULE_INSET}
            width={SEAL_VIEWBOX - SEAL_RULE_INSET * 2}
            height={SEAL_VIEWBOX - SEAL_RULE_INSET * 2}
            rx={SEAL_RADIUS - SEAL_RULE_INSET / 2}
            fill="none"
            stroke={colors.textInverted}
            strokeOpacity={SEAL_RULE_OPACITY}
            strokeWidth={SEAL_RULE_STROKE}
          />
          <SvgText
            x={SEAL_VIEWBOX / 2}
            y={SEAL_GLYPH_BASELINE}
            textAnchor="middle"
            fontSize={SEAL_GLYPH_SIZE}
            fontWeight={typography.weights.semibold}
            fill={colors.textInverted}
          >
            {SEAL_GLYPH}
          </SvgText>
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Fills whatever frame the caller sized, and clips the ground the cover scale
  // pushes past the edges.
  frame: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  // Holds the seal at one distance from the top of the hero, so it sits clear
  // of the preview sheet's scrim and lands identically in both hero heights.
  sealLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    paddingTop: spacing[8],
  },
});
