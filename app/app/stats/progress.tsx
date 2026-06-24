import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useStats } from '@/hooks/useStats';
import { ProgressBar, buildTierMarkers } from '@/components/ProgressBar';
import { RankLadder } from '@/components/RankLadder';
import { rankLabel } from '@/lib/challenge-i18n';
import { round1, formatDate } from '@/lib/stats-format';
import {
  StatScreenFrame,
  Section,
  StatCard,
  MetricRow,
  StatRow,
  CardBlock,
} from '@/components/stats/StatPrimitives';
import { colors, spacing, typography, radii } from '@/theme';

/**
 * Progress & pace, plus the tier track and rank ladder. Tier/rank UI reuses the
 * home dashboard's components and the rank screen's copy; the pace block hides
 * itself until there's enough history to be meaningful.
 */
export default function StatsProgress() {
  const { t, i18n } = useTranslation();
  const {
    loading,
    hasData,
    progress,
    tiers,
    ranks,
    currentRank,
    nextRank,
    completionCount,
    eligibleVisitCount,
    distinctPrefectures,
  } = useStats();

  const hasPace =
    progress != null &&
    (progress.visitsPerMonth != null ||
      progress.avgDaysBetweenVisits != null ||
      progress.projectedCompletionMs != null);

  const needs: string[] = [];
  if (nextRank) {
    const needVisits = Math.max(0, nextRank.minVisits - eligibleVisitCount);
    const needPrefectures = Math.max(0, nextRank.minPrefectures - distinctPrefectures);
    if (needVisits > 0) needs.push(t('challengeRank.needVisits', { count: needVisits }));
    if (needPrefectures > 0) needs.push(t('challengeRank.needPrefectures', { count: needPrefectures }));
  }

  return (
    <StatScreenFrame
      title={t('stats.progress.title')}
      loading={loading}
      isEmpty={!hasData || !progress}
      emptyText={t('stats.empty')}
    >
      {progress && (
        <>
          {progress.isComplete && (
            <View style={styles.banner}>
              <Text style={styles.bannerTitle}>{t('stats.progress.completeBanner')}</Text>
              {progress.completionDurationDays != null && (
                <Text style={styles.bannerSub}>
                  {t('stats.progress.completedIn', { count: progress.completionDurationDays })}
                </Text>
              )}
            </View>
          )}

          <Section card={false}>
            <MetricRow>
              <StatCard
                label={t('stats.progress.metricVisits')}
                value={t('stats.coverageFraction', {
                  covered: progress.visitsDone,
                  total: progress.target,
                })}
              />
              <StatCard
                label={t('stats.progress.metricRemaining')}
                value={String(progress.remaining)}
              />
              <StatCard
                label={t('stats.progress.metricDays')}
                value={String(progress.daysElapsed)}
              />
            </MetricRow>
          </Section>

          {hasPace && (
            <Section title={t('stats.progress.paceTitle')}>
              {progress.visitsPerMonth != null && (
                <StatRow
                  label={t('stats.progress.perMonthLabel')}
                  value={t('stats.progress.perMonth', { value: round1(progress.visitsPerMonth) })}
                />
              )}
              {progress.avgDaysBetweenVisits != null && (
                <StatRow
                  label={t('stats.progress.avgGapLabel')}
                  value={t('stats.progress.avgGap', { value: round1(progress.avgDaysBetweenVisits) })}
                />
              )}
              {progress.projectedCompletionMs != null && (
                <StatRow
                  label={t('stats.progress.projectedLabel')}
                  value={formatDate(progress.projectedCompletionMs, i18n.language)}
                  last
                />
              )}
            </Section>
          )}

          {tiers.length > 0 && completionCount != null && (
            <Section title={t('stats.progress.tiersTitle')} footnote={t('stats.progress.tiersFootnote')}>
              <CardBlock>
                <ProgressBar
                  value={eligibleVisitCount}
                  total={completionCount}
                  markers={buildTierMarkers(tiers, eligibleVisitCount)}
                />
              </CardBlock>
            </Section>
          )}

          {ranks.length > 0 && (
            <Section
              title={t('stats.progress.rankTitle')}
              trailing={currentRank ? rankLabel(currentRank, t) : t('challengeRank.unranked')}
            >
              <CardBlock>
                {nextRank ? (
                  <Text style={styles.rankNext}>
                    {t('challengeRank.toReach', { rank: rankLabel(nextRank, t) })} ·{' '}
                    {needs.length > 0 ? needs.join(' · ') : t('challengeRank.topReached')}
                  </Text>
                ) : (
                  <Text style={styles.rankNext}>{t('challengeRank.topReached')}</Text>
                )}
                <View style={styles.rankLadderWrap}>
                  <RankLadder
                    ranks={ranks}
                    progress={{ eligibleVisits: eligibleVisitCount, distinctPrefectures }}
                    currentRankId={currentRank?.id ?? null}
                  />
                </View>
              </CardBlock>
            </Section>
          )}
        </>
      )}
    </StatScreenFrame>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: radii.lg,
    padding: spacing[4],
    marginBottom: spacing[5],
    alignItems: 'center',
  },
  bannerTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  bannerSub: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    marginTop: spacing[1],
  },
  rankNext: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing[3],
  },
  rankLadderWrap: {
    marginHorizontal: -spacing[2],
  },
});
