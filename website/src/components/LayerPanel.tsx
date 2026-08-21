import { Fragment, useState } from 'react';
import { PLANNED_ROUTE_CORRIDOR_KM } from '../config';
import type { LayerVisibility } from '../types';

interface Props {
  layers: LayerVisibility;
  onChange: (layers: LayerVisibility) => void;
  /** Layers with nothing to draw. A key that is absent counts as available. */
  available: Partial<Record<keyof LayerVisibility, boolean>>;
}

interface RowDef {
  key: keyof LayerVisibility;
  label: string;
  caption?: string;
  swatch: string;
}

const ROWS: RowDef[] = [
  { key: 'walked', label: 'Walked route', swatch: 'swatch-walked' },
  { key: 'planned', label: 'Planned route', swatch: 'swatch-planned' },
  { key: 'visited', label: 'Visited onsens', swatch: 'swatch-visited' },
  {
    key: 'plannedOnsens',
    label: 'Planned onsens',
    caption: `not yet visited, within ${PLANNED_ROUTE_CORRIDOR_KM} km of the route`,
    swatch: 'swatch-planned-onsen',
  },
  {
    key: 'allOnsens',
    label: 'All eligible onsens',
    caption: 'any 88 of these complete it',
    swatch: 'swatch-all-onsen',
  },
  { key: 'terrain', label: 'Terrain shading', swatch: 'swatch-terrain' },
];

/** The side card that toggles map layers and doubles as the legend. */
export function LayerPanel({ layers, onChange, available }: Props) {
  // Open by default: on a first visit this card is the only key to the map, and
  // a collapsed one leaves every line and dot unexplained.
  const [open, setOpen] = useState(true);

  return (
    <div className="layer-panel">
      <button
        type="button"
        className="layer-panel-header"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        Layers
        <span className="layer-panel-chevron" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && (
        <div className="layer-rows">
          {ROWS.map((row) => {
            const hasData = available[row.key] !== false;
            return (
              <Fragment key={row.key}>
                <label className={`layer-row${hasData ? '' : ' layer-row-empty'}`}>
                  <input
                    type="checkbox"
                    checked={layers[row.key]}
                    disabled={!hasData}
                    onChange={(e) => onChange({ ...layers, [row.key]: e.target.checked })}
                  />
                  <span className={`layer-swatch ${row.swatch}`} aria-hidden="true" />
                  <span className="layer-label">
                    {row.label}
                    {row.caption && <span className="layer-caption">{row.caption}</span>}
                  </span>
                </label>
                {row.key === 'walked' && (
                  /*
                   * The grey connector is drawn by its own map layer, so it needs
                   * its own swatch. No checkbox: the walked toggle already hides
                   * both layers together.
                   */
                  <div className="layer-row layer-row-sub">
                    <span className="layer-swatch swatch-gap" aria-hidden="true" />
                    <span className="layer-label">
                      Not recorded
                      <span className="layer-caption">straight line between days</span>
                    </span>
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
