import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Rank } from '@kyuhachi/shared';
import { isRankAchieved, type RankProgress } from '@/lib/rank';
import { rankLabel } from '@/lib/challenge-i18n';
import { colors, spacing, typography, radii } from '@/theme';

interface RankLadderProps {
  /** Ordered worst → best (見習い → 泉人). */
  ranks: Rank[];
  /** Current progress, for marking each rung achieved / locked. */
  progress: RankProgress;
  /** Id of the rank the user currently holds; highlighted in the ladder. */
  currentRankId: string | null;
}

/**
 * The full progression ladder as a vertical list: one row per rank with its
 * twin requirements (visits · prefectures), the held rank highlighted, achieved
 * rungs ticked, and not-yet-reached rungs muted.
 */
export function RankLadder({ ranks, progress, currentRankId }: RankLadderProps) {
  const { t } = useTranslation();

  if (ranks.length === 0) return null;

  return (
    <View style={styles.card}>
      {ranks.map((rank, index) => {
        const achieved = isRankAchieved(rank, progress);
        const isCurrent = rank.id === currentRankId;
        const label = rankLabel(rank, t);
        const showKanji = rank.name.length > 0 && rank.name !== label;

        const requirement =
          rank.minPrefectures > 0
            ? `${t('challengeRank.reqVisits', { count: rank.minVisits })} · ${t(
                'challengeRank.reqPrefectures',
                { count: rank.minPrefectures }
              )}`
            : t('challengeRank.reqVisits', { count: rank.minVisits });

        return (
          <View
            key={rank.id}
            style={[
              styles.row,
              index > 0 && styles.rowDivider,
              isCurrent && styles.rowCurrent,
            ]}
          >
            <View style={styles.rowMain}>
              <Text
                style={[
                  styles.name,
                  isCurrent && styles.nameCurrent,
                  !achieved && styles.nameLocked,
                ]}
              >
                {label}
                {showKanji ? <Text style={styles.kanji}>　{rank.name}</Text> : null}
              </Text>
              <Text style={[styles.requirement, !achieved && styles.requirementLocked]}>
                {requirement}
              </Text>
            </View>
            <View style={styles.rowState}>
              {isCurrent ? (
                <Text style={styles.currentTag}>{t('challengeRank.current')}</Text>
              ) : achieved ? (
                <Text style={styles.check}>{`✓ ${t('challengeRank.achieved')}`}</Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.separator,
  },
  rowCurrent: {
    backgroundColor: colors.backgroundElevated,
    borderLeftWidth: 3,
    borderLeftColor: colors.actionPrimary,
  },
  rowMain: {
    flex: 1,
    marginRight: spacing[3],
  },
  name: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  nameCurrent: {
    fontWeight: typography.weights.bold,
  },
  nameLocked: {
    color: colors.textMuted,
  },
  kanji: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.regular,
    color: colors.textTertiary,
  },
  requirement: {
    marginTop: spacing[1],
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  requirementLocked: {
    color: colors.textMuted,
  },
  rowState: {
    alignItems: 'flex-end',
  },
  currentTag: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.actionPrimary,
  },
  check: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    color: colors.textSecondary,
  },
});
