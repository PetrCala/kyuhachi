import type { JourneyDayDocument, RouteDocument } from '@kyuhachi/shared';
import maplibregl from 'maplibre-gl';
import type { GeoJSONSource } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import {
  GSI_ATTRIBUTION,
  GSI_HILLSHADE_TILES,
  KYUSHU_BOUNDS,
  MAP_STYLE_URL,
} from '../config';
import { formatJstDay } from '../lib/format-date';
import { MAP_COLORS } from '../lib/map-theme';
import type { LayerVisibility, OnsenWithId } from '../types';

interface Props {
  /** Onsens Petr has visited (already joined against the catalog). */
  visited: OnsenWithId[];
  /** The challenge's whole eligible pool. */
  allOnsens: OnsenWithId[];
  /** Eligible, unvisited onsens near the planned route. */
  plannedOnsens: OnsenWithId[];
  /** One privacy-trimmed track per walked day, oldest first. */
  walkedDays: JourneyDayDocument[];
  plannedRoute: RouteDocument | null;
  layers: LayerVisibility;
  selectedOnsenId: string | null;
  onSelect: (onsenId: string | null) => void;
  /** The style or tiles failed to load, so the map is a blank rectangle. */
  onError?: () => void;
}

const SOURCES = {
  visited: 'visited-onsens',
  allOnsens: 'all-onsens',
  plannedOnsens: 'planned-onsens',
  walked: 'walked-days',
  gaps: 'walked-gaps',
  planned: 'planned-route',
  terrain: 'gsi-hillshade',
} as const;

const LAYERS = {
  visited: 'visited-onsens-circles',
  allOnsens: 'all-onsens-circles',
  plannedOnsens: 'planned-onsens-circles',
  walked: 'walked-days-line',
  gaps: 'walked-gaps-line',
  planned: 'planned-route-line',
  terrain: 'gsi-hillshade-raster',
} as const;

/** Maps each toggle to the map layers it controls. */
const TOGGLE_LAYERS: Record<keyof LayerVisibility, string[]> = {
  visited: [LAYERS.visited],
  allOnsens: [LAYERS.allOnsens],
  plannedOnsens: [LAYERS.plannedOnsens],
  walked: [LAYERS.walked, LAYERS.gaps],
  planned: [LAYERS.planned],
  terrain: [LAYERS.terrain],
};

const EMPTY_COLLECTION: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

function onsenFeatures(onsens: OnsenWithId[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: onsens.map((onsen) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [onsen.lng, onsen.lat] },
      properties: { id: onsen.id, name: onsen.name, area: onsen.areaName },
    })),
  };
}

function formatDayLabel(day: JourneyDayDocument): string {
  const date = formatJstDay(day.date);
  const km = (day.distanceMeters / 1000).toFixed(1);
  // Round to whole minutes before splitting, or a day of 7199 seconds reads
  // "1h 60m": rounding each part on its own lets the minutes reach 60.
  const totalMinutes = Math.round(day.durationSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const duration = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  return `${date} · ${km} km · ${duration}`;
}

function walkedFeatures(days: JourneyDayDocument[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: days
      .filter((day) => day.points.length >= 2)
      .map((day) => ({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: day.points.map((p) => [p.lng, p.lat]),
        },
        properties: { date: day.date, label: formatDayLabel(day) },
      })),
  };
}

/**
 * Dashed connectors between one day's end and the next day's start: the
 * stretches nothing recorded (rest stops, trimmed zones, lost GPS). Styled
 * unmistakably differently from the walked line.
 */
function gapFeatures(days: JourneyDayDocument[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  const walked = days.filter((day) => day.points.length >= 2);
  for (let i = 1; i < walked.length; i++) {
    const prevEnd = walked[i - 1].points[walked[i - 1].points.length - 1];
    const nextStart = walked[i].points[0];
    features.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [prevEnd.lng, prevEnd.lat],
          [nextStart.lng, nextStart.lat],
        ],
      },
      properties: {},
    });
  }
  return { type: 'FeatureCollection', features };
}

