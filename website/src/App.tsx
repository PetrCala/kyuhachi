import { useEffect, useMemo, useState } from 'react';
import { JourneyMap } from './components/JourneyMap';
import { LayerPanel } from './components/LayerPanel';
import { StatsPanel } from './components/StatsPanel';
import { VisitPanel } from './components/VisitPanel';
import { PLANNED_ROUTE_CORRIDOR_KM } from './config';
import { useChallengeType } from './hooks/useChallengeType';
import { useJourneyChallenge } from './hooks/useJourneyChallenge';
import { useJourneyDays } from './hooks/useJourneyDays';
import { useOnsens } from './hooks/useOnsens';
import { usePlannedRoute } from './hooks/usePlannedRoute';
import { usePresence } from './hooks/usePresence';
import { useVisits } from './hooks/useVisits';
import { effectiveEligibleIds } from './lib/effective-pool';
import { distanceToPolylineKm } from './lib/geo';
import { computeWalkStats } from './lib/walk-stats';
import type { LayerVisibility, OnsenWithId } from './types';

const DEFAULT_LAYERS: LayerVisibility = {
  walked: true,
  planned: true,
  visited: true,
  plannedOnsens: false,
  allOnsens: false,
  terrain: false,
};

/**
 * How long the loading line stays hopeful before it admits to a problem. A
 * Firestore listener retries a stalled connection indefinitely and never calls
 * its error callback, so on a bad train connection nothing else on the page
 * would ever stop saying "loading".
 */
const SLOW_LOAD_MS = 12_000;

/** One decimal under 10 km, where rounding prints the first 400 m as "0 km". */
function formatKm(km: number): string {
  return km < 10 ? km.toFixed(1) : String(Math.round(km));
}

