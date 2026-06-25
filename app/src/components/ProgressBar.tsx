import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import type { Tier } from '@kyuhachi/shared';
import { TierBadge } from './TierBadge';
import { colors, spacing, typography, radii } from '@/theme';

/** Bar-fill tween length when animating to a new value. */
const FILL_DURATION = 800;
/** One in-and-out pulse of a tier marker as the count crosses it. */
const PING_HALF = 190;

const TIER_COLORS: Record<string, string> = {
  gold: colors.tierGold,
  silver: colors.tierSilver,
  bronze: colors.tierBronze,
};

/** Diameter of the tier marker badges sitting on the track. */
const BADGE = spacing[5];

export interface ProgressMarker {
  /** Visit-count position on the track (e.g. a tier's minVisits threshold). */
  position: number;
  /** "gold" | "silver" | "bronze" — selects the badge + fill colour. */
  tierId: string;
  /** Whether `value` has reached this marker's position. */
  reached: boolean;
}

interface ProgressBarProps {
  /** Current eligible-visit count. */
  value: number;
  /** Target count (the completion goal, e.g. 88). */
  total: number;
  markers: ProgressMarker[];
  /**
   * Tween the fill (and ping any newly crossed tier marker) when `value`
   * changes, instead of snapping. The caller decides this per change — only true
   * on a genuine in-session increase, never on first load or challenge switch.
   * The first observed value always snaps regardless. Default false.
   */
  animate?: boolean;
}

/**
 * Plot each tier's `minVisits` threshold as a marker on the track. Tiers gated
 * only on transport/time (no `minVisits` condition) get no marker, since the bar
 * measures visit count alone. Shared by the home dashboard and the Stats
 * progress screen so both place the tier badges identically.
 */
export function buildTierMarkers(tiers: Tier[], eligibleVisitCount: number): ProgressMarker[] {
  return tiers
    .map((tier) => {
      const minVisits = tier.conditions.find((c) => c.type === 'minVisits');
      if (!minVisits) return null;
      return {
        position: minVisits.value,
        tierId: tier.id,
        reached: eligibleVisitCount >= minVisits.value,
      };
    })
    .filter((m): m is ProgressMarker => m !== null);
}

function pct(n: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, (n / total) * 100));
}

/**
 * A horizontal progress track whose fill grows left→right with `value`, with
 * tier thresholds marked along it (badge above, count below). The fill takes on
 * the metal colour of the highest threshold reached so far.
 *
 * Note: this reflects visit count only. Full tier eligibility also depends on
 * transport and time conditions — that's gated by the claim button and the
 * rules screen, not shown here.
 */
export function ProgressBar({ value, total, markers, animate = false }: ProgressBarProps) {
  const fraction = pct(value, total) / 100;

  // Fill colour = metal of the furthest threshold the count has reached.
  const furthestReached = markers
    .filter((m) => m.reached)
    .reduce<ProgressMarker | null>(
      (best, m) => (best === null || m.position > best.position ? m : best),
      null
    );
  const fillColor = furthestReached
    ? (TIER_COLORS[furthestReached.tierId] ?? colors.actionPrimary)
    : colors.actionPrimary;

  // Fill is a full-width bar squeezed by scaleX (native-driver friendly, unlike
  // an animated `width`); transformOrigin keeps it growing from the left edge.
  const fillAnim = useRef(new Animated.Value(fraction)).current;
  // One Animated.Value per tier marker drives its cross-the-threshold ping.
  // Lazily created on first reference (in render, so the badge binds the live
  // value before the effect ever pings it).
  const pings = useRef<Record<string, Animated.Value>>({}).current;
  const pingFor = (id: string): Animated.Value => (pings[id] ??= new Animated.Value(0));
  const prevReached = useRef<Set<string> | null>(null);

  useEffect(() => {
    const reachedIds = markers.filter((m) => m.reached).map((m) => m.tierId);

    // First observation: snap into place, establish the reached baseline, never
    // animate. The caller also gates `animate`, but this guards the very first
    // mount independent of it.
    if (prevReached.current === null) {
      fillAnim.setValue(fraction);
      prevReached.current = new Set(reachedIds);
      return;
    }

    if (animate) {
      Animated.timing(fillAnim, {
        toValue: fraction,
        duration: FILL_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      // Ping any marker the count newly crossed this update.
      for (const id of reachedIds) {
        if (prevReached.current.has(id)) continue;
        const ping = pingFor(id);
        ping.setValue(0);
        Animated.sequence([
          Animated.timing(ping, {
            toValue: 1,
            duration: PING_HALF,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(ping, {
            toValue: 0,
            duration: PING_HALF,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]).start();
      }
    } else {
      fillAnim.setValue(fraction);
    }

    prevReached.current = new Set(reachedIds);
  }, [fraction, animate, markers, fillAnim, pings]);

  return (
    <View style={styles.wrapper}>
      <View style={styles.badgesRow}>
        {markers.map((m) => {
          const scale = pingFor(m.tierId).interpolate({
            inputRange: [0, 1],
            outputRange: [1, 1.35],
          });
          return (
            <Animated.View
              key={m.tierId}
              style={[styles.badgeSlot, { left: `${pct(m.position, total)}%`, transform: [{ scale }] }]}
            >
              <View style={!m.reached && styles.dimmed}>
                <TierBadge tierId={m.tierId} size={BADGE} />
              </View>
            </Animated.View>
          );
        })}
      </View>

      <View style={styles.track}>
        <Animated.View
          testID="progressFill"
          style={[styles.fill, { backgroundColor: fillColor, transform: [{ scaleX: fillAnim }] }]}
        />
      </View>

      <View style={styles.labelsRow}>
        {markers.map((m) => (
          <Text
            key={m.tierId}
            style={[styles.label, !m.reached && styles.labelDimmed, { left: `${pct(m.position, total)}%` }]}
          >
            {m.position}
          </Text>
        ))}
      </View>
    </View>
  );
}

const LABEL_W = spacing[8];

const styles = StyleSheet.create({
  // Horizontal inset so markers at 0% / 100% aren't clipped.
  wrapper: {
    paddingHorizontal: BADGE / 2,
  },
  badgesRow: {
    height: BADGE,
    marginBottom: spacing[2],
  },
  badgeSlot: {
    position: 'absolute',
    width: BADGE,
    marginLeft: -BADGE / 2,
    alignItems: 'center',
  },
  dimmed: {
    opacity: 0.35,
  },
  track: {
    height: spacing[2],
    borderRadius: radii.full,
    backgroundColor: colors.separator,
    overflow: 'hidden',
  },
  fill: {
    width: '100%',
    height: '100%',
    borderRadius: radii.full,
    // scaleX grows the fill from its left edge rather than its centre.
    transformOrigin: 'left',
  },
  labelsRow: {
    height: spacing[5],
    marginTop: spacing[1],
  },
  label: {
    position: 'absolute',
    width: LABEL_W,
    marginLeft: -LABEL_W / 2,
    textAlign: 'center',
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.medium,
    color: colors.textSecondary,
  },
  labelDimmed: {
    color: colors.textPlaceholder,
  },
});
