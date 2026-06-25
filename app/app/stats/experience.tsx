import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useStats } from '@/hooks/useStats';
import type { Coverage, DistributionBucket, ExperienceResult, SubRatingKey } from '@/lib/stats';
import { round1, formatDuration as fmtDuration } from '@/lib/stats-format';
import { HorizontalBars, RatingHistogram, type BarItem, seriesColor } from '@/components/charts';
import {
  StatScreenFrame,
  Section,
  StatRow,
  CardBlock,
} from '@/components/stats/StatPrimitives';
import { colors, spacing, typography } from '@/theme';

// Reuse the onsen-detail vocabulary for shared rating/enum labels (single source
// of truth) — these are the same concepts the record-a-visit form labels.
const SUB_RATING_LABELS: Record<SubRatingKey, string> = {
  cleanliness: 'onsenDetail.labelCleanliness',
  atmosphere: 'onsenDetail.labelAtmosphere',
  uniqueness: 'onsenDetail.labelUniqueness',
  coolDown: 'onsenDetail.labelCoolDown',
  smell: 'onsenDetail.labelSmell',
  value: 'onsenDetail.labelValue',
};

function coverageNote(c: Coverage, t: TFunction): string {
  return t('stats.coverageNote', { reported: c.reported, total: c.total });
}

/** Whether any opt-in detail was reported at all (to choose the empty state). */
function hasAnyDetail(e: ExperienceResult): boolean {
  return (
    e.overall.coverage.reported > 0 ||
    e.time.coverage.reported > 0 ||
    e.favorites.coverage.reported > 0 ||
    e.bath.heatCoverage.reported > 0 ||
    e.bath.tempCoverage.reported > 0 ||
    e.crowd.coverage.reported > 0 ||
    e.company.coverage.reported > 0 ||
    e.locals.coverage.reported > 0 ||
    e.facilities.sauna.coverage.reported > 0 ||
    e.media.totalPhotos > 0
  );
}

