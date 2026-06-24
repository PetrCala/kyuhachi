/**
 * Shared building blocks for the Stats screens, so the hub and six detail pages
 * share one visual language (iOS grouped cards). Presentational only — they take
 * already-formatted strings; all computation lives in `lib/stats`.
 */
import type { ReactNode } from 'react';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { colors, spacing, typography, radii, shadows } from '@/theme';

interface StatScreenFrameProps {
  /** Localized header title. */
  title: string;
  loading: boolean;
  /** No active challenge — show the empty message instead of content. */
  isEmpty: boolean;
  emptyText: string;
  children: ReactNode;
}

/** Header + scroll container with shared loading / no-challenge states. */
export function StatScreenFrame({ title, loading, isEmpty, emptyText, children }: StatScreenFrameProps) {
  const header = <Stack.Screen options={{ title, headerShown: true }} />;

  if (loading) {
    return (
      <>
        {header}
        <View style={styles.centered}>
          <ActivityIndicator />
        </View>
      </>
    );
  }
  if (isEmpty) {
    return (
      <>
        {header}
        <View style={styles.centered}>
          <Text style={styles.emptyText}>{emptyText}</Text>
        </View>
      </>
    );
  }
  return (
    <>
      {header}
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {children}
      </ScrollView>
    </>
  );
}

interface SectionProps {
  title?: string;
  /** Right-aligned header accessory (e.g. an X/7 count). */
  trailing?: string;
  /** Muted caption under the card. */
  footnote?: string;
  /** Wrap children in a grouped card (default true). */
  card?: boolean;
  children: ReactNode;
}

/** A titled section: small header, a rounded card body, an optional footnote. */
export function Section({ title, trailing, footnote, card = true, children }: SectionProps) {
  return (
    <View style={styles.section}>
      {title ? (
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeader}>{title}</Text>
          {trailing ? <Text style={styles.sectionTrailing}>{trailing}</Text> : null}
        </View>
      ) : null}
      {card ? <View style={styles.card}>{children}</View> : children}
      {footnote ? <Text style={styles.footnote}>{footnote}</Text> : null}
    </View>
  );
}

/** A compact metric tile (label + big value). Use inside MetricRow. */
export function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={[styles.metricCard, shadows.sm]}>
      <Text style={styles.metricLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {value}
      </Text>
      {sub ? (
        <Text style={styles.metricSub} numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

/** A row of metric tiles. */
export function MetricRow({ children }: { children: ReactNode }) {
  return <View style={styles.metricRow}>{children}</View>;
}

/** A label/value row inside a Section card. */
export function StatRow({
  label,
  value,
  caption,
  last,
}: {
  label: string;
  value: string;
  caption?: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.statRow, last && styles.statRowLast]}>
      <View style={styles.statRowMain}>
        <Text style={styles.statRowLabel} numberOfLines={1}>
          {label}
        </Text>
        {caption ? <Text style={styles.statRowCaption}>{caption}</Text> : null}
      </View>
      <Text style={styles.statRowValue}>{value}</Text>
    </View>
  );
}

/** Inset block of content within a Section card (charts, captions). */
export function CardBlock({ children }: { children: ReactNode }) {
  return <View style={styles.cardBlock}>{children}</View>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
  },
  content: {
    padding: spacing[4],
    paddingBottom: spacing[10],
  },
  centered: {
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
  section: {
    marginBottom: spacing[5],
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: spacing[2],
    marginLeft: spacing[1],
  },
  sectionHeader: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textMuted,
  },
  sectionTrailing: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textSecondary,
  },
  card: {
    backgroundColor: colors.background,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  cardBlock: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  footnote: {
    fontSize: typography.sizes.xs,
    color: colors.textMuted,
    marginTop: spacing[2],
    marginLeft: spacing[1],
  },
  metricRow: {
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
  metricSub: {
    fontSize: typography.sizes.xs,
    color: colors.textMuted,
    marginTop: spacing[1],
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  statRowLast: {
    borderBottomWidth: 0,
  },
  statRowMain: {
    flex: 1,
    marginRight: spacing[3],
  },
  statRowLabel: {
    fontSize: typography.sizes.md,
    color: colors.textPrimary,
  },
  statRowCaption: {
    fontSize: typography.sizes.xs,
    color: colors.textMuted,
    marginTop: spacing[1],
  },
  statRowValue: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
});
