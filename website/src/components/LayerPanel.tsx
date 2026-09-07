import { Fragment } from 'react';
import { PLANNED_ROUTE_CORRIDOR_KM } from '../config';
import type { LayerVisibility } from '../types';

interface Props {
  layers: LayerVisibility;
  onChange: (layers: LayerVisibility) => void;
  /** Layers with nothing to draw. A key that is absent counts as available. */
  available: Partial<Record<keyof LayerVisibility, boolean>>;
  /**
   * Owned by App, not by this card: on a phone only one of the two map cards
   * may be open at a time, and neither can enforce that from inside itself.
   */
  open: boolean;
  onToggle: () => void;
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
export function LayerPanel({ layers, onChange, available, open, onToggle }: Props) {
  return (
    <div className={`map-panel layer-panel${open ? ' map-panel-open' : ''}`}>
      <button type="button" className="panel-toggle" aria-expanded={open} onClick={onToggle}>
        Layers
        <span className="panel-chevron" aria-hidden="true">
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
