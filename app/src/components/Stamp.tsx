import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography, radii } from '@/theme';
import { formatStampDate } from '@/lib/passport';

// The seal's bottom line is the app's own 九八 mark, set in Klee One — our brand,
// not the official 「九州温泉道」. Like the home wordmark it is part of the visual
// identity and renders identically in every locale, so it is not translated.
const SEAL_BRAND = '九八';

interface StampProps {
  /** Prefecture (県名) — top line of the seal. */
  prefecture: string;
  /** Onsen area (温泉地) — small line above the facility name. */
  areaName: string;
  /** Facility name (施設名) — the hero line. */
  name: string;
  /** The visit date, inked beneath the seal. */
  date: Date;
  /** Square edge length of the seal in points. */
  size: number;
}

/**
 * A single inked stamp: a black double-ruled square seal carrying the onsen's
 * prefecture, area, and name with the 九八 brand line, plus the inked visit date
 * beneath it. The kanji is plain React Native text laid over the framed box (no
 * SVG text), so it renders reliably on iOS. The date row matches StampSlot's so
 * stamped and empty cells line up in the grid.
 */
export function Stamp({ prefecture, areaName, name, date, size }: StampProps) {
  return (
    <View style={{ width: size }}>
      <View style={[styles.seal, { width: size, height: size }]}>
        <View style={styles.inner}>
          <Text style={styles.prefecture} numberOfLines={1} adjustsFontSizeToFit>
            {prefecture}
          </Text>
          <View style={styles.rule} />
          <View style={styles.middle}>
            {areaName ? (
              <Text style={styles.area} numberOfLines={1} adjustsFontSizeToFit>
                {areaName}
              </Text>
            ) : null}
            <Text
              style={styles.name}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.4}
            >
              {name}
            </Text>
          </View>
          <View style={styles.rule} />
          <Text style={styles.brand}>{SEAL_BRAND}</Text>
        </View>
      </View>
      <View style={styles.dateRow}>
        <Text style={styles.date} numberOfLines={1} adjustsFontSizeToFit>
          {formatStampDate(date)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  seal: {
    borderWidth: 1.5,
    borderColor: colors.stampInk,
    borderRadius: radii.sm,
    padding: spacing[1],
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  inner: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.stampInk,
    borderRadius: radii.sm,
    alignItems: 'center',
    paddingVertical: spacing[1],
    paddingHorizontal: spacing[1],
    gap: spacing[1],
  },
  // Flexible band between the rules: holds the area + facility name and bounds
  // the name's height so a long name shrinks to fit instead of overflowing.
  middle: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[1],
  },
  prefecture: {
    fontFamily: typography.fonts.brand,
    fontSize: typography.sizes.sm,
    color: colors.stampInk,
    textAlign: 'center',
  },
  rule: {
    alignSelf: 'stretch',
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.stampInk,
  },
  area: {
    fontFamily: typography.fonts.brand,
    fontSize: typography.sizes.xs,
    color: colors.stampInk,
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  name: {
    flex: 1,
    alignSelf: 'stretch',
    fontFamily: typography.fonts.brand,
    fontSize: typography.sizes.lg,
    color: colors.stampInk,
    textAlign: 'center',
  },
  brand: {
    fontFamily: typography.fonts.brand,
    fontSize: typography.sizes.sm,
    color: colors.stampInk,
    letterSpacing: 3,
  },
  dateRow: {
    height: spacing[5],
    alignItems: 'center',
    justifyContent: 'center',
  },
  date: {
    fontFamily: typography.fonts.brand,
    fontSize: typography.sizes.xs,
    color: colors.stampInk,
  },
});
