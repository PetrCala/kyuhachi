import type { ComponentProps } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useStats } from '@/hooks/useStats';
import { formatYen } from '@/lib/budget';
import { formatDuration, formatPercent, round1 } from '@/lib/stats-format';
import { StatScreenFrame, Section, StatCard, MetricRow } from '@/components/stats/StatPrimitives';
import { colors, spacing, typography, radii } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

interface HubCardProps {
  icon: IconName;
  title: string;
  subtitle: string;
  teaser: string;
  route: string;
  last?: boolean;
}

function HubCard({ icon, title, subtitle, teaser, route, last }: HubCardProps) {
  return (
    <Pressable
      style={[styles.cardRow, last && styles.cardRowLast]}
      onPress={() => router.push(route)}
      accessibilityRole="button"
    >
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={typography.sizes.xl} color={colors.textSecondary} />
      </View>
      <View style={styles.cardMain}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <Text style={styles.cardTeaser} numberOfLines={1}>
        {teaser}
      </Text>
      <Ionicons name="chevron-forward" size={typography.sizes.lg} color={colors.textPlaceholder} />
    </Pressable>
  );
}

/**
 * The Stats hub: a highlights strip plus the six section cards. Each teaser is
 * read from the same `useStats` bundle the detail screen uses, so they never
 * disagree. With a challenge but no visits, cards still render zeroed teasers.
 */
export default function StatsHub() {
  const { t } = useTranslation();
  const stats = useStats();
  const { loading, hasData, progress, geography, timeline, transport, budget, experience } = stats;

  // Dominant reported transport mode (for the transport card teaser).
  const dominantMode = transport
    ? transport.mix
        .filter((b) => b.key !== 'unreported' && b.count > 0)
        .sort((a, b) => b.count - a.count)[0]
    : undefined;

  return (
    <StatScreenFrame
      title={t('stats.title')}
      loading={loading}
      isEmpty={!hasData}
      emptyText={t('stats.empty')}
    >
      <Section title={t('stats.hub.highlightsTitle')} card={false}>
        <View style={styles.highlightGrid}>
          <MetricRow>
            <StatCard
              label={t('stats.highlight.soakTime')}
              value={formatDuration(experience?.time.totalMinutes ?? 0, t)}
            />
            <StatCard
              label={t('stats.highlight.prefectures')}
              value={t('stats.coverageFraction', {
                covered: geography?.prefecturesCovered.covered ?? 0,
                total: geography?.prefecturesCovered.total ?? 0,
              })}
            />
          </MetricRow>
          <MetricRow>
            <StatCard
              label={t('stats.highlight.selfPowered')}
              value={
                transport?.selfPoweredPercent != null
                  ? formatPercent(transport.selfPoweredPercent, t)
                  : '—'
              }
            />
            <StatCard label={t('stats.highlight.topRated')} value={experience?.best?.name ?? '—'} />
          </MetricRow>
        </View>
      </Section>

      <Section title={t('stats.hub.exploreTitle')}>
        <HubCard
          icon="speedometer-outline"
          title={t('stats.progress.title')}
          subtitle={t('stats.progress.subtitle')}
          teaser={progress ? formatPercent(progress.percentComplete, t) : '—'}
          route="/stats/progress"
        />
        <HubCard
          icon="map-outline"
          title={t('stats.geography.title')}
          subtitle={t('stats.geography.subtitle')}
          teaser={t('stats.coverageFraction', {
            covered: geography?.prefecturesCovered.covered ?? 0,
            total: geography?.prefecturesCovered.total ?? 0,
          })}
          route="/stats/geography"
        />
        <HubCard
          icon="time-outline"
          title={t('stats.timeline.title')}
          subtitle={t('stats.timeline.subtitle')}
          teaser={String(timeline?.totalVisits ?? 0)}
          route="/stats/timeline"
        />
        <HubCard
          icon="bicycle-outline"
          title={t('stats.transport.title')}
          subtitle={t('stats.transport.subtitle')}
          teaser={dominantMode ? t(`stats.transport.${dominantMode.key}`) : '—'}
          route="/stats/transport"
        />
        <HubCard
          icon="cash-outline"
          title={t('stats.budget.title')}
          subtitle={t('stats.budget.subtitle')}
          teaser={budget ? formatYen(budget.spentSoFar) : '—'}
          route="/stats/budget"
        />
        <HubCard
          icon="star-outline"
          title={t('stats.experience.title')}
          subtitle={t('stats.experience.subtitle')}
          teaser={experience?.overall.avg != null ? round1(experience.overall.avg) : '—'}
          route="/stats/experience"
          last
        />
      </Section>
    </StatScreenFrame>
  );
}

const styles = StyleSheet.create({
  highlightGrid: {
    gap: spacing[3],
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  cardRowLast: {
    borderBottomWidth: 0,
  },
  iconWrap: {
    width: spacing[8],
    height: spacing[8],
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundSecondary,
    marginRight: spacing[3],
  },
  cardMain: {
    flex: 1,
    marginRight: spacing[3],
  },
  cardTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  cardSubtitle: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    marginTop: spacing[1],
  },
  cardTeaser: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textSecondary,
    marginRight: spacing[2],
    maxWidth: spacing[12] * 2,
  },
});
