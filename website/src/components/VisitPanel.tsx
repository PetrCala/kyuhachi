import type {
  CrowdLevel,
  PerceivedHeat,
  TransportMode,
  VisitStructuredData,
  VisitedWith,
} from '@kyuhachi/shared';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { formatJstTimestamp } from '../lib/format-date';
import type { OnsenWithId, VisitWithOnsenId } from '../types';

interface Props {
  onsen: OnsenWithId;
  visit: VisitWithOnsenId;
  onClose: () => void;
}

/* Wording follows app/src/i18n/en.ts: the same visit, described the same way in
   both places. The yes/no rows keep the app's question form because several of
   them share a name with a rating row below ("Sauna: Yes" next to "Sauna: 7/10"
   tells the reader nothing about which is which). */

const TRANSPORT_LABELS: Record<TransportMode, string> = {
  foot: 'On foot',
  bicycle: 'Bicycle',
  public: 'Public transit',
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
  other: 'With someone else',
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
    rows.push({ label: 'How hot it felt', value: HEAT_LABELS[data.perceivedHeat] });
  if (data.waterTemp != null) rows.push({ label: 'Water temp', value: data.waterTemp });
  if (data.crowdLevel)
    rows.push({ label: 'How busy was it?', value: CROWD_LABELS[data.crowdLevel] });
  if (data.visitedWith)
    rows.push({ label: 'Visited with', value: VISITED_WITH_LABELS[data.visitedWith] });
  if (data.saunaUsed != null) rows.push({ label: 'Used the sauna?', value: yesNo(data.saunaUsed) });
  if (data.restAreaUsed != null)
    rows.push({ label: 'Used the rest area?', value: yesNo(data.restAreaUsed) });
  if (data.foodUsed != null) rows.push({ label: 'Used food service?', value: yesNo(data.foodUsed) });
  if (data.hadSoap != null) rows.push({ label: 'Soap provided?', value: yesNo(data.hadSoap) });
  if (data.massageChairAvailable != null)
    rows.push({ label: 'Massage chair?', value: yesNo(data.massageChairAvailable) });
  if (data.interactedWithLocals != null)
    rows.push({ label: 'Talked with locals?', value: yesNo(data.interactedWithLocals) });
  return rows;
}

/** All the 1-10 sub-ratings that were reported. */
function ratingRows(data: VisitStructuredData): Row[] {
  const candidates: [string, number | null][] = [
    ['Cleanliness', data.cleanlinessRating],
    ['Atmosphere', data.atmosphereRating],
    ['Uniqueness', data.uniquenessRating],
    ['Ease of cooling down', data.coolDownRating],
    ['Smell intensity', data.smellIntensityRating],
    ['Value for money', data.valueRating],
    ['Sauna', data.saunaRating],
    ['Rest area', data.restAreaRating],
    ['Food', data.foodRating],
    ['Interaction', data.localInteractionRating],
  ];
  return candidates
    .filter((entry): entry is [string, number] => entry[1] != null)
    .map(([label, value]) => ({ label, value: `${value}/10` }));
}

