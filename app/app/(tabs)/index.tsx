import { useMemo, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  AccessibilityInfo,
} from 'react-native';
import {
  Easing,
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useActiveChallengeProgress } from '@/hooks/useActiveChallengeProgress';
import { usePreferences } from '@/context/PreferencesContext';
import { ProgressBar, buildTierMarkers } from '@/components/ProgressBar';
import { VisitCard } from '@/components/VisitCard';
import { TierClaimModal, type TierCelebration } from '@/components/TierClaimModal';
import { ChallengeBadge } from '@/components/ChallengeBadge';
import { SuggestNextCard } from '@/components/SuggestNextCard';
import { SpaportHeroButton } from '@/components/SpaportHeroButton';
import { WordmarkLoader } from '@/components/WordmarkLoader';
import { RankUpToast, type RankToast } from '@/components/RankUpToast';
import RecordVisitFab from '@/components/RecordVisitFab';
import { buildVisitFeed } from '@/lib/visit-feed';
import { buildNextCandidates } from '@/lib/next-onsen';
import { rankLabel } from '@/lib/challenge-i18n';
import { colors, spacing, typography, radii } from '@/theme';

// Brand wordmark: 九八 (kyuhachi) set in Klee One. Not a translatable string —
// it's the app's visual identity and renders identically in every locale.
const HOME_WORDMARK = '九八';

// How many of the most recent visits the home screen previews before "See all".
const RECENT_VISITS_PREVIEW = 3;

// Length of the hero count-up tween, kept in step with the bar fill.
const COUNT_UP_DURATION = 800;

