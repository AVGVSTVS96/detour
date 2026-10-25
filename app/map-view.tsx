"use client";

import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MapLibre } from "maplibre-gl";
import { useEffect, useRef } from "react";
import type { RefObject } from "react";

import type { Point } from "@/lib/geo";
import type { Ranked } from "@/lib/rank";

const WORKER = "/maplibre-gl-worker.mjs";

const STYLES = {
  dark: "https://tiles.openfreemap.org/styles/dark",
  light: "https://tiles.openfreemap.org/styles/positron",
};

const roadsData = (
  ranked: Ranked[],
  selected: string | null
): GeoJSON.FeatureCollection => ({
  features: ranked.map(({ road }, index) => ({
    geometry: { coordinates: road.line, type: "LineString" },
    properties: { id: road.id, rank: index, selected: road.id === selected },
    type: "Feature",
  })),
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
  map.addSource("roads", { data: roadsData([], null), type: "geojson" });
  map.addSource("origin", { data: pointData(null), type: "geojson" });
  map.addLayer({
    id: "roads-casing",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": paper,
      "line-width": [
        "case",
        ["get", "selected"],
        11,
        ["<", ["get", "rank"], 10],
        7,
        4,
      ],
    },
    source: "roads",
    type: "line",
  });
  map.addLayer({
    id: "roads-line",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["case", ["get", "selected"], "#ffe94d", ink],
      "line-opacity": [
        "case",
        ["get", "selected"],
        1,
        ["<", ["get", "rank"], 10],
        0.95,
        0.35,
      ],
      "line-width": [
        "case",
        ["get", "selected"],
        6,
        ["<", ["get", "rank"], 10],
        3.5,
        2,
      ],
    },
    source: "roads",
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
    ?.setData(roadsData(latest.ranked, latest.selected?.road.id ?? null));
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
