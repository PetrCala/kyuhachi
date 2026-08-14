import type {
  CrowdLevel,
  PerceivedHeat,
  TransportMode,
  VisitStructuredData,
  VisitedWith,
} from '@kyuhachi/shared';
import { useEffect, useState } from 'react';
import type { OnsenWithId, VisitWithOnsenId } from '../types';

interface Props {
  onsen: OnsenWithId;
  visit: VisitWithOnsenId;
  onClose: () => void;
}

const TRANSPORT_LABELS: Record<TransportMode, string> = {
  foot: 'On foot',
  bicycle: 'Bicycle',
  public: 'Public transport',
  car: 'Car',
};

const HEAT_LABELS: Record<PerceivedHeat, string> = {
  tooCool: 'Too cool',
  pleasant: 'Pleasant',
  hot: 'Hot',
  veryHot: 'Very hot',
};

const CROWD_LABELS: Record<CrowdLevel, string> = {
  empty: 'Empty',
  quiet: 'Quiet',
  moderate: 'Moderate',
  busy: 'Busy',
  crowded: 'Crowded',
};

const VISITED_WITH_LABELS: Record<VisitedWith, string> = {
  alone: 'Alone',
  friend: 'With a friend',
  group: 'With a group',
  family: 'With family',
  partner: 'With partner',
  other: 'In company',
};

function yesNo(value: boolean): string {
  return value ? 'Yes' : 'No';
}

interface Row {
  label: string;
  value: string;
}

/** Everything worth showing from the structured data, nulls skipped. */
function factRows(data: VisitStructuredData): Row[] {
  const rows: Row[] = [];
  if (data.transportMode)
    rows.push({ label: 'Got there', value: TRANSPORT_LABELS[data.transportMode] });
  if (data.duration != null) rows.push({ label: 'Stayed', value: `${data.duration} min` });
  if (data.perceivedHeat)
    rows.push({ label: 'Water felt', value: HEAT_LABELS[data.perceivedHeat] });
  if (data.waterTemp != null) rows.push({ label: 'Water temp', value: data.waterTemp });
  if (data.crowdLevel) rows.push({ label: 'Crowd', value: CROWD_LABELS[data.crowdLevel] });
  if (data.visitedWith)
    rows.push({ label: 'Company', value: VISITED_WITH_LABELS[data.visitedWith] });
  if (data.saunaUsed != null) rows.push({ label: 'Sauna', value: yesNo(data.saunaUsed) });
  if (data.restAreaUsed != null)
    rows.push({ label: 'Rest area', value: yesNo(data.restAreaUsed) });
  if (data.foodUsed != null) rows.push({ label: 'Ate there', value: yesNo(data.foodUsed) });
  if (data.hadSoap != null) rows.push({ label: 'Soap provided', value: yesNo(data.hadSoap) });
  if (data.massageChairAvailable != null)
    rows.push({ label: 'Massage chair', value: yesNo(data.massageChairAvailable) });
  if (data.interactedWithLocals != null)
    rows.push({ label: 'Met locals', value: yesNo(data.interactedWithLocals) });
  return rows;
}

/** All the 1-10 sub-ratings that were reported. */
function ratingRows(data: VisitStructuredData): Row[] {
  const candidates: [string, number | null][] = [
    ['Cleanliness', data.cleanlinessRating],
    ['Atmosphere', data.atmosphereRating],
    ['Uniqueness', data.uniquenessRating],
    ['Cool-down', data.coolDownRating],
    ['Smell intensity', data.smellIntensityRating],
    ['Value', data.valueRating],
    ['Sauna', data.saunaRating],
    ['Rest area', data.restAreaRating],
    ['Food', data.foodRating],
    ['Local encounter', data.localInteractionRating],
  ];
  return candidates
    .filter((entry): entry is [string, number] => entry[1] != null)
    .map(([label, value]) => ({ label, value: `${value}/10` }));
}

function formatVisitDate(visit: VisitWithOnsenId): string {
  return visit.visitedAt.toDate().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function VisitPanel({ onsen, visit, onClose }: Props) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const { structuredData } = visit;
  const facts = factRows(structuredData);
  const ratings = ratingRows(structuredData);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (lightboxUrl) setLightboxUrl(null);
      else onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightboxUrl, onClose]);

  return (
    <aside className="visit-panel">
      <button type="button" className="panel-close" onClick={onClose} aria-label="Close">
        ×
      </button>

      <header className="panel-header">
        <h2 className="onsen-name">{onsen.name}</h2>
        {onsen.nameRomaji && <p className="onsen-romaji">{onsen.nameRomaji}</p>}
        <p className="onsen-area">{onsen.areaName}</p>
      </header>

      <div className="visit-meta">
        <span className="meta-chip meta-date">{formatVisitDate(visit)}</span>
        {structuredData.rating != null && (
          <span className="meta-chip meta-rating">{structuredData.rating}/10</span>
        )}
        {structuredData.wouldReturn === true && (
          <span className="meta-chip meta-return">Would return</span>
        )}
      </div>

      {visit.photoUrls.length > 0 && (
        <div className="photo-grid">
          {visit.photoUrls.map((url) => (
            <button
              key={url}
              type="button"
              className="photo-thumb"
              onClick={() => setLightboxUrl(url)}
            >
              <img src={url} alt={`${onsen.name} photo`} loading="lazy" />
            </button>
          ))}
        </div>
      )}

      {visit.notes && <p className="visit-notes">{visit.notes}</p>}

      {facts.length > 0 && (
        <section className="panel-section">
          <h3>The visit</h3>
          <dl className="row-list">
            {facts.map((row) => (
              <div key={row.label} className="row">
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {ratings.length > 0 && (
        <section className="panel-section">
          <h3>Ratings</h3>
          <dl className="row-list">
            {ratings.map((row) => (
              <div key={row.label} className="row">
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {lightboxUrl && (
        <div className="lightbox" onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} alt={`${onsen.name} photo, enlarged`} />
        </div>
      )}
    </aside>
  );
}