function plannedRouteFeatures(route: RouteDocument | null): GeoJSON.FeatureCollection {
  if (!route || route.points.length < 2) return EMPTY_COLLECTION;
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: route.points.map((p) => [p.lng, p.lat]),
        },
        properties: {},
      },
    ],
  };
}

export function JourneyMap({
  visited,
  allOnsens,
  plannedOnsens,
  walkedDays,
  plannedRoute,
  layers,
  selectedOnsenId,
  onSelect,
  onError,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  // Kept in a ref so map event handlers, bound once, always see the latest.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

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
    const clickPopup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: true,
      offset: 14,
      className: 'onsen-hover-popup',
    });

    /*
     * Everything below hangs off 'load'. If the style never arrives, none of it
     * runs and the visitor is left with real numbers in the header above an
     * empty rectangle, so say so instead. Only up to that point, though:
     * MapLibre fires 'error' for any single tile that fails later on, and once
     * the style is up the map is worth looking at, so reporting those would
     * latch a reload banner over a map that is working.
     */
    let styleUp = false;
    map.on('error', () => {
      if (!styleUp) onErrorRef.current?.();
    });

    map.on('load', () => {
      styleUp = true;
      // Bottom to top: terrain shading, then routes, then onsen points.
      map.addSource(SOURCES.terrain, {
        type: 'raster',
        tiles: [GSI_HILLSHADE_TILES],
        tileSize: 256,
        maxzoom: 16,
        attribution: GSI_ATTRIBUTION,
      });
      map.addLayer({
        id: LAYERS.terrain,
        type: 'raster',
        source: SOURCES.terrain,
        layout: { visibility: 'none' },
        paint: { 'raster-opacity': 0.45 },
      });

      map.addSource(SOURCES.planned, { type: 'geojson', data: EMPTY_COLLECTION });
      map.addLayer({
        id: LAYERS.planned,
        type: 'line',
        source: SOURCES.planned,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': MAP_COLORS.planned,
          'line-width': 2.5,
          'line-dasharray': [2.2, 1.6],
        },
      });

      map.addSource(SOURCES.gaps, { type: 'geojson', data: EMPTY_COLLECTION });
      map.addLayer({
        id: LAYERS.gaps,
        type: 'line',
        source: SOURCES.gaps,
        layout: { 'line-cap': 'round' },
        paint: {
          'line-color': MAP_COLORS.gap,
          // 2px, not the 1.4px this used to be: thinner than that the dotted
          // grey all but disappeared against the base map.
          'line-width': 2,
          'line-dasharray': [0.4, 2],
        },
      });

      map.addSource(SOURCES.walked, { type: 'geojson', data: EMPTY_COLLECTION });
      map.addLayer({
        id: LAYERS.walked,
        type: 'line',
        source: SOURCES.walked,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': MAP_COLORS.walked, 'line-width': 3.2 },
      });

      map.addSource(SOURCES.allOnsens, { type: 'geojson', data: EMPTY_COLLECTION });
      map.addLayer({
        id: LAYERS.allOnsens,
        type: 'circle',
        source: SOURCES.allOnsens,
        layout: { visibility: 'none' },
        paint: {
          'circle-radius': 4,
          'circle-color': MAP_COLORS.allOnsen,
          'circle-stroke-width': 1,
          'circle-stroke-color': MAP_COLORS.allOnsenRing,
        },
      });

      map.addSource(SOURCES.plannedOnsens, { type: 'geojson', data: EMPTY_COLLECTION });
      map.addLayer({
        id: LAYERS.plannedOnsens,
        type: 'circle',
        source: SOURCES.plannedOnsens,
        paint: {
          'circle-radius': 5.5,
          'circle-color': MAP_COLORS.plannedOnsenFill,
          'circle-stroke-width': 2,
          'circle-stroke-color': MAP_COLORS.plannedOnsenRing,
        },
      });

      map.addSource(SOURCES.visited, { type: 'geojson', data: EMPTY_COLLECTION });
      map.addLayer({
        id: LAYERS.visited,
        type: 'circle',
        source: SOURCES.visited,
        paint: {
          'circle-radius': 8,
          'circle-color': MAP_COLORS.visited,
          'circle-stroke-width': 2,
          'circle-stroke-color': MAP_COLORS.visitedRing,
        },
      });

      const pointLayers = [LAYERS.visited, LAYERS.plannedOnsens, LAYERS.allOnsens];

      map.on('click', (e) => {
        const points = map.queryRenderedFeatures(e.point, { layers: pointLayers });
        const point = points[0];
        if (point?.properties?.id) {
          if (point.layer.id === LAYERS.visited) {
            onSelectRef.current(String(point.properties.id));
          } else {
            // Not visited yet: no detail panel, just say which onsen this is.
            onSelectRef.current(null);
            clickPopup
              .setLngLat(e.lngLat)
              .setText(`${point.properties.name} (${point.properties.area})`)
              .addTo(map);
          }
          return;
        }
        const lines = map.queryRenderedFeatures(e.point, { layers: [LAYERS.walked] });
        if (lines[0]?.properties?.label) {
          onSelectRef.current(null);
          clickPopup.setLngLat(e.lngLat).setText(String(lines[0].properties.label)).addTo(map);
          return;
        }
        onSelectRef.current(null);
      });

      for (const layerId of pointLayers) {
        map.on('mousemove', layerId, (e) => {
          map.getCanvas().style.cursor = 'pointer';
          const feature = e.features?.[0];
          if (!feature || feature.geometry.type !== 'Point') return;
          hoverPopup
            .setLngLat(feature.geometry.coordinates as [number, number])
            .setText(String(feature.properties?.name ?? ''))
            .addTo(map);
        });
        map.on('mouseleave', layerId, () => {
          map.getCanvas().style.cursor = '';
          hoverPopup.remove();
        });
      }

      setMapReady(true);
    });

    return () => {
      setMapReady(false);
      mapRef.current = null;
      map.remove();
    };
  }, []);

  // Data updates, each source on its own dependency.
  useEffect(() => {
    if (!mapReady) return;
    mapRef.current?.getSource<GeoJSONSource>(SOURCES.visited)?.setData(onsenFeatures(visited));
  }, [visited, mapReady]);

  useEffect(() => {
    if (!mapReady) return;
    mapRef.current?.getSource<GeoJSONSource>(SOURCES.allOnsens)?.setData(onsenFeatures(allOnsens));
  }, [allOnsens, mapReady]);

  useEffect(() => {
    if (!mapReady) return;
    mapRef.current
      ?.getSource<GeoJSONSource>(SOURCES.plannedOnsens)
      ?.setData(onsenFeatures(plannedOnsens));
  }, [plannedOnsens, mapReady]);

  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    map?.getSource<GeoJSONSource>(SOURCES.walked)?.setData(walkedFeatures(walkedDays));
    map?.getSource<GeoJSONSource>(SOURCES.gaps)?.setData(gapFeatures(walkedDays));
  }, [walkedDays, mapReady]);

  useEffect(() => {
    if (!mapReady) return;
    mapRef.current
      ?.getSource<GeoJSONSource>(SOURCES.planned)
      ?.setData(plannedRouteFeatures(plannedRoute));
  }, [plannedRoute, mapReady]);

  // Toggle visibility.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    for (const [toggle, layerIds] of Object.entries(TOGGLE_LAYERS)) {
      const visible = layers[toggle as keyof LayerVisibility];
      for (const layerId of layerIds) {
        map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
      }
    }
  }, [layers, mapReady]);

  // Selection highlight.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.setPaintProperty(LAYERS.visited, 'circle-radius', [
      'case',
      ['==', ['get', 'id'], selectedOnsenId ?? ''],
      11,
      8,
    ]);
    map.setPaintProperty(LAYERS.visited, 'circle-stroke-color', [
      'case',
      ['==', ['get', 'id'], selectedOnsenId ?? ''],
      MAP_COLORS.visitedRingSelected,
      MAP_COLORS.visitedRing,
    ]);
  }, [selectedOnsenId, mapReady]);

  return (
    <div
      ref={containerRef}
      className="map-container"
      role="region"
      aria-label="Map of Kyushu showing the route walked so far, the planned route ahead, and the onsens visited"
    />
  );
}
