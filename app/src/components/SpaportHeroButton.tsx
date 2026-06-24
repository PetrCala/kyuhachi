import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { ChallengeDocument, VisitDocument } from '@kyuhachi/shared';
import type { OnsenDisplayInfo } from '@/hooks/useActiveChallengeProgress';
import { colors, spacing, typography, radii } from '@/theme';

// Newest stamps shown as tiny seals in the hero; the rest live in the passport.
const PREVIEW_COUNT = 3;
// Edge length of a mini seal, in points — a glanceable dot of a stamp.
const SEAL_SIZE = spacing[6];

interface StampMark {
  id: string;
  /** visitedAt in ms — the fill order. */
  ms: number;
  /** Prefecture's first character, inked into the mini seal. */
  mark: string;
}

interface SpaportHeroButtonProps {
  challenge: ChallengeDocument;
  visits: Map<string, VisitDocument>;
  onsenMap: Map<string, OnsenDisplayInfo>;
}

/**
 * Compact Spaport entry point for the progress hero's top-right corner — a tiny
 * cluster of the most recent stamps (each a prefecture-kanji seal), level with
 * the X / 88 headline, that opens the full passport on press. Falls back to the
 * Spaport label while the book is still empty.
 */
export function SpaportHeroButton({ challenge, visits, onsenMap }: SpaportHeroButtonProps) {
  const { t } = useTranslation();

  const recent = useMemo<StampMark[]>(() => {
    const eligible = new Set(challenge.snapshotEligibleOnsenIds);
    const list: StampMark[] = [];
    for (const [onsenId, visit] of visits) {
      if (!eligible.has(onsenId)) continue;
      const info = onsenMap.get(onsenId);
      list.push({ id: onsenId, ms: visit.visitedAt.toMillis(), mark: info?.prefecture?.charAt(0) ?? '' });
    }
    list.sort((a, b) => a.ms - b.ms);
    // Newest stamps sit last in the book; show the latest few, newest on the right.
    return list.slice(-PREVIEW_COUNT);
  }, [challenge, visits, onsenMap]);

  return (
    <Pressable
      style={styles.button}
      onPress={() => router.push('/passport')}
      accessibilityRole="button"
      accessibilityLabel={t('passport.title')}
    >
      {recent.length === 0 ? (
        <Text style={styles.label}>{t('passport.title')}</Text>
      ) : (
        recent.map((s) => (
          <View key={s.id} style={styles.seal}>
            <Text style={styles.sealMark} numberOfLines={1}>
              {s.mark}
            </Text>
          </View>
        ))
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  seal: {
    width: SEAL_SIZE,
    height: SEAL_SIZE,
    borderWidth: 1,
    borderColor: colors.stampInk,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  sealMark: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    color: colors.stampInk,
  },
  label: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textSecondary,
  },
});