export function VisitPanel({ onsen, visit, onClose }: Props) {
  const [lightbox, setLightbox] = useState<{ url: string; index: number } | null>(null);
  const [brokenPhotos, setBrokenPhotos] = useState<string[]>([]);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [stripScrolls, setStripScrolls] = useState(false);

  const panelRef = useRef<HTMLElement>(null);
  const lightboxRef = useRef<HTMLDivElement>(null);
  const lightboxOpenerRef = useRef<HTMLButtonElement | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  const { structuredData } = visit;
  const facts = factRows(structuredData);
  const ratings = ratingRows(structuredData);

  // A Storage download token can be rotated out from under an old photo url.
  // The cell has a fixed aspect ratio, so a dead url would hold open a
  // full-size broken-image glyph until someone re-uploads.
  const photos = visit.photoUrls.filter((url) => !brokenPhotos.includes(url));

  // Latin name where there is one: this is read out in an English document.
  const spokenName = onsen.nameRomaji || onsen.name;
  const photoAlt = (index: number) =>
    photos.length > 1
      ? `${spokenName} photo ${index + 1} of ${photos.length}`
      : `${spokenName} photo`;

  const hasWriteUp =
    facts.length > 0 ||
    ratings.length > 0 ||
    Boolean(visit.notes) ||
    visit.photoUrls.length > 0 ||
    structuredData.rating != null ||
    structuredData.wouldReturn === true;

  // The panel stays mounted across selections, so per-visit state has to be
  // cleared by hand when the onsen under it changes. The strip is the same DOM
  // element throughout, so its scroll offset survives the swap too and would
  // open the next visit part-way through its photos.
  useEffect(() => {
    setLightbox(null);
    setBrokenPhotos([]);
    setPhotoIndex(0);
    stripRef.current?.scrollTo({ left: 0 });
  }, [onsen.id]);

  // Focus arrived from a map marker; hand it back when the panel goes away, or
  // a keyboard reader is dropped at the top of the document instead.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  // A new selection swaps the contents in place rather than remounting, which a
  // screen reader has no way of noticing on its own.
  useEffect(() => {
    panelRef.current?.focus();
  }, [onsen.id]);

  const closeLightbox = useCallback(() => {
    setLightbox(null);
    const opener = lightboxOpenerRef.current;
    lightboxOpenerRef.current = null;
    if (opener?.isConnected) opener.focus();
  }, []);

  useEffect(() => {
    if (lightbox) lightboxRef.current?.focus();
  }, [lightbox]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (lightbox) closeLightbox();
      else onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightbox, closeLightbox, onClose]);

  // The counter belongs to the narrow layout, where the photos are a snap strip
  // with no scrollbar. Asking the element whether it overflows keeps that in
  // step with the stylesheet without repeating its breakpoint here.
  useLayoutEffect(() => {
    const strip = stripRef.current;
    if (!strip) {
      setStripScrolls(false);
      return;
    }
    const measure = () => setStripScrolls(strip.scrollWidth > strip.clientWidth + 1);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [photos.length]);

  const onStripScroll = () => {
    const strip = stripRef.current;
    if (!strip) return;
    const stripLeft = strip.getBoundingClientRect().left;
    let nearest = 0;
    let smallestGap = Number.POSITIVE_INFINITY;
    for (let i = 0; i < strip.children.length; i++) {
      const gap = Math.abs(strip.children[i].getBoundingClientRect().left - stripLeft);
      if (gap < smallestGap) {
        smallestGap = gap;
        nearest = i;
      }
    }
    setPhotoIndex(nearest);
  };

  return (
    <aside className="visit-panel" ref={panelRef} tabIndex={-1} aria-label={spokenName}>
      <button type="button" className="panel-close" onClick={onClose} aria-label="Close">
        ×
      </button>

      <div className="visit-panel-scroll">
        <header className="panel-header">
          <h2 className="onsen-name" lang="ja">
            {onsen.name}
          </h2>
          {onsen.nameRomaji && <p className="onsen-romaji">{onsen.nameRomaji}</p>}
          <p className="onsen-area" lang="ja">
            {onsen.areaName}
          </p>
        </header>

        <div className="visit-meta">
          <span className="meta-chip meta-date">
            {formatJstTimestamp(visit.visitedAt.toDate())}
          </span>
          {structuredData.rating != null && (
            <span className="meta-chip meta-rating">{structuredData.rating}/10</span>
          )}
          {structuredData.wouldReturn === true && (
            <span className="meta-chip meta-return">Would return</span>
          )}
        </div>

        {photos.length > 0 && (
          <>
            <div className="photo-grid" ref={stripRef} onScroll={onStripScroll}>
              {photos.map((url, i) => (
                <button
                  key={url}
                  type="button"
                  className="photo-thumb"
                  onClick={(e) => {
                    lightboxOpenerRef.current = e.currentTarget;
                    setLightbox({ url, index: i });
                  }}
                >
                  <img
                    src={url}
                    alt={photoAlt(i)}
                    loading="lazy"
                    onError={() =>
                      setBrokenPhotos((prev) => (prev.includes(url) ? prev : [...prev, url]))
                    }
                  />
                </button>
              ))}
            </div>
            {photos.length > 1 && stripScrolls && (
              /* The alt text already carries "photo 2 of 5", so this is for the
                 eye only: without it five photos look like one. */
              <p className="photo-count" aria-hidden="true">
                {Math.min(photoIndex, photos.length - 1) + 1} / {photos.length}
              </p>
            )}
          </>
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

        {!hasWriteUp && (
          <p className="visit-panel-empty">Petr has not written this visit up yet.</p>
        )}

        {lightbox && (
          <div
            className="lightbox"
            ref={lightboxRef}
            role="dialog"
            aria-modal="true"
            aria-label={`${spokenName} photo`}
            tabIndex={-1}
            onClick={closeLightbox}
          >
            {/* A zoom-out cursor is the only way out on a desktop, and touch has
                no cursor to show it. */}
            <button
              type="button"
              className="lightbox-close"
              aria-label="Close photo"
              onClick={(e) => {
                e.stopPropagation();
                closeLightbox();
              }}
            >
              ×
            </button>
            <img src={lightbox.url} alt={`${photoAlt(lightbox.index)}, enlarged`} />
          </div>
        )}
      </div>
    </aside>
  );
}
