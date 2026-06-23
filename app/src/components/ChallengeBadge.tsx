import type { ComponentProps } from 'react';
import { View, Text, Image, StyleSheet, type ImageSourcePropType } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { TransportMode } from '@kyuhachi/shared';
import { colors, typography } from '@/theme';

const GLYPH = require('../../assets/onsen-symbol.png');

// The "88" of 九州八十八湯, struck into the medal. Not translatable copy — it's
// part of the challenge's visual identity (like the 九八 home wordmark).
const BADGE_NUMERALS = '88';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

// Solid (filled) transport glyphs for the white-on-dark emblem. The visit feed
// uses the -outline variants (VisitCard); a filled pin reads better small.
const TRANSPORT_ICONS: Record<TransportMode, IoniconName> = {
  foot: 'walk',
  bicycle: 'bicycle',
  public: 'bus',
  car: 'car',
};

// Tier metal: the medallion fill plus a deeper shade for the rim + embossed mark.
const TIER_METALS: Record<string, { fill: string; rim: string }> = {
  gold: { fill: colors.tierGold, rim: colors.tierGoldDeep },
  silver: { fill: colors.tierSilver, rim: colors.tierSilverDeep },
  bronze: { fill: colors.tierBronze, rim: colors.tierBronzeDeep },
};

const FALLBACK_METAL = { fill: colors.textMuted, rim: colors.textTertiary };

// ---------------------------------------------------------------------------
// Illustrated-art swap point.
//
// The badge currently renders a vector placeholder. When the illustrated PNGs
// described in docs/specs/badge-art-brief.md land in app/assets/badges/,
// uncomment the matching entries below: a populated entry renders the artwork
// in place of the placeholder for that tier / transport, with no other code
// changes. Leave an entry commented out and that piece keeps the placeholder,
// so the two can be swapped over independently.
// ---------------------------------------------------------------------------
const BASE_ART: Partial<Record<string, ImageSourcePropType>> = {
  gold: require('../../assets/badges/badge-base-gold.png'),
  silver: require('../../assets/badges/badge-base-silver.png'),
  bronze: require('../../assets/badges/badge-base-bronze.png'),
};

const TRANSPORT_ART: Partial<Record<TransportMode, ImageSourcePropType>> = {
  foot: require('../../assets/badges/transport-foot.png'),
  bicycle: require('../../assets/badges/transport-bicycle.png'),
  public: require('../../assets/badges/transport-public.png'),
  car: require('../../assets/badges/transport-car.png'),
};

// Placeholder geometry, as fractions of the medallion diameter.
const EMBLEM_RATIO = 0.36; // transport pin diameter
const GLYPH_RATIO = 0.42; // ♨ mark
const NUMERAL_RATIO = 0.17; // "88"
const NUMERAL_TOP_RATIO = 0.13; // "88" distance from the top rim
const RING_INSET_RATIO = 0.12; // inner ring inset
const EMBLEM_ICON_RATIO = 0.55; // transport glyph within the pin

interface ChallengeBadgeProps {
  /** "gold" | "silver" | "bronze". An unknown id falls back to a muted metal. */
  tierId: string;
  /** The challenge's base transport mode; draws the transport emblem. Omit to hide it. */
  transportMode?: TransportMode | null;
  /** Medallion diameter in points. */
  size?: number;
  /** Dim the badge when the tier hasn't been earned yet. */
  locked?: boolean;
  /** Spoken label for the badge as a whole (it is otherwise unlabeled). */
  accessibilityLabel?: string | null;
}

/**
 * The earned-challenge medal: a struck-metal tier medallion (♨ + 88, the Kyushu
 * identity) with the challenge's transport emblem hung off the lower rim. Three
 * composable layers — base medallion (tier), transport pin — so the same
 * component renders any tier × transport. Until the illustrated PNGs land it
 * draws a theme-driven vector placeholder; see the swap point above.
 *
 * For the small tier dots on the progress track, use the plain TierBadge — a
 * full medallion is unreadable at ~20pt.
 */
export function ChallengeBadge({
  tierId,
  transportMode = null,
  size = 96,
  locked = false,
  accessibilityLabel,
}: ChallengeBadgeProps) {
  const metal = TIER_METALS[tierId] ?? FALLBACK_METAL;
  const emblem = Math.round(size * EMBLEM_RATIO);
  const innerSize = size * (1 - RING_INSET_RATIO * 2);

  const baseArt = BASE_ART[tierId];
  const transportArt = transportMode ? TRANSPORT_ART[transportMode] : undefined;

  return (
    <View
      style={[styles.container, { width: size, height: size + emblem / 2 }, locked && styles.locked]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? undefined}
    >
      {baseArt ? (
        <Image source={baseArt} style={{ width: size, height: size }} resizeMode="contain" />
      ) : (
        <View
          style={[
            styles.medallion,
            { width: size, height: size, borderRadius: size / 2, backgroundColor: metal.fill, borderColor: metal.rim },
          ]}
        >
          <View
            style={[
              styles.innerRing,
              {
                top: size * RING_INSET_RATIO,
                width: innerSize,
                height: innerSize,
                borderRadius: innerSize / 2,
                borderColor: metal.rim,
              },
            ]}
          />
          <Text style={[styles.numerals, { top: size * NUMERAL_TOP_RATIO, fontSize: size * NUMERAL_RATIO, color: metal.rim }]}>
            {BADGE_NUMERALS}
          </Text>
          <Image
            source={GLYPH}
            style={{ width: size * GLYPH_RATIO, height: size * GLYPH_RATIO, tintColor: metal.rim }}
            resizeMode="contain"
          />
        </View>
      )}

      {transportMode ? (
        <View
          style={[
            styles.emblem,
            { top: size - emblem / 2, left: (size - emblem) / 2, width: emblem, height: emblem, borderRadius: emblem / 2 },
          ]}
        >
          {transportArt ? (
            <Image source={transportArt} style={{ width: emblem, height: emblem }} resizeMode="contain" />
          ) : (
            <Ionicons
              name={TRANSPORT_ICONS[transportMode]}
              size={emblem * EMBLEM_ICON_RATIO}
              color={colors.textInverted}
            />
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  locked: {
    opacity: 0.4,
  },
  medallion: {
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerRing: {
    position: 'absolute',
    borderWidth: 1,
  },
  numerals: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontWeight: typography.weights.bold,
  },
  emblem: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.textInverted,
    backgroundColor: colors.brand,
  },
});