export default function Home() {
  const { t, i18n } = useTranslation();
  const {
    loading,
    challengeId,
    challenge,
    tiers,
    ranks,
    completionCount,
    eligibleVisitCount,
    currentRank,
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
  // condition — never hardcoded (see buildTierMarkers).
  const markers = useMemo(
    () => buildTierMarkers(tiers, eligibleVisitCount),
    [tiers, eligibleVisitCount]
  );

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

  // Toast when the derived rank steps up. Ranks are ordered worst → best, so a
  // higher index is a promotion; a null previous rank ranks below the lowest
  // (reaching the first rank counts). Switching challenges syncs silently.
  //
  // The rank is derived from data that hydrates in stages (visits, then the
  // per-onsen prefecture map), so we only arm once it has SETTLED — `!loading`
  // and `onsenMap` populated. Establishing the baseline before then would make
  // ordinary load-in look like a rank-up on every launch. After settling, the
  // only thing that moves the rank is the user recording a qualifying visit.
  const [rankToast, setRankToast] = useState<RankToast | null>(null);
  const seenRankRef = useRef<{ challengeId: string | null; rankId: string | null }>({
    challengeId: null,
    rankId: null,
  });
  useEffect(() => {
    if (loading || ranks.length === 0 || onsenMap.size === 0) return;
    const current = currentRank?.id ?? null;
    const prev = seenRankRef.current;
    if (prev.challengeId !== challengeId) {
      seenRankRef.current = { challengeId, rankId: current };
      return;
    }
    if (current && current !== prev.rankId) {
      const newIndex = ranks.findIndex((rank) => rank.id === current);
      const prevIndex = prev.rankId ? ranks.findIndex((rank) => rank.id === prev.rankId) : -1;
      if (newIndex !== -1 && newIndex > prevIndex && currentRank) {
        setRankToast({ rankName: rankLabel(currentRank, t) });
      }
    }
    seenRankRef.current = { challengeId, rankId: current };
  }, [currentRank, challengeId, ranks, loading, onsenMap, t]);

  // Animate the hero number + bar fill when a recorded visit raises the eligible
  // count — but only on a genuine increase during the session. Mirrors the
  // seenRankRef/seenTierRef latches: the first observation per challengeId syncs
  // silently (so launch and challenge switches never animate from the old value),
  // and only a later increase tweens. Motion is gated by the animateProgress
  // preference and the OS Reduce Motion setting.
  const { animateProgress } = usePreferences();
  const reduceMotionRef = useRef(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) reduceMotionRef.current = enabled;
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      reduceMotionRef.current = enabled;
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  // The integer shown in the hero string; mirrored from visitedAnim as it counts up.
  const [displayVisited, setDisplayVisited] = useState(eligibleVisitCount);
  // Whether the bar should tween to its new fill for this particular change.
  const [animateFill, setAnimateFill] = useState(false);
  // Reanimated shared value that tweens the visited count on the UI thread.
  const visitedAnim = useSharedValue(eligibleVisitCount);
  const seenVisitRef = useRef<{ challengeId: string | null; count: number | null }>({
    challengeId: null,
    count: null,
  });

  // Surface the animated count to the rendered string without a per-frame React
  // update: react only when the rounded value crosses to a new integer, then hop
  // to the JS thread so the hero keeps its localized `t()` formatting. A typical
  // +1 visit fires this exactly once.
  useAnimatedReaction(
    () => Math.round(visitedAnim.value),
    (rounded, previous) => {
      if (previous !== null && rounded !== previous) {
        runOnJS(setDisplayVisited)(rounded);
      }
    },
    []
  );

  useEffect(() => {
    const prev = seenVisitRef.current;
    if (prev.challengeId !== challengeId) {
      // Switched challenge (or first observation) — show the final value at once.
      seenVisitRef.current = { challengeId, count: eligibleVisitCount };
      visitedAnim.value = eligibleVisitCount;
      setDisplayVisited(eligibleVisitCount);
      setAnimateFill(false);
      return;
    }
    const increased = prev.count != null && eligibleVisitCount > prev.count;
    if (increased && animateProgress && !reduceMotionRef.current) {
      setAnimateFill(true);
      // Snap to the old count, then tween up to the new one; the reaction above
      // mirrors each whole-number step into the localized hero string.
      visitedAnim.value = prev.count as number;
      visitedAnim.value = withTiming(eligibleVisitCount, {
        duration: COUNT_UP_DURATION,
        easing: Easing.out(Easing.cubic),
      });
    } else {
      // Decrease, no change, or motion off: land on the final value immediately.
      setAnimateFill(false);
      visitedAnim.value = eligibleVisitCount;
      setDisplayVisited(eligibleVisitCount);
    }
    seenVisitRef.current = { challengeId, count: eligibleVisitCount };
  }, [eligibleVisitCount, challengeId, animateProgress, visitedAnim]);

  function openRules() {
    if (!challenge) return;
    router.push({ pathname: '/challenge/rules', params: { typeId: challenge.typeId } });
  }

  function openRank() {
    router.push('/challenge/rank');
  }

  // On a normal launch the boot splash stays up until this data is ready (see
  // SplashGate in the root layout), so `loading` is already false by the time
  // Home paints and this loader is skipped. It only shows as the fallback when
  // the splash hit its wait cap on a slow or offline first launch, where the
  // animated wordmark gives the stalled fetch some visible life.
  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerContent}>
          <WordmarkLoader style={styles.loadingWordmark} />
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
        {/* Brand strip: slim identity row. The big number lives in the progress
            hero below, not here, so it appears exactly once. */}
        <View style={styles.brandStrip}>
          <View style={styles.brandRow}>
            <Text style={styles.brandWordmark}>{HOME_WORDMARK}</Text>
            <Text style={styles.brandChallengeName} numberOfLines={1}>
              {challenge.name}
            </Text>
            {ranks.length > 0 && (
              <Pressable style={styles.rankBadge} onPress={openRank} accessibilityRole="button">
                <Text style={styles.rankBadgeText}>
                  {t('challengeRank.homeBadge', {
                    name: currentRank ? rankLabel(currentRank, t) : t('challengeRank.unranked'),
                  })}
                </Text>
                <Text style={styles.rankBadgeChevron}>›</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Lead block: "where do I go next?" Surfaces the nearest unvisited
            onsens, with a Browse-onsens fallback so the top is never dead. */}
        <SuggestNextCard candidates={nextCandidates} activeRoute={activeRoute} />

        {/* Progress hero: the single home for the X / 88 number, the tier bar,
            and the claim/upgrade action (or the earned-tier resting row). */}
        {completionCount !== null && (
          <View style={styles.heroSection}>
            <View style={styles.heroTopRow}>
              <Text style={styles.heroNumber}>
                {t('home.progress', { visited: displayVisited, total: completionCount })}
              </Text>
              <SpaportHeroButton />
            </View>
            <View style={styles.progressHeaderRow}>
              <Text style={styles.sectionHeading}>{t('challengeProgress.progressHeading')}</Text>
              {tiers.length > 0 && (
                <Pressable onPress={openRules}>
                  <Text style={styles.howTiersLink}>{t('challengeProgress.howTiers')} ›</Text>
                </Pressable>
              )}
            </View>
            <ProgressBar
              value={eligibleVisitCount}
              total={completionCount}
              markers={markers}
              animate={animateFill}
            />
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

        {/* Route, demoted to a compact bottom card. All four actions stay —
            View on map / Change / Clear / Select — just rendered smaller. */}
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
      </ScrollView>
      <RecordVisitFab
        style={styles.fab}
        accessibilityLabel={t('home.recordVisit')}
        onPress={() => router.push('/challenge/onsens')}
      />
      <TierClaimModal celebration={celebration} onDismiss={() => setCelebration(null)} />
      <RankUpToast
        toast={rankToast}
        onDismiss={() => setRankToast(null)}
        onPress={openRank}
      />
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
  // Layout-only: the loader owns the wordmark's type styling internally.
  loadingWordmark: {
    marginBottom: spacing[6],
  },
  brandStrip: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    paddingBottom: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  brandWordmark: {
    fontFamily: typography.fonts.brand,
    fontSize: typography.sizes.xl,
    color: colors.textPrimary,
  },
  brandChallengeName: {
    flex: 1,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.medium,
    color: colors.textSecondary,
  },
  rankBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rankBadgeText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  rankBadgeChevron: {
    fontSize: typography.sizes.md,
    color: colors.textMuted,
  },
  routeSection: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    borderTopWidth: 1,
    borderTopColor: colors.separator,
  },
  routeHeading: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textMuted,
    marginBottom: spacing[2],
  },
  routeName: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textSecondary,
    marginBottom: spacing[2],
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
  heroSection: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[5],
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing[4],
  },
  heroNumber: {
    fontSize: typography.sizes.xxxl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
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
