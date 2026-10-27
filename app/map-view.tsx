"use client";

import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MapLibre } from "maplibre-gl";
import { useEffect, useRef } from "react";
import type { RefObject } from "react";

import type { Point } from "@/lib/geo";
import type { Ranked } from "@/lib/rank";
import { pavingLines } from "@/lib/verdict";

const WORKER = "/maplibre-gl-worker.mjs";

const STYLES = {
  dark: "https://tiles.openfreemap.org/styles/dark",
  light: "https://tiles.openfreemap.org/styles/positron",
};

const GRADE_COLORS = {
  dark: ["#474747", "#1fae5b", "#f5a300", "#ff4d2e"],
  light: ["#d4d4d4", "#1fae5b", "#f5a300", "#ff4d2e"],
};

const roadsData = (ranked: Ranked[]): GeoJSON.FeatureCollection => ({
  features: ranked.map(({ road }, index) => ({
    geometry: { coordinates: road.line, type: "LineString" },
    properties: { id: road.id, rank: index },
    type: "Feature",
  })),
  type: "FeatureCollection",
});

const selectedData = (selected: Ranked | null): GeoJSON.FeatureCollection => ({
  features: selected
    ? pavingLines(selected.road).map(({ grade, line }) => ({
        geometry: { coordinates: line, type: "LineString" },
        properties: { grade },
        type: "Feature",
      }))
    : [],
  type: "FeatureCollection",
});

const pointData = (point: Point | null): GeoJSON.FeatureCollection => ({
  features: point
    ? [
        {
          geometry: { coordinates: point, type: "Point" },
          properties: {},
          type: "Feature",
        },
      ]
    : [],
  type: "FeatureCollection",
});

const addLayers = (map: MapLibre, dark: boolean) => {
  const ink = dark ? "#f2f2f2" : "#0a0a0a";
  const paper = dark ? "#0b0b0b" : "#ffffff";
  const grades = dark ? GRADE_COLORS.dark : GRADE_COLORS.light;
  map.addSource("roads", { data: roadsData([]), type: "geojson" });
  map.addSource("selected", { data: selectedData(null), type: "geojson" });
  map.addSource("origin", { data: pointData(null), type: "geojson" });
  map.addLayer({
    id: "roads-casing",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": paper,
      "line-width": ["case", ["<", ["get", "rank"], 10], 8, 5],
    },
    source: "roads",
    type: "line",
  });
  map.addLayer({
    id: "roads-line",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ink,
      "line-opacity": ["case", ["<", ["get", "rank"], 10], 1, 0.75],
      "line-width": ["case", ["<", ["get", "rank"], 10], 4, 2.5],
    },
    source: "roads",
    type: "line",
  });
  map.addLayer({
    id: "selected-casing",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": ink, "line-width": 11 },
    source: "selected",
    type: "line",
  });
  map.addLayer({
    id: "selected-line",
    layout: { "line-cap": "butt", "line-join": "round" },
    paint: {
      "line-color": [
        "match",
        ["get", "grade"],
        1,
        grades[1] ?? ink,
        2,
        grades[2] ?? ink,
        3,
        grades[3] ?? ink,
        grades[0] ?? ink,
      ],
      "line-width": 6,
    },
    source: "selected",
    type: "line",
  });
  map.addLayer({
    id: "origin-dot",
    paint: {
      "circle-color": "#ffe94d",
      "circle-radius": 8,
      "circle-stroke-color": ink,
      "circle-stroke-width": 3,
    },
    source: "origin",
    type: "circle",
  });
};

interface Latest {
  onMove: (center: Point) => void;
  onSelect: (id: string) => void;
  origin: Point | null;
  ranked: Ranked[];
  selected: Ranked | null;
}

const syncData = (instance: MapLibre, latest: Latest) => {
  void instance
    .getSource<GeoJSONSource>("roads")
    ?.setData(roadsData(latest.ranked));
  void instance
    .getSource<GeoJSONSource>("selected")
    ?.setData(selectedData(latest.selected));
  void instance
    .getSource<GeoJSONSource>("origin")
    ?.setData(pointData(latest.origin));
};

const createMap = (
  element: HTMLDivElement,
  latest: RefObject<Latest>,
  ready: RefObject<boolean>
) => {
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  maplibregl.setWorkerUrl(WORKER);

  const instance = new maplibregl.Map({
    attributionControl: { compact: true },
    center: [-121.9, 36.5],
    container: element,
    style: dark ? STYLES.dark : STYLES.light,
    zoom: 9,
  });

  instance.on("load", () => {
    addLayers(instance, dark);
    ready.current = true;
    syncData(instance, latest.current);
  });
  instance.on("click", "roads-line", (event) => {
    const id = String(event.features?.[0]?.properties.id ?? "");

    if (id) {
      latest.current.onSelect(id);
    }
  });
  instance.on("moveend", (event) => {
    if (event.originalEvent) {
      const { lng, lat } = instance.getCenter();
      latest.current.onMove([lng, lat]);
    }
  });

  return instance;
};

const fit = (instance: MapLibre, points: Point[]) => {
  const [first] = points;

  if (first === undefined) {
    return;
  }

  const bounds = new maplibregl.LngLatBounds(first, first);

  for (const point of points) {
    bounds.extend(point);
  }

  instance.fitBounds(bounds, { duration: 600, maxZoom: 13, padding: 36 });
};

export const MapView = ({
  ranked,
  selected,
  origin,
  onSelect,
  onMove,
}: Latest) => {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibre | null>(null);
  const ready = useRef(false);
  const latest = useRef<Latest>({ onMove, onSelect, origin, ranked, selected });
  const selectedId = selected?.road.id ?? null;
  const topId = ranked[0]?.road.id ?? null;

  useEffect(() => {
    latest.current = { onMove, onSelect, origin, ranked, selected };

    if (map.current && ready.current) {
      syncData(map.current, latest.current);
    }
  }, [onMove, onSelect, origin, ranked, selected]);

  useEffect(() => {
    const instance = container.current
      ? createMap(container.current, latest, ready)
      : null;

    map.current = instance;

    return () => {
      ready.current = false;
      map.current = null;
      instance?.remove();
    };
  }, []);

  useEffect(() => {
    const { current } = latest;
    const top = topId === null ? [] : current.ranked.slice(0, 5);

    const line =
      selectedId === null
        ? top.flatMap(({ road }) => road.line)
        : (current.selected?.road.line ?? []);

    if (map.current) {
      fit(map.current, current.origin ? [...line, current.origin] : line);
    }
  }, [selectedId, topId]);

  return <div className="size-full" ref={container} />;
};
