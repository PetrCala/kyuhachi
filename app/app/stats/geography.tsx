import { useTranslation } from 'react-i18next';
import { useStats } from '@/hooks/useStats';
import { round1 } from '@/lib/stats-format';
import { CoverageBar, type CoverageItem } from '@/components/charts';
import {
  StatScreenFrame,
  Section,
  StatRow,
  CardBlock,
} from '@/components/stats/StatPrimitives';

/** Geography — prefecture & area coverage, plus reach (extremes + distance). */
export default function StatsGeography() {
  const { t } = useTranslation();
  const { loading, hasData, geography } = useStats();

  const fraction = (visited: number, eligible: number) =>
    t('stats.coverageFraction', { covered: visited, total: eligible });

  const toCoverage = (g: { key: string; visited: number; eligible: number }): CoverageItem => ({
    key: g.key,
    label: g.key === '' ? t('stats.prefectureUnknown') : g.key,
    visited: g.visited,
    eligible: g.eligible,
  });

  return (
    <StatScreenFrame
      title={t('stats.geography.title')}
      loading={loading}
      isEmpty={!hasData || !geography}
      emptyText={t('stats.empty')}
    >
      {geography && (
        <>
          <Section
            title={t('stats.geography.coverageTitle')}
            trailing={t('stats.coverageFraction', {
              covered: geography.prefecturesCovered.covered,
              total: geography.prefecturesCovered.total,
            })}
          >
            <CardBlock>
              <CoverageBar
                items={geography.byPrefecture.map(toCoverage)}
                formatCount={fraction}
                emptyText={t('stats.noVisits')}
              />
            </CardBlock>
          </Section>

          {geography.byArea.length > 0 && (
            <Section title={t('stats.geography.byAreaTitle')}>
              <CardBlock>
                <CoverageBar
                  items={geography.byArea.map(toCoverage)}
                  formatCount={fraction}
                  emptyText={t('stats.noVisits')}
                />
              </CardBlock>
            </Section>
          )}

          {geography.totalVisited > 0 && (
            <Section title={t('stats.geography.reachTitle')}>
              {geography.northernmost && (
                <StatRow
                  label={t('stats.geography.northern')}
                  value={geography.northernmost.name}
                />
              )}
              {geography.southernmost && (
                <StatRow
                  label={t('stats.geography.southern')}
                  value={geography.southernmost.name}
                />
              )}
              {geography.mostRemote && (
                <StatRow label={t('stats.geography.remote')} value={geography.mostRemote.name} />
              )}
              {geography.totalDistanceKm != null && (
                <StatRow
                  label={t('stats.geography.distance')}
                  value={t('stats.unit.km', { value: round1(geography.totalDistanceKm) })}
                  last
                />
              )}
            </Section>
          )}
        </>
      )}
    </StatScreenFrame>
  );
}
