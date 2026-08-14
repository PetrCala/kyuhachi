import { useState } from 'react';
import { PLANNED_ROUTE_CORRIDOR_KM } from '../config';
import type { LayerVisibility } from '../types';

interface Props {
  layers: LayerVisibility;
  onChange: (layers: LayerVisibility) => void;
}

interface RowDef {
  key: keyof LayerVisibility;
  label: string;
  caption?: string;
  swatch: string;
}

const ROWS: RowDef[] = [
  { key: 'walked', label: 'Walked route', caption: 'dotted = not recorded', swatch: 'swatch-walked' },
  { key: 'planned', label: 'Planned route', swatch: 'swatch-planned' },
  { key: 'visited', label: 'Visited onsens', swatch: 'swatch-visited' },
  {
    key: 'plannedOnsens',
    label: 'Planned onsens',
    caption: `within ${PLANNED_ROUTE_CORRIDOR_KM} km of the planned route`,
    swatch: 'swatch-planned-onsen',
  },
  { key: 'allOnsens', label: 'All challenge onsens', swatch: 'swatch-all-onsen' },
  { key: 'terrain', label: 'Terrain (GSI)', swatch: 'swatch-terrain' },
];

/** The side card that toggles map layers and doubles as the legend. */
export function LayerPanel({ layers, onChange }: Props) {
  // Collapsed by default where screen space is scarce.
  const [open, setOpen] = useState(() => !window.matchMedia('(max-width: 560px)').matches);

  return (
    <div className="layer-panel">
      <button type="button" className="layer-panel-header" onClick={() => setOpen(!open)}>
        Layers
        <span className="layer-panel-chevron">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="layer-rows">
          {ROWS.map((row) => (
            <label key={row.key} className="layer-row">
              <input
                type="checkbox"
                checked={layers[row.key]}
                onChange={(e) => onChange({ ...layers, [row.key]: e.target.checked })}
              />
              <span className={`layer-swatch ${row.swatch}`} aria-hidden="true" />
              <span className="layer-label">
                {row.label}
                {row.caption && <span className="layer-caption">{row.caption}</span>}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
