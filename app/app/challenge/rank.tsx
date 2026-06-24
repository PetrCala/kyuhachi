import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useActiveChallengeProgress } from '@/hooks/useActiveChallengeProgress';
import { RankLadder } from '@/components/RankLadder';
import { rankLabel } from '@/lib/challenge-i18n';
import { colors, spacing, typography, radii } from '@/theme';

/**
 * The rank screen: the user's standing on the official 九州八十八湯 ladder for the
 * active challenge, the gap to the next rank, and the full ladder of ranks with
 * their requirements. Reads the active challenge directly (live progress).
 */
export default function ChallengeRankScreen() {
  const { t } = useTranslation();
  const {
    loading,
    challenge,
    ranks,
    currentRank,
    nextRank,
    eligibleVisitCount,
    distinctPrefectures,
  } = useActiveChallengeProgress();

  const header = <Stack.Screen options={{ title: t('challengeRank.title'), headerShown: true }} />;

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

  if (!challenge || ranks.length === 0) {
    return (
      <>
        {header}
        <View style={styles.centered}>
          <Text style={styles.emptyText}>{t('challengeRank.empty')}</Text>
        </View>
      </>
    );
  }

  const currentLabel = currentRank ? rankLabel(currentRank, t) : t('challengeRank.unranked');
  const currentKanji = currentRank && currentRank.name !== currentLabel ? currentRank.name : null;

  const progressLine = `${t('challengeRank.reqVisits', { count: eligibleVisitCount })} · ${t(
    'challengeRank.reqPrefectures',
    { count: distinctPrefectures }
  )}`;

  const needVisits = nextRank ? Math.max(0, nextRank.minVisits - eligibleVisitCount) : 0;
  const needPrefectures = nextRank
    ? Math.max(0, nextRank.minPrefectures - distinctPrefectures)
    : 0;
  const needs: string[] = [];
  if (needVisits > 0) needs.push(t('challengeRank.needVisits', { count: needVisits }));
  if (needPrefectures > 0) {
    needs.push(t('challengeRank.needPrefectures', { count: needPrefectures }));
  }

  return (
    <>
      {header}
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.summary}>
          <Text style={styles.summaryLabel}>{t('challengeRank.currentLabel')}</Text>
          <Text style={styles.currentName}>{currentLabel}</Text>
          {currentKanji ? <Text style={styles.currentKanji}>{currentKanji}</Text> : null}
          <Text style={styles.progressLine}>{progressLine}</Text>

          {nextRank ? (
            <View style={styles.nextBlock}>
              <Text style={styles.nextLabel}>
                {t('challengeRank.toReach', { rank: rankLabel(nextRank, t) })}
              </Text>
              <Text style={styles.nextNeeds}>{needs.join(' · ')}</Text>
            </View>
          ) : (
            <Text style={styles.topReached}>{t('challengeRank.topReached')}</Text>
          )}
        </View>

        <Text style={styles.intro}>{t('challengeRank.intro')}</Text>

        <RankLadder
          ranks={ranks}
          progress={{ eligibleVisits: eligibleVisitCount, distinctPrefectures }}
          currentRankId={currentRank?.id ?? null}
        />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: spacing[6],
  },
  emptyText: {
    fontSize: typography.sizes.md,
    color: colors.textMuted,
    textAlign: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    paddingBottom: spacing[8],
  },
  summary: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: radii.lg,
    padding: spacing[5],
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textMuted,
  },
  currentName: {
    marginTop: spacing[2],
    fontSize: typography.sizes.xxxl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  currentKanji: {
    marginTop: spacing[1],
    fontSize: typography.sizes.md,
    color: colors.textTertiary,
  },
  progressLine: {
    marginTop: spacing[3],
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.medium,
    color: colors.textSecondary,
  },
  nextBlock: {
    marginTop: spacing[4],
    paddingTop: spacing[4],
    alignSelf: 'stretch',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.separator,
  },
  nextLabel: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
  },
  nextNeeds: {
    marginTop: spacing[1],
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  topReached: {
    marginTop: spacing[4],
    paddingTop: spacing[4],
    alignSelf: 'stretch',
    textAlign: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.separator,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  intro: {
    marginTop: spacing[5],
    marginBottom: spacing[3],
    fontSize: typography.sizes.sm,
    color: colors.textTertiary,
    lineHeight: 20,
  },
});
