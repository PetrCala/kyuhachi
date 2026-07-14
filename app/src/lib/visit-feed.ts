/**
 * Shape and selector for the visits feed (home preview + the All-visits screen).
 *
 * Both surfaces read from `useActiveChallengeProgress`, where the visits Map and
 * the eligible-onsen display Map are already subscribed, so this just joins
 * the two and sorts. No Firestore access of its own.
 */
import type { VisitDocument } from '@kyuhachi/shared';
import type { OnsenDisplayInfo } from '@/hooks/useActiveChallengeProgress';

export interface VisitFeedItem {
  onsenId: string;
  onsenName: string;
  /** Hiragana reading of `onsenName`, shown under the kanji in a JP UI. null = none published. */
  nameKana: string | null;
  /** Hepburn reading of `onsenName`, shown under the kanji in non-JP UI. null = none published. */
  nameRomaji: string | null;
  areaName: string;
  prefecture: string;
  visit: VisitDocument;
}

/**
 * Join each visit with its onsen display info and sort newest-first by
 * `visitedAt`. A visit whose onsen isn't in `onsenMap` yet (display data still
 * loading) falls back to the raw id and empty location, same graceful fallback
 * the eligible-onsen `rows` use.
 */
export function buildVisitFeed(
  visits: Map<string, VisitDocument>,
  onsenMap: Map<string, OnsenDisplayInfo>
): VisitFeedItem[] {
  return Array.from(visits.entries())
    .map(([onsenId, visit]) => {
      const info = onsenMap.get(onsenId);
      return {
        onsenId,
        onsenName: info?.name ?? onsenId,
        nameKana: info?.nameKana ?? null,
        nameRomaji: info?.nameRomaji ?? null,
        areaName: info?.areaName ?? '',
        prefecture: info?.prefecture ?? '',
        visit,
      };
    })
    .sort((a, b) => b.visit.visitedAt.toMillis() - a.visit.visitedAt.toMillis());
}
