import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useStats } from '@/hooks/useStats';
import { formatPercent } from '@/lib/stats-format';
import {
  DonutChart,
  ChartLegend,
  StackedBars,
  type DonutSegment,
  type LegendItem,
  type StackedRow,
  transportColor,
} from '@/components/charts';
import {
  StatScreenFrame,
  Section,
  StatCard,
  MetricRow,
  CardBlock,
} from '@/components/stats/StatPrimitives';
import { spacing } from '@/theme';

/** Transport — the mode mix, self-powered share, shortcuts, and a per-prefecture split. */
export default function StatsTransport() {
  const { t } = useTranslation();
  const { loading, hasData, transport, baseMode } = useStats();

  const reported = transport ? transport.mix.filter((b) => b.count > 0) : [];

  const segments: DonutSegment[] = reported.map((b) => ({
    key: b.key,
    value: b.count,
    color: transportColor(b.key),
  }));
  const legend: LegendItem[] = reported.map((b) => ({
    key: b.key,
    label: t(`stats.transport.${b.key}`),
    color: transportColor(b.key),
    value: String(b.count),
  }));

  const prefectureRows: StackedRow[] = transport
    ? transport.byPrefecture.map((row) => ({
        key: row.prefecture,
        label: row.prefecture,
        total: row.total,
        segments: row.byMode.map((m) => ({
          key: m.key,
          value: m.count,
          color: transportColor(m.key),
        })),
      }))
    : [];

  return (
    <StatScreenFrame
      title={t('stats.transport.title')}
      loading={loading}
      isEmpty={!hasData || !transport}
      emptyText={t('stats.empty')}
    >
      {transport && (
        <>
          <Section title={t('stats.transport.mixTitle')}>
            <CardBlock>
              {transport.totalCount === 0 ? (
                <ChartLegend items={[]} />
              ) : (
                <View style={styles.mixRow}>
                  <DonutChart
                    segments={segments}
                    centerLabel={String(transport.totalCount)}
                    centerSubLabel={t('stats.transport.visitsLabel')}
                  />
                  <View style={styles.legend}>
                    <ChartLegend items={legend} />
                  </View>
                </View>
              )}
            </CardBlock>
          </Section>

          <Section
            card={false}
            footnote={
              transport.hasBaseMode && baseMode
                ? t('stats.transport.shortcutsCaption', { mode: t(`stats.transport.${baseMode}`) })
                : undefined
            }
          >
            <MetricRow>
              <StatCard
                label={t('stats.transport.selfPowered')}
                value={
                  transport.selfPoweredPercent != null
                    ? formatPercent(transport.selfPoweredPercent, t)
                    : '—'
                }
              />
              {transport.hasBaseMode && (
                <StatCard
                  label={t('stats.transport.shortcuts')}
                  value={String(transport.shortcutCount)}
                />
              )}
            </MetricRow>
          </Section>

          {prefectureRows.length > 0 && (
            <Section title={t('stats.transport.byPrefectureTitle')}>
              <CardBlock>
                <StackedBars rows={prefectureRows} />
              </CardBlock>
            </Section>
          )}
        </>
      )}
    </StatScreenFrame>
  );
}

const styles = StyleSheet.create({
  mixRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
  },
  legend: {
    flex: 1,
  },
});
