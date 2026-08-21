import { formatJstDay } from '../lib/format-date';
import type { WalkStats } from '../lib/walk-stats';

interface Row {
  label: string;
  value: string;
  /** Small print under the label, for a figure that needs a caveat. */
  note?: string;
}

/** One decimal below 10 km, matching how a day's distance prints on the map. */
function formatKm(km: number): string {
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

/** "19 of 88" when the denominator is known, bare count when it is not. */
function formatOf(value: number, total: number | null): string {
  return total != null ? `${value} of ${total}` : String(value);
}

/**
 * What "142 h" covers. The two track sources disagree (Strava reports moving
 * time, an imported GPX reports elapsed), so the note stops short of promising
 * either, and says how many days the figure even spans when some carry no
 * timestamps at all.
 */
function timeNote(stats: WalkStats): string {
  const parts = ['as the tracker recorded it'];
  if (stats.hoursPartial) {
    parts.push(`over ${stats.hoursPartial.counted} of ${stats.hoursPartial.total} days`);
  }
  return parts.join(', ');
}

function StatRow({ row }: { row: Row }) {
  return (
    <div className="row">
      <dt>
        {row.label}
        {row.note && <span className="stats-note">{row.note}</span>}
      </dt>
      <dd>{row.value}</dd>
    </div>
  );
}

/** The small card under the layer panel: how far he has walked, how far he has got. */
export function StatsPanel({ stats }: { stats: WalkStats }) {
  const walkRows: Row[] = [];
  if (stats.km != null) walkRows.push({ label: 'Walked so far', value: formatKm(stats.km) });
  if (stats.days != null) walkRows.push({ label: 'Days walked', value: String(stats.days) });
  if (stats.longestDayKm != null) {
    walkRows.push({ label: 'Longest day', value: formatKm(stats.longestDayKm) });
  }
  if (stats.hours != null) {
    walkRows.push({
      label: 'Time on the trail',
      value: `${Math.round(stats.hours)} h`,
      note: timeNote(stats),
    });
  }

  const progressRows: Row[] = [];
  if (stats.onsensVisited != null) {
    progressRows.push({
      label: 'Onsens visited',
      value: formatOf(stats.onsensVisited, stats.onsensTarget),
    });
  }
  if (stats.prefectures != null) {
    progressRows.push({
      label: 'Prefectures',
      value: formatOf(stats.prefectures, stats.prefecturesTotal),
    });
  }
  if (stats.lastRecordedDay != null) {
    // The freshness signal: it answers "is he still going" without the site
    // having to claim anything live.
    progressRows.push({ label: 'Last recorded day', value: formatJstDay(stats.lastRecordedDay) });
  }
  if (stats.dayOfWalk != null) {
    // The scrubbed stand-in for the row above (the two are mutually
    // exclusive): where the viewed day sits within the walk so far.
    progressRows.push({
      label: 'Day of the walk',
      value: `${stats.dayOfWalk.n} of ${stats.dayOfWalk.total}`,
    });
  }

  // Nothing computed yet, so the card would be an empty box on the map.
  if (walkRows.length === 0 && progressRows.length === 0) return null;

  return (
    <section className="stats-panel" aria-label="The walk so far">
      {walkRows.length > 0 && (
        <dl className="row-list">
          {walkRows.map((row) => (
            <StatRow key={row.label} row={row} />
          ))}
        </dl>
      )}
      {/* The rule separates what the walking has cost from where it has got to. */}
      {walkRows.length > 0 && progressRows.length > 0 && <hr className="stats-rule" />}
      {progressRows.length > 0 && (
        <dl className="row-list">
          {progressRows.map((row) => (
            <StatRow key={row.label} row={row} />
          ))}
        </dl>
      )}
    </section>
  );
}
