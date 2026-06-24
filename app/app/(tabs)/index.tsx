import { useMemo, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useActiveChallengeProgress } from '@/hooks/useActiveChallengeProgress';
import { ProgressBar, type ProgressMarker } from '@/components/ProgressBar';
import { VisitCard } from '@/components/VisitCard';
import { TierClaimModal, type TierCelebration } from '@/components/TierClaimModal';
import { ChallengeBadge } from '@/components/ChallengeBadge';
import { SuggestNextCard } from '@/components/SuggestNextCard';
import RecordVisitFab from '@/components/RecordVisitFab';
import { buildVisitFeed } from '@/lib/visit-feed';
import { buildNextCandidates } from '@/lib/next-onsen';
import { colors, spacing, typography, radii } from '@/theme';

// Brand wordmark: 九八 (kyuhachi) set in Klee One. Not a translatable string —
// it's the app's visual identity and renders identically in every locale.
const HOME_WORDMARK = '九八';

// How many of the most recent visits the home screen previews before "See all".
const RECENT_VISITS_PREVIEW = 3;

export default function Home() {
  const { t, i18n } = useTranslation();
  const {
    loading,
    challengeId,
    challenge,
    tiers,
    completionCount,
    eligibleVisitCount,
    eligibleTier,
    claiming,
    claimTier,
    activeRoute,
    visits,
    visitedIds,
    onsenMap,
    clearRoute,
    selectRoute,
  } = useActiveChallengeProgress();

  // Tier thresholds plotted on the bar come from each tier's minVisits
  // condition — never hardcoded. Tiers gated only on transport/time get no
  // marker (the bar measures visit count alone).
  const markers = useMemo<ProgressMarker[]>(() => {
    return tiers
      .map((tier) => {
        const minVisits = tier.conditions.find((c) => c.type === 'minVisits');
        if (!minVisits) return null;
        return {
          position: minVisits.value,
          tierId: tier.id,
          reached: eligibleVisitCount >= minVisits.value,
        };
      })
      .filter((m): m is ProgressMarker => m !== null);
  }, [tiers, eligibleVisitCount]);

  // Show the Claim/Upgrade button only when the eligible tier strictly outranks
  // the one already claimed. Tiers are ordered best → worst, so a lower index is
  // better; a null earnedTier ranks below the worst (the first claim outranks it).
  const claimable = useMemo(() => {
    if (!eligibleTier || tiers.length === 0) return null;
    const eligibleIndex = tiers.findIndex((tier) => tier.id === eligibleTier.id);
    const earnedTier = challenge?.earnedTier ?? null;
    const earnedIndex = earnedTier
      ? tiers.findIndex((tier) => tier.id === earnedTier)
      : tiers.length;
    if (eligibleIndex === -1 || eligibleIndex >= earnedIndex) return null;
    return { tier: eligibleTier, variant: earnedTier ? ('upgrade' as const) : ('claim' as const) };
  }, [eligibleTier, tiers, challenge?.earnedTier]);

  // Localized name of the claimed tier (tiers are already localized; fall back to
  // the tier-id key for an unknown id). Drives the claimed-tier resting row.
  const earnedTierName = challenge?.earnedTier
    ? tiers.find((tier) => tier.id === challenge.earnedTier)?.name ??
      t(`challengeTier.${challenge.earnedTier}`, { defaultValue: challenge.earnedTier })
    : null;

  // Absolute, localized claim date for the resting row, e.g. "Jun 24, 2026" /
  // "2026年6月24日". Null for tiers claimed before earnedTierAt was recorded.
  const claimedOnDate = challenge?.earnedTierAt
    ? challenge.earnedTierAt.toDate().toLocaleDateString(i18n.language, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;

  const feed = useMemo(() => buildVisitFeed(visits, onsenMap), [visits, onsenMap]);

  // Eligible onsens the user hasn't visited yet, fed to the "nearest unvisited"
  // card. The card hides itself when this is empty (challenge complete).
  const nextCandidates = useMemo(
    () =>
      challenge ? buildNextCandidates(challenge.snapshotEligibleOnsenIds, visitedIds, onsenMap) : [],
    [challenge, visitedIds, onsenMap]
  );

  const [celebration, setCelebration] = useState<TierCelebration | null>(null);

  // Celebrate when the active challenge's claimed tier steps up. earnedTier is
  // written server-side by the claimTier callable, so it arrives via the
  // snapshot after a successful claim; we track the last-seen tier per challenge
  // to fire only on a genuine increase during the session — switching challenges
  // or the first load syncs silently.
  const seenTierRef = useRef<{ challengeId: string | null; tierId: string | null }>({
    challengeId: null,
    tierId: null,
  });
  useEffect(() => {
    const current = challenge?.earnedTier ?? null;
    const prev = seenTierRef.current;
    if (prev.challengeId !== challengeId) {
      // Switched challenge (or first observation) — sync without celebrating.
      seenTierRef.current = { challengeId, tierId: current };
      return;
    }
    if (current && current !== prev.tierId && tiers.length > 0) {
      const newIndex = tiers.findIndex((tier) => tier.id === current);
      // Tiers are ordered best → worst, so a lower index is a better tier; a
      // null previous tier ranks below the worst (the first tier earned counts).
      const prevIndex = prev.tierId
        ? tiers.findIndex((tier) => tier.id === prev.tierId)
        : tiers.length;
      if (newIndex !== -1 && newIndex < prevIndex) {
        setCelebration({
          tierId: current,
          tierName: tiers[newIndex].name,
          transportMode: null,
          variant: prev.tierId == null ? 'claim' : 'upgrade',
          isTopTier: newIndex === 0,
          nextTierName: newIndex > 0 ? tiers[newIndex - 1].name : null,
        });
      }
    }
    seenTierRef.current = { challengeId, tierId: current };
  }, [challenge?.earnedTier, challengeId, tiers]);

  function openRules() {
    if (!challenge) return;
    router.push({ pathname: '/challenge/rules', params: { typeId: challenge.typeId } });
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerContent}>
          <Text style={styles.wordmark}>{HOME_WORDMARK}</Text>
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }

  if (!challenge) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerContent}>
          <Text style={styles.wordmark}>{HOME_WORDMARK}</Text>
          <Pressable style={styles.primaryButton} onPress={() => router.push('/challenge/new')}>
            <Text style={styles.primaryButtonText}>{t('home.startChallenge')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerSection}>
          <Text style={styles.wordmark}>{HOME_WORDMARK}</Text>
          <Text style={styles.challengeName}>{challenge.name}</Text>
          {completionCount !== null && (
            <Text style={styles.progress}>
              {t('home.progress', { visited: eligibleVisitCount, total: completionCount })}
            </Text>
          )}
          <View style={styles.headerActions}>
            <Pressable style={styles.pillButton} onPress={openRules}>
              <Text style={styles.pillButtonText}>{t('challengeRules.title')}</Text>
            </Pressable>
            <Pressable style={styles.pillButton} onPress={() => router.push('/challenge/list')}>
              <Text style={styles.pillButtonText}>{t('challengeList.title')}</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.routeSection}>
          <Text style={styles.routeHeading}>{t('challengeProgress.routeHeading')}</Text>
          {activeRoute ? (
            <>
              <Text style={styles.routeName}>{activeRoute.name}</Text>
              <View style={styles.routeActions}>
                <Pressable
                  style={styles.routeButton}
                  onPress={() => {
                    if (challenge.activeRouteId) {
                      router.push({
                        pathname: '/map',
                        params: { routeId: challenge.activeRouteId },
                      });
                    }
                  }}
                >
                  <Text style={styles.routeButtonText}>
                    {t('challengeProgress.viewRouteOnMap')}
                  </Text>
                </Pressable>
                <Pressable style={styles.routeButton} onPress={selectRoute}>
                  <Text style={styles.routeButtonText}>{t('challengeProgress.changeRoute')}</Text>
                </Pressable>
                <Pressable style={styles.routeButton} onPress={clearRoute}>
                  <Text style={styles.routeButtonText}>{t('challengeProgress.clearRoute')}</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <View style={styles.routeEmptyRow}>
              <Text style={styles.routeEmptyText}>{t('challengeProgress.noRoute')}</Text>
              <Pressable style={styles.routeButton} onPress={selectRoute}>
                <Text style={styles.routeButtonText}>{t('challengeProgress.selectRoute')}</Text>
              </Pressable>
            </View>
          )}
        </View>

        {completionCount !== null && (
          <View style={styles.progressSection}>
            <View style={styles.progressHeaderRow}>
              <Text style={styles.sectionHeading}>{t('challengeProgress.progressHeading')}</Text>
              {tiers.length > 0 && (
                <Pressable onPress={openRules}>
                  <Text style={styles.howTiersLink}>{t('challengeProgress.howTiers')} ›</Text>
                </Pressable>
              )}
            </View>
            <ProgressBar value={eligibleVisitCount} total={completionCount} markers={markers} />
            {claimable ? (
              <Pressable
                style={[styles.claimButton, claiming && styles.claimButtonDisabled]}
                onPress={claimTier}
                disabled={claiming}
                accessibilityRole="button"
              >
                {claiming ? (
                  <ActivityIndicator color={colors.actionPrimaryText} />
                ) : (
                  <Text style={styles.claimButtonText}>
                    {t(
                      claimable.variant === 'upgrade'
                        ? 'challengeProgress.upgradeTier'
                        : 'challengeProgress.claimTier',
                      { tier: claimable.tier.name }
                    )}
                  </Text>
                )}
              </Pressable>
            ) : challenge.earnedTier ? (
              // Once claimed (and nothing higher to claim), the button's slot
              // becomes the badge's resting place: medal + tier name.
              <View style={styles.tierRow}>
                <ChallengeBadge tierId={challenge.earnedTier} size={spacing[8]} accessibilityLabel={null} />
                <View>
                  <Text style={styles.tierRowName}>{earnedTierName}</Text>
                  <Text style={styles.tierRowSub}>
                    {claimedOnDate
                      ? t('challengeProgress.tierClaimedOn', { date: claimedOnDate })
                      : t('challengeProgress.tierClaimed')}
                  </Text>
                </View>
              </View>
            ) : null}
          </View>
        )}

        <SuggestNextCard candidates={nextCandidates} activeRoute={activeRoute} />

        <View style={styles.recentSection}>
          <View style={styles.recentHeaderRow}>
            <Text style={styles.sectionHeading}>{t('home.recentVisits.title')}</Text>
            {feed.length > RECENT_VISITS_PREVIEW && (
              <Pressable onPress={() => router.push('/visits')}>
                <Text style={styles.howTiersLink}>{t('home.recentVisits.seeAll')} ›</Text>
              </Pressable>
            )}
          </View>
          {feed.length === 0 ? (
            <Text style={styles.recentEmpty}>{t('home.recentVisits.empty')}</Text>
          ) : (
            feed.slice(0, RECENT_VISITS_PREVIEW).map((item) => (
              <VisitCard
                key={item.onsenId}
                item={item}
                onPress={() => router.push(`/onsens/${item.onsenId}`)}
              />
            ))
          )}
        </View>
      </ScrollView>
      <RecordVisitFab
        style={styles.fab}
        accessibilityLabel={t('home.recordVisit')}
        onPress={() => router.push('/challenge/onsens')}
      />
      <TierClaimModal celebration={celebration} onDismiss={() => setCelebration(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[6],
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    // Clear the floating record-visit FAB so the last card never hides behind it.
    paddingBottom: spacing[8] + spacing[12],
  },
  fab: {
    position: 'absolute',
    right: spacing[4],
    bottom: spacing[4],
  },
  wordmark: {
    fontFamily: typography.fonts.brand,
    fontSize: typography.sizes.xxl,
    color: colors.textPrimary,
    marginBottom: spacing[6],
  },
  headerSection: {
    alignItems: 'center',
    paddingTop: spacing[4],
    paddingBottom: spacing[6],
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  challengeName: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.medium,
    color: colors.textSecondary,
    marginBottom: spacing[2],
  },
  progress: {
    fontSize: typography.sizes.xxxl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing[2],
    marginTop: spacing[3],
  },
  pillButton: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    backgroundColor: colors.backgroundSecondary,
    borderRadius: radii.full,
  },
  pillButtonText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textSecondary,
  },
  routeSection: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  routeHeading: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textMuted,
    marginBottom: spacing[3],
  },
  routeName: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginBottom: spacing[3],
  },
  routeActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  routeEmptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  routeEmptyText: {
    fontSize: typography.sizes.md,
    color: colors.textMuted,
    flex: 1,
    marginRight: spacing[3],
  },
  routeButton: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  routeButtonText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  progressSection: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[5],
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  progressHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing[5],
  },
  sectionHeading: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textMuted,
  },
  howTiersLink: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    color: colors.actionPrimary,
  },
  claimButton: {
    marginTop: spacing[4],
    backgroundColor: colors.actionPrimary,
    borderRadius: radii.md,
    paddingVertical: spacing[3],
    alignItems: 'center',
    justifyContent: 'center',
  },
  claimButtonDisabled: {
    opacity: 0.6,
  },
  claimButtonText: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.actionPrimaryText,
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    marginTop: spacing[4],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    backgroundColor: colors.backgroundSecondary,
    borderRadius: radii.md,
  },
  tierRowName: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  tierRowSub: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    marginTop: spacing[1],
  },
  recentSection: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[5],
    borderTopWidth: 1,
    borderTopColor: colors.separator,
  },
  recentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing[4],
  },
  recentEmpty: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
  },
  primaryButton: {
    backgroundColor: colors.actionPrimary,
    borderRadius: radii.md,
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[3],
  },
  primaryButtonText: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.actionPrimaryText,
  },
});
