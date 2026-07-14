import { useMemo, useRef, useState } from 'react';
import {
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
import { useActiveChallengeProgress } from '@/hooks/useActiveChallengeProgress';
import { Stamp } from '@/components/Stamp';
import { StampSlot } from '@/components/StampSlot';
import { GRID_COLS, GRID_ROWS, pageCells, pageCount, pageOfSlot } from '@/lib/passport';
import { colors, spacing, typography, radii } from '@/theme';

const PAGE_H_PAD = spacing[5];
const CELL_GAP = spacing[3];

interface StampEntry {
  onsenId: string;
  /** visitedAt in ms: the fill order. */
  ms: number;
  prefecture: string;
  areaName: string;
  name: string;
}

function PassportPage({
  pageIndex,
  totalSlots,
  stamped,
  stampSize,
}: {
  pageIndex: number;
  totalSlots: number;
  stamped: StampEntry[];
  stampSize: number;
}) {
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
            if (!entry) return <StampSlot key={c} size={stampSize} />;
            return (
              <Stamp
                key={c}
                size={stampSize}
                prefecture={entry.prefecture}
                areaName={entry.areaName}
                name={entry.name}
                date={new Date(entry.ms)}
              />
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
  const { loading, challenge, completionCount, eligibleVisitCount, visits, onsenMap } =
    useActiveChallengeProgress();
  // null until the user pages by hand; the displayed page then follows the swipe.
  // Before that, the indicator tracks the page the book opened on (the latest stamp).
  const [scrolledPage, setScrolledPage] = useState<number | null>(null);

  // Eligible visits in visit order: the sequence the book fills in.
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

  // The page holding the most recent stamp: the book opens here. Latched on the
  // first render with data so a later live visit snapshot can't yank the user off
  // the page they paged to. Stays 0 for an empty book (no stamps yet).
  const openPageRef = useRef<number | null>(null);
  if (openPageRef.current === null && stamped.length > 0) {
    openPageRef.current = pageOfSlot(stamped.length - 1);
  }
  const openPage = openPageRef.current ?? 0;
  const page = scrolledPage ?? openPage;

  // Right-to-left paging: pages render reversed so page 1 sits on the right and
  // later pages sit to its left, like reading a Japanese stamp book. The offset
  // opens the view on `openPage`; it's memoized so a live visit snapshot re-render
  // never yanks the scroll position away from where the user paged to.
  const initialOffset = useMemo(
    () => ({ x: (pages - 1 - openPage) * width, y: 0 }),
    [pages, width, openPage]
  );

  const header = <Stack.Screen options={{ title: t('passport.title'), headerShown: true }} />;

  if (loading || (challenge && completionCount === null)) {
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
