import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { ChallengeDocument, VisitDocument } from '@kyuhachi/shared';
import { Stamp } from '@/components/Stamp';
import type { OnsenDisplayInfo } from '@/hooks/useActiveChallengeProgress';
import { colors, spacing, typography, radii } from '@/theme';

// How many of the most recent stamps the home preview shows before the user
// taps through to the full book.
const PREVIEW_COUNT = 4;
// Edge length of a preview seal, in points — small enough for a row of four to
// sit comfortably inside the card with room to spare.
const PREVIEW_STAMP_SIZE = spacing[12];

interface StampPreview {
  onsenId: string;
  /** visitedAt in ms — the fill order. */
  ms: number;
  prefecture: string;
  areaName: string;
  name: string;
}

interface SpaportCardProps {
  challenge: ChallengeDocument;
  visits: Map<string, VisitDocument>;
  onsenMap: Map<string, OnsenDisplayInfo>;
  /** Eligible visits so far — the inked-stamp count. */
  visited: number;
  /** Stamps the book holds when full; null while the target is still resolving. */
  total: number | null;
}

/**
 * Home-screen "Spaport" division: a tappable card previewing the user's stamp
 * book — the latest few inked seals plus the running count — that opens the full
 * passport on press. The preview list is built from the same eligible-visits-in-
 * visit-order sequence the passport screen fills in.
 */
export function SpaportCard({ challenge, visits, onsenMap, visited, total }: SpaportCardProps) {
  const { t } = useTranslation();

  const recent = useMemo<StampPreview[]>(() => {
    const eligible = new Set(challenge.snapshotEligibleOnsenIds);
    const list: StampPreview[] = [];
    for (const [onsenId, visit] of visits) {
      if (!eligible.has(onsenId)) continue;
      const info = onsenMap.get(onsenId);
      list.push({
        onsenId,
        ms: visit.visitedAt.toMillis(),
        prefecture: info?.prefecture ?? '',
        areaName: info?.areaName ?? '',
        name: info?.name ?? '',
      });
    }
    list.sort((a, b) => a.ms - b.ms);
    // Newest stamps sit last in the book; show the latest few, newest on the right.
    return list.slice(-PREVIEW_COUNT);
  }, [challenge, visits, onsenMap]);

  return (
    <Pressable style={styles.card} onPress={() => router.push('/passport')} accessibilityRole="button">
      <View style={styles.headerRow}>
        <Text style={styles.heading}>{t('passport.title')}</Text>
        <View style={styles.headerRight}>
          {total !== null && (
            <Text style={styles.count}>{t('passport.progress', { visited, total })}</Text>
          )}
          <Text style={styles.chevron}>›</Text>
        </View>
      </View>
      {recent.length === 0 ? (
        <Text style={styles.hint}>{t('passport.hint')}</Text>
      ) : (
        <View style={styles.stampRow}>
          {recent.map((s) => (
            <Stamp
              key={s.onsenId}
              size={PREVIEW_STAMP_SIZE}
              prefecture={s.prefecture}
              areaName={s.areaName}
              name={s.name}
              date={new Date(s.ms)}
            />
          ))}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing[4],
    marginVertical: spacing[3],
    padding: spacing[4],
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    gap: spacing[3],
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heading: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  count: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    color: colors.textSecondary,
  },
  chevron: {
    fontSize: typography.sizes.md,
    color: colors.textMuted,
  },
  hint: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
  },
  stampRow: {
    flexDirection: 'row',
    gap: spacing[2],
  },
});
