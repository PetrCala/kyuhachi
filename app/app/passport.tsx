import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { usePreferences } from '@/context/PreferencesContext';
import { useActiveChallengeProgress } from '@/hooks/useActiveChallengeProgress';
import { Stamp } from '@/components/Stamp';
import { StampSlot } from '@/components/StampSlot';
import {
  GRID_COLS,
  GRID_ROWS,
  STAMPS_PER_PAGE,
  pageCells,
  pageCount,
  pageOfSlot,
} from '@/lib/passport';
import { colors, spacing, typography, radii } from '@/theme';

const PAGE_H_PAD = spacing[5];
const CELL_GAP = spacing[3];

// Staggered page reveal. One Animated driver (0 → 1) per page fans out to every
// filled stamp through interpolation — the single-driver approach used by
// Confetti — so the cascade runs on the native thread off one timing animation.
// Each stamp starts at `(localFillIndex / STAMPS_PER_PAGE) * STAGGER_SPREAD` and
// fades + rises + scales up over the next REVEAL_WINDOW of the driver; the spread
// plus window stay ≤ 1 so the last stamp still finishes.
const REVEAL_DURATION = 620;
const STAGGER_SPREAD = 0.55;
const REVEAL_WINDOW = 0.45;
const REVEAL_RISE = 10;
const REVEAL_START_SCALE = 0.82;

// "Just collected" ink-press for the single most-recent stamp on first open: a
// quick opacity pop with an over-scale that springs back to 1, like a hand
// pressing the seal onto the page.
const INK_OPACITY_DURATION = 170;
const INK_GROW_DURATION = 160;
const INK_OVER_SCALE = 1.28;
const INK_START_SCALE = 0.9;

interface StampEntry {
  onsenId: string;
  /** visitedAt in ms — the fill order. */
  ms: number;
  prefecture: string;
  areaName: string;
  name: string;
}

