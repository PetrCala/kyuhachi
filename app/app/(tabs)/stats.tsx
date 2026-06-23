import { useMemo } from 'react';
import { ScrollView, View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TransportMode } from '@kyuhachi/shared';
import { useActiveChallengeProgress } from '@/hooks/useActiveChallengeProgress';
import { computeBudget, formatYen, type SpendGroup, type TransportBucket } from '@/lib/budget';
import { colors, spacing, typography, radii, shadows } from '@/theme';

/** Bar width as a percentage of the largest group total (0 when there's nothing to scale to). */
function barPct(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, (value / max) * 100));
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={[styles.metricCard, shadows.sm]}>
      <Text style={styles.metricLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {value}
      </Text>
    </View>
  );
}

function BreakdownRow({
  label,
  group,
  max,
  last,
}: {
  label: string;
  group: SpendGroup<string>;
  max: number;
  last: boolean;
}) {
  const { t } = useTranslation();
  return (
    <View style={[styles.breakdownRow, last && styles.breakdownRowLast]}>
      <View style={styles.breakdownHeader}>
        <Text style={styles.breakdownLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.breakdownAmount}>{formatYen(group.total)}</Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${barPct(group.total, max)}%` }]} />
      </View>
      <Text style={styles.breakdownCount}>{t('stats.groupCount', { count: group.count })}</Text>
    </View>
  );
}

export default function Stats() {
  const { t } = useTranslation();
  const { loading, challenge, completionCount, visitedIds, visits, onsenMap } =
    useActiveChallengeProgress();

  const budget = useMemo(() => {
    if (!challenge) return null;
    const transportByOnsen = new Map<string, TransportMode | null>();
    for (const [id, visit] of visits) {
      transportByOnsen.set(id, visit.structuredData.transportMode);
    }
    return computeBudget({
      eligibleOnsenIds: challenge.snapshotEligibleOnsenIds,
      visitedOnsenIds: visitedIds,
      onsenInfo: onsenMap,
      transportByOnsen,
      completionCount: completionCount ?? 0,
    });
  }, [challenge, completionCount, visitedIds, visits, onsenMap]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!challenge || !budget) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>{t('stats.empty')}</Text>
      </View>
    );
  }

  // Projection caption: complete → nothing left; otherwise the cheapest-path note.
  // While the completion target is still resolving (null), say nothing rather
  // than imply the challenge is finished.
  const projectionCaption =
    completionCount === null
      ? null
      : budget.remaining === 0
      ? t('stats.projectedNoneLeft')
      : t('stats.projectedNote', { count: budget.remaining });

  const maxPrefecture = budget.byPrefecture.reduce((m, g) => Math.max(m, g.total), 0);
  const maxTransport = budget.byTransport.reduce((m, g) => Math.max(m, g.total), 0);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.metricsRow}>
        <MetricCard label={t('stats.spentSoFar')} value={formatYen(budget.spentSoFar)} />
        <MetricCard label={t('stats.projectedTotal')} value={formatYen(budget.projectedTotal)} />
        <MetricCard label={t('stats.avgPerVisit')} value={formatYen(budget.avgPerVisit)} />
      </View>

      <Text style={styles.caption}>
        {t('stats.pricedNote', {
          priced: budget.pricedVisitedCount,
          visited: budget.eligibleVisitedCount,
        })}
      </Text>
      {projectionCaption ? <Text style={styles.caption}>{projectionCaption}</Text> : null}

      <Text style={styles.sectionHeader}>{t('stats.byPrefecture')}</Text>
      <View style={styles.group}>
        {budget.byPrefecture.length === 0 ? (
          <Text style={styles.breakdownEmpty}>{t('stats.breakdownEmpty')}</Text>
        ) : (
          budget.byPrefecture.map((g, i) => (
            <BreakdownRow
              key={g.key}
              label={g.key === '' ? t('stats.prefectureUnknown') : g.key}
              group={g}
              max={maxPrefecture}
              last={i === budget.byPrefecture.length - 1}
            />
          ))
        )}
      </View>

      <Text style={styles.sectionHeader}>{t('stats.byTransport')}</Text>
      <View style={styles.group}>
        {budget.byTransport.length === 0 ? (
          <Text style={styles.breakdownEmpty}>{t('stats.breakdownEmpty')}</Text>
        ) : (
          budget.byTransport.map((g: SpendGroup<TransportBucket>, i) => (
            <BreakdownRow
              key={g.key}
              label={t(`stats.transport.${g.key}`)}
              group={g}
              max={maxTransport}
              last={i === budget.byTransport.length - 1}
            />
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
  },
  content: {
    padding: spacing[4],
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[6],
    backgroundColor: colors.backgroundSecondary,
  },
  emptyText: {
    fontSize: typography.sizes.md,
    color: colors.textMuted,
    textAlign: 'center',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  metricCard: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: radii.lg,
    paddingVertical: spacing[4],
    paddingHorizontal: spacing[3],
  },
  metricLabel: {
    fontSize: typography.sizes.xs,
    color: colors.textMuted,
    marginBottom: spacing[2],
  },
  metricValue: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  caption: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    marginTop: spacing[3],
  },
  sectionHeader: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textMuted,
    marginTop: spacing[6],
    marginBottom: spacing[2],
    marginLeft: spacing[1],
  },
  group: {
    backgroundColor: colors.background,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  breakdownRow: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  breakdownRowLast: {
    borderBottomWidth: 0,
  },
  breakdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  breakdownLabel: {
    flex: 1,
    fontSize: typography.sizes.md,
    color: colors.textPrimary,
    marginRight: spacing[3],
  },
  breakdownAmount: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  barTrack: {
    height: spacing[2],
    borderRadius: radii.full,
    backgroundColor: colors.separator,
    overflow: 'hidden',
    marginTop: spacing[2],
  },
  barFill: {
    height: '100%',
    borderRadius: radii.full,
    backgroundColor: colors.onsenVisited,
  },
  breakdownCount: {
    fontSize: typography.sizes.xs,
    color: colors.textMuted,
    marginTop: spacing[1],
  },
  breakdownEmpty: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    padding: spacing[4],
  },
});
