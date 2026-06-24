import { View, Text, StyleSheet } from 'react-native';
import type { Tier } from '@kyuhachi/shared';
import { TierBadge } from './TierBadge';
import { colors, spacing, typography, radii } from '@/theme';

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
export function ProgressBar({ value, total, markers }: ProgressBarProps) {
  const fillPct = pct(value, total);

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

  return (
    <View style={styles.wrapper}>
      <View style={styles.badgesRow}>
        {markers.map((m) => (
          <View
            key={m.tierId}
            style={[styles.badgeSlot, { left: `${pct(m.position, total)}%` }]}
          >
            <View style={!m.reached && styles.dimmed}>
              <TierBadge tierId={m.tierId} size={BADGE} />
            </View>
          </View>
        ))}
      </View>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${fillPct}%`, backgroundColor: fillColor }]} />
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
    height: '100%',
    borderRadius: radii.full,
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