/** Experience — the opt-in self-reported impressions, every block coverage-aware. */
export default function StatsExperience() {
  const { t } = useTranslation();
  const { loading, hasData, experience } = useStats();

  const renderDistribution = (
    title: string,
    buckets: DistributionBucket<string>[],
    labelPrefix: string,
    cov: Coverage
  ) => {
    if (cov.reported === 0) return null;
    return (
      <Section title={title} footnote={coverageNote(cov, t)}>
        <CardBlock>
          <HorizontalBars
            items={buckets.map<BarItem>((b, i) => ({
              key: b.key,
              label: t(`${labelPrefix}.${b.key}`),
              value: b.count,
              color: seriesColor(i),
            }))}
          />
        </CardBlock>
      </Section>
    );
  };

  const noContent = experience != null && (experience.totalVisits === 0 || !hasAnyDetail(experience));

  return (
    <StatScreenFrame
      title={t('stats.experience.title')}
      loading={loading}
      isEmpty={!hasData || !experience}
      emptyText={t('stats.empty')}
    >
      {experience &&
        (noContent ? (
          <Section card={false}>
            <Text style={styles.emptyNote}>
              {experience.totalVisits === 0 ? t('stats.noVisits') : t('stats.experience.empty')}
            </Text>
          </Section>
        ) : (
          <>
            {experience.overall.coverage.reported > 0 && (
              <Section
                title={t('stats.experience.overallTitle')}
                footnote={coverageNote(experience.overall.coverage, t)}
              >
                <CardBlock>
                  <View style={styles.avgRow}>
                    <Text style={styles.avgValue}>
                      {experience.overall.avg != null ? round1(experience.overall.avg) : '—'}
                    </Text>
                    <Text style={styles.avgOutOf}>{t('stats.experience.outOf')}</Text>
                  </View>
                  <RatingHistogram buckets={experience.overall.histogram} />
                  {experience.best && (
                    <Text style={styles.bestLine}>
                      {t('stats.experience.best', { name: experience.best.name })}
                    </Text>
                  )}
                </CardBlock>
              </Section>
            )}

            {experience.subRatings.some((s) => s.coverage.reported > 0) && (
              <Section title={t('stats.experience.subRatingsTitle')}>
                {experience.subRatings
                  .filter((s) => s.coverage.reported > 0)
                  .map((s, i, arr) => (
                    <StatRow
                      key={s.key}
                      label={t(SUB_RATING_LABELS[s.key])}
                      caption={s.top ? t('stats.experience.topPick', { name: s.top.name }) : undefined}
                      value={s.avg != null ? round1(s.avg) : '—'}
                      last={i === arr.length - 1}
                    />
                  ))}
              </Section>
            )}

            {(experience.time.coverage.reported > 0 || experience.favorites.coverage.reported > 0) && (
              <Section title={t('stats.experience.timeTitle')}>
                {experience.time.coverage.reported > 0 && (
                  <StatRow
                    label={t('stats.experience.totalTime')}
                    value={fmtDuration(experience.time.totalMinutes, t)}
                  />
                )}
                {experience.time.avgMinutes != null && (
                  <StatRow
                    label={t('stats.experience.perVisit')}
                    value={fmtDuration(experience.time.avgMinutes, t)}
                  />
                )}
                {experience.favorites.coverage.reported > 0 && (
                  <StatRow
                    label={t('stats.experience.favorites')}
                    value={t('stats.experience.wouldReturn', { count: experience.favorites.count })}
                    last
                  />
                )}
              </Section>
            )}

            {experience.facilities.sauna.coverage.reported > 0 && (
              <Section title={t('stats.experience.facilitiesTitle')}>
                <FacilityRow
                  label={t('onsenDetail.labelSaunaRating')}
                  stat={experience.facilities.sauna}
                  t={t}
                />
                <FacilityRow
                  label={t('onsenDetail.labelRestAreaRating')}
                  stat={experience.facilities.restArea}
                  t={t}
                />
                <FacilityRow
                  label={t('onsenDetail.labelFoodRating')}
                  stat={experience.facilities.food}
                  t={t}
                />
                {experience.facilities.hadSoapPercent != null && (
                  <StatRow
                    label={t('stats.experience.hadSoap')}
                    value={t('stats.unit.percent', {
                      value: Math.round(experience.facilities.hadSoapPercent),
                    })}
                  />
                )}
                {experience.facilities.massageChairPercent != null && (
                  <StatRow
                    label={t('stats.experience.massageChair')}
                    value={t('stats.unit.percent', {
                      value: Math.round(experience.facilities.massageChairPercent),
                    })}
                    last
                  />
                )}
              </Section>
            )}

            {(experience.bath.heatCoverage.reported > 0 || experience.bath.tempCoverage.reported > 0) && (
              <Section title={t('stats.experience.bathTitle')}>
                {experience.bath.tempCoverage.reported > 0 && (
                  <StatRow
                    label={t('stats.experience.waterTemp')}
                    value={t('stats.experience.celsius', {
                      value: experience.bath.avgWaterTempC != null ? round1(experience.bath.avgWaterTempC) : '—',
                    })}
                    last={experience.bath.heatCoverage.reported === 0}
                  />
                )}
                {experience.bath.heatCoverage.reported > 0 && (
                  <CardBlock>
                    <HorizontalBars
                      items={experience.bath.perceivedHeat.map<BarItem>((b, i) => ({
                        key: b.key,
                        label: t(`onsenDetail.perceivedHeat.${b.key}`),
                        value: b.count,
                        color: seriesColor(i),
                      }))}
                    />
                  </CardBlock>
                )}
              </Section>
            )}

            {renderDistribution(
              t('stats.experience.crowdTitle'),
              experience.crowd.distribution,
              'onsenDetail.crowdLevel',
              experience.crowd.coverage
            )}

            {renderDistribution(
              t('stats.experience.companyTitle'),
              experience.company.distribution,
              'onsenDetail.visitedWith',
              experience.company.coverage
            )}

            {experience.locals.coverage.reported > 0 && (
              <Section title={t('stats.experience.localsTitle')} footnote={coverageNote(experience.locals.coverage, t)}>
                {experience.locals.interactedPercent != null && (
                  <StatRow
                    label={t('stats.experience.localsInteracted')}
                    value={t('stats.unit.percent', {
                      value: Math.round(experience.locals.interactedPercent),
                    })}
                  />
                )}
                {experience.locals.avgRating != null && (
                  <StatRow
                    label={t('onsenDetail.labelInteractionRating')}
                    value={round1(experience.locals.avgRating)}
                    last
                  />
                )}
              </Section>
            )}

            {experience.media.totalPhotos > 0 && (
              <Section title={t('stats.experience.photosTitle')}>
                <StatRow
                  label={t('stats.experience.photosTaken')}
                  value={t('stats.experience.photoCount', { count: experience.media.totalPhotos })}
                  last
                />
              </Section>
            )}
          </>
        ))}
    </StatScreenFrame>
  );
}

function FacilityRow({
  label,
  stat,
  t,
}: {
  label: string;
  stat: ExperienceResult['facilities']['sauna'];
  t: TFunction;
}) {
  if (stat.coverage.reported === 0) return null;
  return (
    <StatRow
      label={label}
      caption={
        stat.avgRating != null
          ? t('stats.experience.avgRatingCaption', { value: round1(stat.avgRating) })
          : undefined
      }
      value={t('stats.experience.usedPercent', {
        value: stat.usedPercent != null ? Math.round(stat.usedPercent) : 0,
      })}
    />
  );
}

const styles = StyleSheet.create({
  emptyNote: {
    fontSize: typography.sizes.md,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing[6],
  },
  avgRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: spacing[4],
  },
  avgValue: {
    fontSize: typography.sizes.xxxl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  avgOutOf: {
    fontSize: typography.sizes.md,
    color: colors.textMuted,
    marginLeft: spacing[1],
  },
  bestLine: {
    marginTop: spacing[4],
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
});
