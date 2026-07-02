import { useMemo } from 'react';
import { useActiveChallengeProgress } from '@/hooks/useActiveChallengeProgress';
import { useOnsenCatalog } from '@/context/OnsenCatalogContext';
import { OnsenList, type OnsenListItem } from '@/components/OnsenList';

export default function OnsenBrowse() {
  // Visited state for the active challenge comes from the shared hook so this
  // tab, the home dashboard, and the record-a-visit list stay in sync.
  const { visitedIds } = useActiveChallengeProgress();
  // The catalog comes from the offline-first local store (display order is
  // handled by OnsenList), so this tab works with no network at all.
  const { activeOnsens, loading } = useOnsenCatalog();

  const items = useMemo<OnsenListItem[]>(
    () =>
      activeOnsens.map((o) => ({
        id: o.id,
        name: o.name,
        nameKana: o.nameKana,
        nameRomaji: o.nameRomaji,
        areaName: o.areaName,
        prefecture: o.prefecture,
        lat: o.lat,
        lng: o.lng,
        visited: visitedIds.has(o.id),
      })),
    [activeOnsens, visitedIds]
  );

  return <OnsenList data={items} loading={loading} unvisitedVariant="chevron" />;
}
