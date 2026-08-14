import { useMemo, useState } from 'react';
import { JourneyMap } from './components/JourneyMap';
import { VisitPanel } from './components/VisitPanel';
import { useChallengeType } from './hooks/useChallengeType';
import { useJourneyChallenge } from './hooks/useJourneyChallenge';
import { useOnsens } from './hooks/useOnsens';
import { useVisits } from './hooks/useVisits';
import type { OnsenWithId } from './types';

export default function App() {
  const { challenge, loading: challengeLoading, error } = useJourneyChallenge();
  const onsens = useOnsens();
  const visits = useVisits(challenge?.id ?? null);
  const challengeType = useChallengeType(challenge?.typeId ?? null);
  const [selectedOnsenId, setSelectedOnsenId] = useState<string | null>(null);

  const visitedOnsens = useMemo(() => {
    if (!onsens) return [];
    return [...visits.keys()]
      .map((id) => onsens.get(id))
      .filter((onsen): onsen is OnsenWithId => onsen != null);
  }, [visits, onsens]);

  const eligibleVisitCount = useMemo(() => {
    if (!challenge) return 0;
    const pool = new Set(challenge.snapshotEligibleOnsenIds);
    return [...visits.keys()].filter((id) => pool.has(id)).length;
  }, [visits, challenge]);

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
        {challengeType && (
          <div className="progress-chip" title="Unique eligible onsens visited">
            {eligibleVisitCount} / {challengeType.completionCount} onsens
          </div>
        )}
      </header>

      <main className="map-wrap">
        <JourneyMap
          visited={visitedOnsens}
          selectedOnsenId={selectedOnsenId}
          onSelect={setSelectedOnsenId}
        />

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
