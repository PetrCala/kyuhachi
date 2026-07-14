import { useTranslation } from 'react-i18next';
import { useStats } from '@/hooks/useStats';
import { formatYen } from '@/lib/budget';
import { round1 } from '@/lib/stats-format';
import { HorizontalBars, type BarItem, transportColor } from '@/components/charts';
import {
  StatScreenFrame,
  Section,
  StatCard,
  MetricRow,
  StatRow,
  CardBlock,
} from '@/components/stats/StatPrimitives';

/**
 * Budget: the deterministic cost model (formerly the whole Stats screen), now
 * one section of the hub. Aggregate spend, breakdowns, and named highlights.
 */
export default function StatsBudget() {
  const { t } = useTranslation();
  const { loading, hasData, budget, spend, completionCount } = useStats();

  const projectionCaption =
    completionCount === null || !budget
      ? null
      : budget.remaining === 0
        ? t('stats.projectedNoneLeft')
        : t('stats.projectedNote', { count: budget.remaining });

  return (
    <StatScreenFrame
      title={t('stats.budget.title')}
      loading={loading}
      isEmpty={!hasData || !budget}
      emptyText={t('stats.empty')}
    >
      {budget && spend && (
        <>
          <Section card={false}>
            <MetricRow>
              <StatCard label={t('stats.spentSoFar')} value={formatYen(budget.spentSoFar)} />
              <StatCard label={t('stats.projectedTotal')} value={formatYen(budget.projectedTotal)} />
              <StatCard label={t('stats.avgPerVisit')} value={formatYen(budget.avgPerVisit)} />
            </MetricRow>
          </Section>

          <Section
            title={t('stats.budget.highlightsTitle')}
            footnote={t('stats.pricedNote', {
              priced: budget.pricedVisitedCount,
              visited: budget.eligibleVisitedCount,
            })}
          >
            {spend.cheapestVisited ? (
              <StatRow
                label={t('stats.budget.cheapest')}
                caption={spend.cheapestVisited.name}
                value={formatYen(spend.cheapestVisited.fee)}
              />
            ) : null}
            {spend.dearestVisited ? (
              <StatRow
                label={t('stats.budget.dearest')}
                caption={spend.dearestVisited.name}
                value={formatYen(spend.dearestVisited.fee)}
              />
            ) : null}
            {spend.dearestRemaining ? (
              <StatRow
                label={t('stats.budget.dearestRemaining')}
                caption={spend.dearestRemaining.name}
                value={formatYen(spend.dearestRemaining.fee)}
                last
              />
            ) : (
              <StatRow label={t('stats.budget.dearestRemaining')} value="-" last />
            )}
          </Section>

          {spend.valueLeaders.length > 0 && (
            <Section title={t('stats.budget.valueLeadersTitle')}>
              {spend.valueLeaders.map((leader, i) => (
                <StatRow
                  key={leader.onsenId}
                  label={leader.name}
                  caption={t('stats.budget.valueRating', { rating: round1(leader.rating) })}
                  value={formatYen(leader.fee)}
                  last={i === spend.valueLeaders.length - 1}
                />
              ))}
            </Section>
          )}

          <Section title={t('stats.byPrefecture')} footnote={projectionCaption ?? undefined}>
            <CardBlock>
              <HorizontalBars
                items={budget.byPrefecture.map<BarItem>((g) => ({
                  key: g.key,
                  label: g.key === '' ? t('stats.prefectureUnknown') : g.key,
                  value: g.total,
                  valueLabel: formatYen(g.total),
                  caption: t('stats.groupCount', { count: g.count }),
                }))}
                emptyText={t('stats.breakdownEmpty')}
              />
            </CardBlock>
          </Section>

          <Section title={t('stats.byTransport')}>
            <CardBlock>
              <HorizontalBars
                items={budget.byTransport.map<BarItem>((g) => ({
                  key: g.key,
                  label: t(`stats.transport.${g.key}`),
                  value: g.total,
                  valueLabel: formatYen(g.total),
                  color: transportColor(g.key),
                  caption: t('stats.groupCount', { count: g.count }),
                }))}
                emptyText={t('stats.breakdownEmpty')}
              />
            </CardBlock>
          </Section>
        </>
      )}
    </StatScreenFrame>
  );
}
