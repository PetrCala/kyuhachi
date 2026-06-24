import { useMemo, useState } from 'react';
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
import { GRID_COLS, GRID_ROWS, pageCells, pageCount } from '@/lib/passport';
import { colors, spacing, typography, radii } from '@/theme';

const PAGE_H_PAD = spacing[5];
const CELL_GAP = spacing[3];

interface StampEntry {
  onsenId: string;
  /** visitedAt in ms — the fill order. */
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
  const [page, setPage] = useState(0);

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

  const totalSlots = completionCount;
  const pages = pageCount(totalSlots);
  const stampSize = Math.floor((width - PAGE_H_PAD * 2 - CELL_GAP * (GRID_COLS - 1)) / GRID_COLS);

  function onScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    setPage(Math.round(e.nativeEvent.contentOffset.x / width));
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
          onMomentumScrollEnd={onScrollEnd}
        >
          {Array.from({ length: pages }).map((_, p) => (
            <View key={p} style={{ width }}>
              <PassportPage
                pageIndex={p}
                totalSlots={totalSlots}
                stamped={stamped}
                stampSize={stampSize}
              />
            </View>
          ))}
        </ScrollView>
      </View>

      <View style={styles.footerArea}>
        <View style={styles.dots}>
          {Array.from({ length: pages }).map((_, p) => (
            <View key={p} style={[styles.dot, p === page && styles.dotActive]} />
          ))}
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