export default function App() {
  const { challenge, loading: challengeLoading, error } = useJourneyChallenge();
  const { onsens, failed: onsensFailed } = useOnsens();
  const { visits, failed: visitsFailed, loaded: visitsLoaded } = useVisits(challenge?.id ?? null);
  const { days: walkedDays, failed: daysFailed } = useJourneyDays();
  const { challengeType, failed: challengeTypeFailed } = useChallengeType(
    challenge?.typeId ?? null
  );
  const { route: plannedRoute, failed: routeFailed } = usePlannedRoute(
    challenge?.activeRouteId ?? null
  );
  const [selectedOnsenId, setSelectedOnsenId] = useState<string | null>(null);
  const [layers, setLayers] = useState<LayerVisibility>(DEFAULT_LAYERS);
  const [mapFailed, setMapFailed] = useState(false);
  const [slowLoad, setSlowLoad] = useState(false);
  const viewerCount = usePresence();

  const visitedOnsens = useMemo(() => {
    if (!onsens) return [];
    return [...visits.keys()]
      .map((id) => onsens.get(id))
      .filter((onsen): onsen is OnsenWithId => onsen != null);
  }, [visits, onsens]);

  /*
   * The pool this challenge is judged against: frozen snapshot ∪ live type
   * pool (ADR-010 in the app repo). The map layer and the counters below all
   * derive from this one list, so a publish that grows the pool moves the
   * dots and the numbers together.
   */
  const effectivePoolIds = useMemo(
    () =>
      challenge
        ? [...effectiveEligibleIds(challenge.snapshotEligibleOnsenIds, challengeType?.eligibleOnsenIds)]
        : [],
    [challenge, challengeType]
  );

  /** The effective pool, joined against the catalog. */
  const allChallengeOnsens = useMemo(() => {
    if (!onsens) return [];
    return effectivePoolIds
      .map((id) => onsens.get(id))
      .filter((onsen): onsen is OnsenWithId => onsen != null);
  }, [onsens, effectivePoolIds]);

  /** The planned route, only once it holds enough points to be a line at all. */
  const plannedPoints = plannedRoute && plannedRoute.points.length >= 2 ? plannedRoute.points : null;

  /**
   * "Planned": eligible, not yet visited, and close to the planned route.
   * Computed client-side; there is deliberately no planned-onsens data model.
   */
  const plannedOnsens = useMemo(() => {
    if (!plannedPoints) return [];
    return allChallengeOnsens.filter(
      (onsen) =>
        !visits.has(onsen.id) &&
        distanceToPolylineKm({ lat: onsen.lat, lng: onsen.lng }, plannedPoints) <=
          PLANNED_ROUTE_CORRIDOR_KM
    );
  }, [allChallengeOnsens, visits, plannedPoints]);

  /** Every figure the site quotes, from the header chip to the stats card. */
  const stats = useMemo(
    () =>
      computeWalkStats({
        walkedDays,
        visits,
        onsens,
        eligibleOnsenIds: effectivePoolIds.length > 0 ? effectivePoolIds : null,
        completionCount: challengeType?.completionCount ?? null,
      }),
    [walkedDays, visits, onsens, effectivePoolIds, challengeType]
  );

  const selectedOnsen = selectedOnsenId ? (onsens?.get(selectedOnsenId) ?? null) : null;
  const selectedVisit = selectedOnsenId ? (visits.get(selectedOnsenId) ?? null) : null;

  // A failed catalog never fills in, so it has to end the loading state too.
  // Otherwise the overlay sits there for good over a map nobody is fetching.
  const loading = challengeLoading || (onsens === null && !onsensFailed);
  const partlyFailed =
    onsensFailed || daysFailed || visitsFailed || mapFailed || challengeTypeFailed || routeFailed;

  /*
   * The pre-walk state is not "no challenge": the challenge document is created
   * in the app months before the first step, so it is always there. What says
   * he has not set off is a challenge with nothing recorded against it yet.
   */
  const notStarted =
    challenge != null &&
    walkedDays != null &&
    walkedDays.length === 0 &&
    visitsLoaded &&
    visits.size === 0;

  useEffect(() => {
    if (!loading) return;
    const timer = window.setTimeout(() => setSlowLoad(true), SLOW_LOAD_MS);
    return () => window.clearTimeout(timer);
  }, [loading]);

  /**
   * Layers with nothing behind them. A toggle that draws nothing when ticked
   * reads as a broken map, so the panel greys it out instead. Terrain is the
   * one layer that never depends on our data.
   */
  const layerAvailability = {
    walked: walkedDays != null && walkedDays.length > 0,
    planned: plannedPoints != null,
    visited: visitedOnsens.length > 0,
    plannedOnsens: plannedPoints != null,
    allOnsens: allChallengeOnsens.length > 0,
    terrain: true,
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          {/* The app icon: 九 over 八 on an ink tile. Decorative, and the title
              beside it says the same thing in the same characters. */}
          <span className="title-mark" aria-hidden="true">
            <span>九</span>
            <span>八</span>
          </span>
          <div>
            <h1>
              <span lang="ja">九州八十八湯</span> Journey
            </h1>
            <p className="subtitle">88 of Kyushu's hot springs, on foot</p>
          </div>
        </div>
        <div className="header-chips">
          {stats.km != null && (
            <div className="progress-chip chip-walked">{formatKm(stats.km)} km walked</div>
          )}
          {stats.onsensTarget != null && (
            <div className="progress-chip">
              {stats.onsensVisited ?? 0} / {stats.onsensTarget} onsens
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
          onError={() => setMapFailed(true)}
        />

        {/* The map dots live in a WebGL canvas, so a keyboard cannot reach any
            of them, and clicking a dot is the only way into what Petr wrote.
            These buttons open the same panel; they stay out of sight until a
            keyboard tabs into them. */}
        {visitedOnsens.length > 0 && (
          <nav className="sr-only-list" aria-labelledby="visited-list-heading">
            <h2 id="visited-list-heading">Visited onsens</h2>
            {visitedOnsens.map((onsen) => (
              <button key={onsen.id} type="button" onClick={() => setSelectedOnsenId(onsen.id)}>
                {onsen.nameRomaji ?? <span lang="ja">{onsen.name}</span>}
              </button>
            ))}
          </nav>
        )}

        <LayerPanel layers={layers} onChange={setLayers} available={layerAvailability} />
        <StatsPanel stats={stats} />

        {viewerCount > 0 && (
          <div className="presence-pill">
            <span className="presence-dot" aria-hidden="true" />
            {viewerCount === 1 ? 'only you here' : `${viewerCount} viewing now`}
          </div>
        )}

        {/* Reloading really is the fix: Firestore drops a listener for good once
            it errors, so nothing on the page will recover on its own. */}
        {partlyFailed && !error && (
          <div className="load-banner" role="status">
            Part of the journey could not be loaded.
            <button type="button" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        )}

        {loading && (
          <div className="status-overlay" role="status">
            {slowLoad
              ? 'Still trying to reach the server. Check your connection.'
              : 'Loading the journey...'}
          </div>
        )}
        {!loading && error && (
          <div className="status-overlay">The journey could not be loaded right now.</div>
        )}
        {!loading && !error && !partlyFailed && notStarted && (
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
