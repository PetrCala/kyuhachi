import maplibregl from 'maplibre-gl';
import type { GeoJSONSource } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { KYUSHU_BOUNDS, MAP_STYLE_URL } from '../config';
import type { OnsenWithId } from '../types';

interface Props {
  /** Onsens Petr has visited (already joined against the catalog). */
  visited: OnsenWithId[];
  selectedOnsenId: string | null;
  onSelect: (onsenId: string | null) => void;
}

const VISITED_SOURCE = 'visited-onsens';
const VISITED_LAYER = 'visited-onsens-circles';

const EMPTY_COLLECTION: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

function toFeatureCollection(visited: OnsenWithId[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: visited.map((onsen) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [onsen.lng, onsen.lat] },
      properties: { id: onsen.id, name: onsen.name },
    })),
  };
}

export function JourneyMap({ visited, selectedOnsenId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  // Kept in a ref so map event handlers, bound once, always see the latest.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      bounds: KYUSHU_BOUNDS,
      fitBoundsOptions: { padding: 32 },
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');

    const hoverPopup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 14,
      className: 'onsen-hover-popup',
    });

    map.on('load', () => {
      map.addSource(VISITED_SOURCE, { type: 'geojson', data: EMPTY_COLLECTION });
      map.addLayer({
        id: VISITED_LAYER,
        type: 'circle',
        source: VISITED_SOURCE,
        paint: {
          'circle-radius': 8,
          'circle-color': '#c2413b',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      });

      map.on('click', (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: [VISITED_LAYER] });
        const id = features[0]?.properties?.id;
        onSelectRef.current(typeof id === 'string' ? id : null);
      });
      map.on('mousemove', VISITED_LAYER, (e) => {
        map.getCanvas().style.cursor = 'pointer';
        const feature = e.features?.[0];
        if (!feature || feature.geometry.type !== 'Point') return;
        hoverPopup
          .setLngLat(feature.geometry.coordinates as [number, number])
          .setText(String(feature.properties?.name ?? ''))
          .addTo(map);
      });
      map.on('mouseleave', VISITED_LAYER, () => {
        map.getCanvas().style.cursor = '';
        hoverPopup.remove();
      });

      setMapReady(true);
    });

    return () => {
      setMapReady(false);
      mapRef.current = null;
      map.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource<GeoJSONSource>(VISITED_SOURCE);
    source?.setData(toFeatureCollection(visited));
  }, [visited, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.setPaintProperty(VISITED_LAYER, 'circle-radius', [
      'case',
      ['==', ['get', 'id'], selectedOnsenId ?? ''],
      11,
      8,
    ]);
    map.setPaintProperty(VISITED_LAYER, 'circle-stroke-color', [
      'case',
      ['==', ['get', 'id'], selectedOnsenId ?? ''],
      '#8f2b26',
      '#ffffff',
    ]);
  }, [selectedOnsenId, mapReady]);

  return <div ref={containerRef} className="map-container" />;
}
