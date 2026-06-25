import { useTranslation } from 'react-i18next';
import { useStats } from '@/hooks/useStats';
import { formatDate, axisDateFormatter } from '@/lib/stats-format';
import { HorizontalBars, LineChart, type BarItem, type LinePoint, seriesColor } from '@/components/charts';
import {
  StatScreenFrame,
  Section,
  StatRow,
  CardBlock,
} from '@/components/stats/StatPrimitives';

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const SEASON_KEYS = ['spring', 'summer', 'autumn', 'winter'] as const;

/** Timeline — cumulative curve, calendar breakdowns, streaks and records. */
export default function StatsTimeline() {
  const { t, i18n } = useTranslation();
  const { loading, hasData, timeline } = useStats();

  const monthLabel = (key: string): string => {
    const [year, month] = key.split('-').map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString(i18n.language, {
      year: 'numeric',
      month: 'short',
    });
  };

  return (
    <StatScreenFrame
      title={t('stats.timeline.title')}
      loading={loading}
      isEmpty={!hasData || !timeline}
      emptyText={t('stats.empty')}
    >
      {timeline &&
        (timeline.totalVisits === 0 ? (
          <Section card={false}>
            <StatRow label={t('stats.timeline.title')} value={t('stats.noVisits')} last />
          </Section>
        ) : (
          <>
            <Section title={t('stats.timeline.cumulativeTitle')}>
              <CardBlock>
                <LineChart
                  points={timeline.cumulative.map<LinePoint>((p) => ({ x: p.ms, y: p.count }))}
                  xTickFormat={axisDateFormatter(
                    i18n.language,
                    timeline.cumulative[0].ms,
                    timeline.cumulative[timeline.cumulative.length - 1].ms
                  )}
                  yTickFormat={(n) => String(n)}
                />
              </CardBlock>
            </Section>

            {timeline.byMonth.length > 0 && (
              <Section title={t('stats.timeline.byMonthTitle')}>
                <CardBlock>
                  <HorizontalBars
                    items={timeline.byMonth.map<BarItem>((m) => ({
                      key: m.key,
                      label: monthLabel(m.key),
                      value: m.count,
                    }))}
                  />
                </CardBlock>
              </Section>
            )}

            <Section title={t('stats.timeline.byWeekdayTitle')}>
              <CardBlock>
                <HorizontalBars
                  items={timeline.byDayOfWeek.map<BarItem>((count, i) => ({
                    key: WEEKDAY_KEYS[i],
                    label: t(`stats.weekday.${WEEKDAY_KEYS[i]}`),
                    value: count,
                  }))}
                />
              </CardBlock>
            </Section>

            <Section title={t('stats.timeline.bySeasonTitle')}>
              <CardBlock>
                <HorizontalBars
                  items={timeline.bySeason.map<BarItem>((count, i) => ({
                    key: SEASON_KEYS[i],
                    label: t(`stats.season.${SEASON_KEYS[i]}`),
                    value: count,
                    color: seriesColor(i),
                  }))}
                />
              </CardBlock>
            </Section>

            <Section title={t('stats.timeline.recordsTitle')}>
              {timeline.busiestDay && (
                <StatRow
                  label={t('stats.timeline.busiest')}
                  caption={formatDate(
                    Date.parse(`${timeline.busiestDay.key}T00:00:00`),
                    i18n.language
                  )}
                  value={t('stats.timeline.dayVisits', { count: timeline.busiestDay.count })}
                />
              )}
              <StatRow
                label={t('stats.timeline.streak')}
                value={t('stats.timeline.dayCount', { count: timeline.longestStreakDays })}
              />
              {timeline.longestGapDays != null && (
                <StatRow
                  label={t('stats.timeline.gap')}
                  value={t('stats.timeline.dayCount', { count: timeline.longestGapDays })}
                />
              )}
              {timeline.firstVisitMs != null && (
                <StatRow
                  label={t('stats.timeline.first')}
                  value={formatDate(timeline.firstVisitMs, i18n.language)}
                />
              )}
              {timeline.latestVisitMs != null && (
                <StatRow
                  label={t('stats.timeline.latest')}
                  value={formatDate(timeline.latestVisitMs, i18n.language)}
                  last
                />
              )}
            </Section>
          </>
        ))}
    </StatScreenFrame>
  );
}
