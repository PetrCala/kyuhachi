import { useMemo, useState } from 'react';
import { JourneyMap } from './components/JourneyMap';
import { LayerPanel } from './components/LayerPanel';
import { VisitPanel } from './components/VisitPanel';
import { PLANNED_ROUTE_CORRIDOR_KM } from './config';
import { useChallengeType } from './hooks/useChallengeType';
import { useJourneyChallenge } from './hooks/useJourneyChallenge';
import { useJourneyDays } from './hooks/useJourneyDays';
import { useOnsens } from './hooks/useOnsens';
import { usePlannedRoute } from './hooks/usePlannedRoute';
import { useVisits } from './hooks/useVisits';
import { distanceToPolylineKm } from './lib/geo';
import type { LayerVisibility, OnsenWithId } from './types';

const DEFAULT_LAYERS: LayerVisibility = {
  walked: true,
  planned: true,
  visited: true,
  plannedOnsens: false,
  allOnsens: false,
  terrain: false,
};

export default function App() {
  const { challenge, loading: challengeLoading, error } = useJourneyChallenge();
  const onsens = useOnsens();
  const visits = useVisits(challenge?.id ?? null);
  const challengeType = useChallengeType(challenge?.typeId ?? null);
  const walkedDays = useJourneyDays();
  const plannedRoute = usePlannedRoute(challenge?.activeRouteId ?? null);
  const [selectedOnsenId, setSelectedOnsenId] = useState<string | null>(null);
  const [layers, setLayers] = useState<LayerVisibility>(DEFAULT_LAYERS);

  const visitedOnsens = useMemo(() => {
    if (!onsens) return [];
    return [...visits.keys()]
      .map((id) => onsens.get(id))
      .filter((onsen): onsen is OnsenWithId => onsen != null);
  }, [visits, onsens]);

  /** The challenge's eligible pool, joined against the catalog. */
  const allChallengeOnsens = useMemo(() => {
    if (!onsens || !challengeType) return [];
    return challengeType.eligibleOnsenIds
      .map((id) => onsens.get(id))
      .filter((onsen): onsen is OnsenWithId => onsen != null);
  }, [onsens, challengeType]);

  /**
   * "Planned": eligible, not yet visited, and close to the planned route.
   * Computed client-side; there is deliberately no planned-onsens data model.
   */
  const plannedOnsens = useMemo(() => {
    if (!plannedRoute || plannedRoute.points.length < 2) return [];
    return allChallengeOnsens.filter(
      (onsen) =>
        !visits.has(onsen.id) &&
        distanceToPolylineKm({ lat: onsen.lat, lng: onsen.lng }, plannedRoute.points) <=
          PLANNED_ROUTE_CORRIDOR_KM
    );
  }, [allChallengeOnsens, visits, plannedRoute]);

  const eligibleVisitCount = useMemo(() => {
    if (!challenge) return 0;
    const pool = new Set(challenge.snapshotEligibleOnsenIds);
    return [...visits.keys()].filter((id) => pool.has(id)).length;
  }, [visits, challenge]);

  const walkedKm = useMemo(() => {
    if (!walkedDays) return 0;
    return walkedDays.reduce((sum, day) => sum + day.distanceMeters, 0) / 1000;
  }, [walkedDays]);

  const selectedOnsen = selectedOnsenId ? (onsens?.get(selectedOnsenId) ?? null) : null;
  const selectedVisit = selectedOnsenId ? (visits.get(selectedOnsenId) ?? null) : null;
  const loading = challengeLoading || onsens === null;

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          <span className="title-mark">♨</span>
          <div>
            <h1>九州八十八湯 Journey</h1>
            <p className="subtitle">Petr walks the Kyushu 88 onsen challenge</p>
          </div>
        </div>
        <div className="header-chips">
          {walkedKm > 0 && (
            <div className="progress-chip chip-walked" title="Total distance walked">
              {Math.round(walkedKm)} km
            </div>
          )}
          {challengeType && (
            <div className="progress-chip" title="Unique eligible onsens visited">
              {eligibleVisitCount} / {challengeType.completionCount} onsens
            </div>
          )}
        </div>
      </header>

      <main className="map-wrap">
        <JourneyMap
          visited={visitedOnsens}
          allOnsens={allChallengeOnsens}
          plannedOnsens={plannedOnsens}
          walkedDays={walkedDays ?? []}
          plannedRoute={plannedRoute}
          layers={layers}
          selectedOnsenId={selectedOnsenId}
          onSelect={setSelectedOnsenId}
        />

        <LayerPanel layers={layers} onChange={setLayers} />

        {loading && <div className="status-overlay">Loading the journey...</div>}
        {!loading && error && (
          <div className="status-overlay">The journey could not be loaded right now.</div>
        )}
        {!loading && !error && !challenge && (
          <div className="status-overlay">The journey has not started yet. Check back soon.</div>
        )}

        {selectedOnsen && selectedVisit && (
          <VisitPanel
            onsen={selectedOnsen}
            visit={selectedVisit}
            onClose={() => setSelectedOnsenId(null)}
          />
        )}
      </main>
    </div>
  );
}