export function PassportPage({
  pageIndex,
  totalSlots,
  stamped,
  stampSize,
  animate,
  isCurrent,
  mostRecentSlot,
}: {
  pageIndex: number;
  totalSlots: number;
  stamped: StampEntry[];
  stampSize: number;
  /** Master switch: false (Reduce Motion or the preference off) shows stamps at once. */
  animate: boolean;
  /** Only the page in view runs its cascade, so we never animate every page at once. */
  isCurrent: boolean;
  /** Global slot of the latest stamp (highest ms); only this one gets the ink-press. */
  mostRecentSlot: number | null;
}) {
  // The staggered-reveal driver, and the ink-press's opacity + scale. Their
  // resting values when motion is off are 1, so stamps simply show at full size.
  const reveal = useRef(new Animated.Value(animate ? 0 : 1)).current;
  const inkOpacity = useRef(new Animated.Value(animate ? 0 : 1)).current;
  const inkScale = useRef(new Animated.Value(1)).current;
  // The ink-press fires once, on the first open of the page holding the newest
  // stamp. Latched at mount so a later live-visit snapshot can't retrigger it.
  const inkSlotRef = useRef<number | null | undefined>(undefined);
  if (inkSlotRef.current === undefined) {
    inkSlotRef.current =
      animate && mostRecentSlot !== null && pageOfSlot(mostRecentSlot) === pageIndex
        ? mostRecentSlot
        : null;
  }
  const inkSlot = inkSlotRef.current;
  const inkPressedRef = useRef(false);

  // Reveal the page's stamps when it comes into view. Off-screen pages stay at
  // reveal 0 (hidden) until the user pages to them, so only the visible page
  // animates. With motion off everything is pinned visible.
  useEffect(() => {
    if (!animate) {
      reveal.setValue(1);
      inkOpacity.setValue(1);
      inkScale.setValue(1);
      return;
    }
    if (!isCurrent) return;

    reveal.setValue(0);
    const cascade = Animated.timing(reveal, {
      toValue: 1,
      duration: REVEAL_DURATION,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    cascade.start();

    let ink: Animated.CompositeAnimation | null = null;
    if (inkSlot !== null && !inkPressedRef.current) {
      inkPressedRef.current = true;
      inkOpacity.setValue(0);
      inkScale.setValue(INK_START_SCALE);
      ink = Animated.parallel([
        Animated.timing(inkOpacity, {
          toValue: 1,
          duration: INK_OPACITY_DURATION,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(inkScale, {
            toValue: INK_OVER_SCALE,
            duration: INK_GROW_DURATION,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.spring(inkScale, {
            toValue: 1,
            friction: 4,
            tension: 140,
            useNativeDriver: true,
          }),
        ]),
      ]);
      ink.start();
    }

    return () => {
      cascade.stop();
      ink?.stop();
    };
  }, [animate, isCurrent, inkSlot, reveal, inkOpacity, inkScale]);

  // Lay out this page's cells into a row-major grid for rendering, while their
  // fill order (which slot is where) comes from pageCells.
  const grid: (number | null)[][] = Array.from({ length: GRID_ROWS }, () =>
    Array.from({ length: GRID_COLS }, () => null)
  );
  for (const cell of pageCells(pageIndex, totalSlots)) {
    grid[cell.row][cell.col] = cell.slot;
  }

  return (
    <View style={styles.page}>
      {grid.map((rowSlots, r) => (
        <View key={r} style={styles.row}>
          {rowSlots.map((slot, c) => {
            if (slot === null) return <View key={c} style={{ width: stampSize }} />;
            const entry = stamped[slot];
            // Empty slots don't animate — they're the printed page beneath the ink.
            if (!entry) return <StampSlot key={c} size={stampSize} />;

            const stamp = (
              <Stamp
                size={stampSize}
                prefecture={entry.prefecture}
                areaName={entry.areaName}
                name={entry.name}
                date={new Date(entry.ms)}
              />
            );

            if (slot === inkSlot) {
              return (
                <Animated.View
                  key={c}
                  testID="passportInkStamp"
                  style={{ opacity: inkOpacity, transform: [{ scale: inkScale }] }}
                >
                  {stamp}
                </Animated.View>
              );
            }

            // Cascade by fill order within the page: later stamps start later.
            const localIndex = slot - pageIndex * STAMPS_PER_PAGE;
            const start = (localIndex / STAMPS_PER_PAGE) * STAGGER_SPREAD;
            const end = start + REVEAL_WINDOW;
            const opacity = reveal.interpolate({
              inputRange: [start, end],
              outputRange: [0, 1],
              extrapolate: 'clamp',
            });
            const translateY = reveal.interpolate({
              inputRange: [start, end],
              outputRange: [REVEAL_RISE, 0],
              extrapolate: 'clamp',
            });
            const scale = reveal.interpolate({
              inputRange: [start, end],
              outputRange: [REVEAL_START_SCALE, 1],
              extrapolate: 'clamp',
            });
            return (
              <Animated.View
                key={c}
                testID="passportStamp"
                style={{ opacity, transform: [{ translateY }, { scale }] }}
              >
                {stamp}
              </Animated.View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export default function Passport() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const { animatePassport } = usePreferences();
  const { loading, challenge, completionCount, eligibleVisitCount, visits, onsenMap } =
    useActiveChallengeProgress();
  // null until the user pages by hand; the displayed page then follows the swipe.
  // Before that, the indicator tracks the page the book opened on (the latest stamp).
  const [scrolledPage, setScrolledPage] = useState<number | null>(null);

  // Resolve Reduce Motion once (same pattern as StampClaimModal/TierClaimModal);
  // null until known so we don't briefly pin stamps visible and then re-hide them.
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((rm) => {
      if (!cancelled) setReduceMotion(rm);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const animate = reduceMotion === false && animatePassport;

  // Eligible visits in visit order — the sequence the book fills in.
  const stamped = useMemo<StampEntry[]>(() => {
    if (!challenge) return [];
    const eligible = new Set(challenge.snapshotEligibleOnsenIds);
    const list: StampEntry[] = [];
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
    return list;
  }, [challenge, visits, onsenMap]);

  // Layout values, computed before the early returns so the hooks order is
  // stable. completionCount is null only while loading, when we bail out below.
  const totalSlots = completionCount ?? 0;
  const pages = pageCount(totalSlots);
  const stampSize = Math.floor((width - PAGE_H_PAD * 2 - CELL_GAP * (GRID_COLS - 1)) / GRID_COLS);

  // The page holding the most recent stamp — the book opens here. Latched on the
  // first render with data so a later live visit snapshot can't yank the user off
  // the page they paged to. Stays 0 for an empty book (no stamps yet).
  const openPageRef = useRef<number | null>(null);
  if (openPageRef.current === null && stamped.length > 0) {
    openPageRef.current = pageOfSlot(stamped.length - 1);
  }
  const openPage = openPageRef.current ?? 0;
  const page = scrolledPage ?? openPage;

  // The newest stamp is the last entry in the visit-ordered list (highest ms).
  // It earns the one-time "just collected" ink-press on the page that opens.
  const mostRecentSlot = stamped.length > 0 ? stamped.length - 1 : null;

  // Right-to-left paging: pages render reversed so page 1 sits on the right and
  // later pages sit to its left, like reading a Japanese stamp book. The offset
  // opens the view on `openPage`; it's memoized so a live visit snapshot re-render
  // never yanks the scroll position away from where the user paged to.
  const initialOffset = useMemo(
    () => ({ x: (pages - 1 - openPage) * width, y: 0 }),
    [pages, width, openPage]
  );

  const header = <Stack.Screen options={{ title: t('passport.title'), headerShown: true }} />;

  if (loading || reduceMotion === null || (challenge && completionCount === null)) {
    return (
      <View style={styles.center}>
        {header}
        <ActivityIndicator />
      </View>
    );
  }

  if (!challenge || completionCount === null) {
    return (
      <View style={styles.center}>
        {header}
        <Text style={styles.emptyText}>{t('passport.empty')}</Text>
      </View>
    );
  }

  function onScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const domIndex = Math.round(e.nativeEvent.contentOffset.x / width);
    setScrolledPage(pages - 1 - domIndex);
  }

  return (
    <View style={styles.screen}>
      {header}
      <View style={styles.headerArea}>
        <Text style={styles.progress}>
          {t('passport.progress', { visited: eligibleVisitCount, total: totalSlots })}
        </Text>
        <Text style={styles.hint}>{t('passport.hint')}</Text>
      </View>

      <View style={styles.pager}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentOffset={initialOffset}
          onMomentumScrollEnd={onScrollEnd}
        >
          {Array.from({ length: pages }).map((_, domIndex) => {
            const logicalPage = pages - 1 - domIndex;
            return (
              <View key={logicalPage} style={{ width }}>
                <PassportPage
                  pageIndex={logicalPage}
                  totalSlots={totalSlots}
                  stamped={stamped}
                  stampSize={stampSize}
                  animate={animate}
                  isCurrent={logicalPage === page}
                  mostRecentSlot={mostRecentSlot}
                />
              </View>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.footerArea}>
        <View style={styles.dots}>
          {Array.from({ length: pages }).map((_, domIndex) => {
            const logicalPage = pages - 1 - domIndex;
            return (
              <View key={logicalPage} style={[styles.dot, logicalPage === page && styles.dotActive]} />
            );
          })}
        </View>
        <Text style={styles.pageLabel}>
          {t('passport.pageIndicator', { page: page + 1, total: pages })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[6],
    backgroundColor: colors.background,
  },
  emptyText: {
    fontSize: typography.sizes.md,
    color: colors.textMuted,
    textAlign: 'center',
  },
  headerArea: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[2],
    alignItems: 'center',
  },
  progress: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  hint: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    marginTop: spacing[1],
  },
  pager: {
    flex: 1,
    justifyContent: 'center',
  },
  page: {
    paddingHorizontal: PAGE_H_PAD,
    gap: CELL_GAP,
  },
  row: {
    flexDirection: 'row',
    gap: CELL_GAP,
  },
  footerArea: {
    paddingVertical: spacing[4],
    alignItems: 'center',
    gap: spacing[2],
  },
  dots: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  dot: {
    width: spacing[2],
    height: spacing[2],
    borderRadius: radii.full,
    backgroundColor: colors.separator,
  },
  dotActive: {
    backgroundColor: colors.actionPrimary,
  },
  pageLabel: {
    fontSize: typography.sizes.xs,
    color: colors.textMuted,
  },
});
