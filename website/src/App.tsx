import type { JourneyDayDocument } from '@kyuhachi/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { JourneyMap } from './components/JourneyMap';
import { LayerPanel } from './components/LayerPanel';
import { StatsPanel } from './components/StatsPanel';
import { TimelineRail } from './components/TimelineRail';
import { VisitPanel } from './components/VisitPanel';
import { PLANNED_ROUTE_CORRIDOR_KM } from './config';
import { useChallengeType } from './hooks/useChallengeType';
import { useJourneyChallenge } from './hooks/useJourneyChallenge';
import { useJourneyDays } from './hooks/useJourneyDays';
import { useOnsens } from './hooks/useOnsens';
import { usePlannedRoute } from './hooks/usePlannedRoute';
import { usePresence } from './hooks/usePresence';
import { useTimeline } from './hooks/useTimeline';
import { useVisits } from './hooks/useVisits';
import { formatJstDay } from './lib/format-date';
import { distanceToPolylineKm } from './lib/geo';
import { cumulativeMeters, jstEndOfDayMs, trackPrefix } from './lib/timeline';
import { computeWalkStats } from './lib/walk-stats';
import type { LayerVisibility, OnsenWithId, VisitWithOnsenId } from './types';

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
  const [focusBounds, setFocusBounds] = useState<{
    minLat: number;
    minLng: number;
    maxLat: number;
    maxLng: number;
  } | null>(null);
  const [mapFailed, setMapFailed] = useState(false);
  const [slowLoad, setSlowLoad] = useState(false);
  const viewerCount = usePresence();
  const timeline = useTimeline(walkedDays);

  /*
   * The scrubbed view of the walk. With no cutoff both are the live data
   * unchanged; with one, only the days completed by the cutoff and the visits
   * made by its JST end of day. Everything the visitor SEES derives from
   * these two, while notStarted and the layer availability stay on the
   * unfiltered data, so scrubbing back to the first morning never claims the
   * journey has not started.
   */
  const visibleDays = useMemo(() => {
    const cutoff = timeline.cutoff;
    if (cutoff == null || walkedDays == null) return walkedDays;
    return walkedDays.filter((day) => day.date <= cutoff);
  }, [walkedDays, timeline.cutoff]);

  const visibleVisits = useMemo(() => {
    if (timeline.cutoff == null) return visits;
    const endOfDay = jstEndOfDayMs(timeline.cutoff);
    const filtered = new Map<string, VisitWithOnsenId>();
    for (const [id, visit] of visits) {
      if (visit.visitedAt.toMillis() <= endOfDay) filtered.set(id, visit);
    }
    return filtered;
  }, [visits, timeline.cutoff]);

  /*
   * The day being animated during playback. Playback drives the cutoff
   * through the recorded days in order, so the head day is simply the visible
   * day whose date IS the cutoff; while paused or live there is no head and
   * the map draws every visible day as a plain finished line.
   */
  const headDay = useMemo(() => {
    if (!timeline.playing || timeline.cutoff == null || visibleDays == null) return null;
    return visibleDays.find((day) => day.date === timeline.cutoff) ?? null;
  }, [timeline.playing, timeline.cutoff, visibleDays]);

  // Cumulative distances are keyed on the day object, so the O(points) scan
  // runs once per animated day and every frame pays only the binary search.
  const headCum = useMemo(() => (headDay ? cumulativeMeters(headDay.points) : null), [headDay]);

  const headTrack = useMemo(() => {
    if (headDay == null || headCum == null) return null;
    return trackPrefix(headDay.points, headCum, timeline.headFraction);
  }, [headDay, headCum, timeline.headFraction]);

  // While a head day is animating, the finished lines are everything before
  // it; the head day itself arrives through headTrack, growing.
  const mapWalkedDays = useMemo(() => {
    if (visibleDays == null) return [];
    if (headDay == null) return visibleDays;
    return visibleDays.filter((day) => day !== headDay);
  }, [visibleDays, headDay]);

  const visitedOnsens = useMemo(() => {
    if (!onsens) return [];
    return [...visibleVisits.keys()]
      .map((id) => onsens.get(id))
      .filter((onsen): onsen is OnsenWithId => onsen != null);
  }, [visibleVisits, onsens]);

  /*
   * The challenge's eligible pool, joined against the catalog. It comes from
   * the challenge's own frozen snapshot rather than the live challenge type:
   * completion is counted against the snapshot, so drawing the live pool would
   * put onsens on the map that can be visited and will never move the counter.
   */
  const allChallengeOnsens = useMemo(() => {
    if (!onsens || !challenge) return [];
    return challenge.snapshotEligibleOnsenIds
      .map((id) => onsens.get(id))
      .filter((onsen): onsen is OnsenWithId => onsen != null);
  }, [onsens, challenge]);

  /** The planned route, only once it holds enough points to be a line at all. */
  const plannedPoints = plannedRoute && plannedRoute.points.length >= 2 ? plannedRoute.points : null;

  /**
   * "Planned": eligible, not yet visited, and close to the planned route.
   * Computed client-side; there is deliberately no planned-onsens data model.
   * "Visited" means visited by the scrubbed-to day, so scrubbing before a
   * visit returns that onsen to the planned layer, exactly as it looked then.
   */
  const plannedOnsens = useMemo(() => {
    if (!plannedPoints) return [];
    return allChallengeOnsens.filter(
      (onsen) =>
        !visibleVisits.has(onsen.id) &&
        distanceToPolylineKm({ lat: onsen.lat, lng: onsen.lng }, plannedPoints) <=
          PLANNED_ROUTE_CORRIDOR_KM
    );
  }, [allChallengeOnsens, visibleVisits, plannedPoints]);

  /**
   * Every figure the site quotes, from the header chip to the stats card:
   * computed from the scrubbed view, so the numbers always agree with the map.
   */
  const stats = useMemo(
    () =>
      computeWalkStats({
        walkedDays: visibleDays,
        visits: visibleVisits,
        onsens,
        eligibleOnsenIds: challenge?.snapshotEligibleOnsenIds ?? null,
        completionCount: challengeType?.completionCount ?? null,
        cutoff: timeline.cutoff,
        allRecordedDates: walkedDays?.map((day) => day.date),
      }),
    [visibleDays, visibleVisits, onsens, challenge, challengeType, timeline.cutoff, walkedDays]
  );

  const selectedOnsen = selectedOnsenId ? (onsens?.get(selectedOnsenId) ?? null) : null;
  const selectedVisit = selectedOnsenId ? (visibleVisits.get(selectedOnsenId) ?? null) : null;

  // A visit panel whose visit scrubs out of range closes: the panel narrates a
  // visit the rest of the page now says has not happened yet. A selected onsen
  // that never had a visit (a planned dot) is left alone.
  useEffect(() => {
    if (selectedOnsenId == null) return;
    if (visits.has(selectedOnsenId) && !visibleVisits.has(selectedOnsenId)) {
      setSelectedOnsenId(null);
    }
  }, [selectedOnsenId, visits, visibleVisits]);

  /**
   * Zoom the map to the day the rail's label names. The cutoff may sit on a
   * rest day with no track, so the target is the latest recorded day at or
   * before it, the same day the label's "day N" counts to. The bounds go out
   * as a fresh copy because JourneyMap compares focusBounds by identity:
   * clicking the same label twice should fit the camera twice.
   */
  const handleFocusDay = useCallback(() => {
    if (timeline.cutoff == null || walkedDays == null) return;
    let target: JourneyDayDocument | null = null;
    for (const day of walkedDays) {
      if (day.date <= timeline.cutoff && (target == null || day.date > target.date)) target = day;
    }
    if (target) setFocusBounds({ ...target.bounds });
  }, [timeline.cutoff, walkedDays]);

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
  // Availability judges the unfiltered data on purpose: whether a layer has
  // anything behind it is a fact about the journey, and a toggle that greys
  // out mid-scrub reads as the page breaking.
  const layerAvailability = {
    walked: walkedDays != null && walkedDays.length > 0,
    planned: plannedPoints != null,
    visited: visits.size > 0,
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
          walkedDays={mapWalkedDays}
          ghostDays={walkedDays ?? []}
          headTrack={headTrack}
          follow={timeline.playing}
          focusBounds={focusBounds}
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

        {walkedDays != null && (
          <TimelineRail
            days={walkedDays}
            visits={visits}
            cutoff={timeline.cutoff}
            playing={timeline.playing}
            onCutoffChange={timeline.setCutoff}
            onTogglePlay={timeline.togglePlay}
            onFocusDay={handleFocusDay}
          />
        )}

        {/* Scrubbing is a temporary mode, and this pill is both the reminder
            that the page is showing the past and the one-click way back. */}
        {timeline.cutoff != null && (
          <div className="scrub-pill" role="status">
            viewing {formatJstDay(timeline.cutoff)}
            <button type="button" onClick={() => timeline.setCutoff(null)}>
              back to today
            </button>
          </div>
        )}

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
