"use client";

import * as maplibregl from "maplibre-gl";
import type {
  ExpressionSpecification,
  GeoJSONSource,
  LayerSpecification,
  Map as MapLibre,
  StyleSpecification,
} from "maplibre-gl";
import { useEffect, useRef } from "react";
import type { RefObject } from "react";

import type { Point } from "@/lib/geo";
import type { Road } from "@/lib/road";
import { pavingLines } from "@/lib/verdict";

const WORKER = "/maplibre-gl-worker.mjs";

const STYLES = {
  dark: "https://tiles.openfreemap.org/styles/dark",
  light: "https://tiles.openfreemap.org/styles/positron",
};

const CALIFORNIA: [Point, Point] = [
  [-124.4, 32.5],
  [-114.1, 42],
];

export const PAINT = {
  dark: {
    fair: "#ffb020",
    hi: "#ffe94d",
    ink: "#f2f2f2",
    paper: "#0b0b0b",
    rough: "#ff5a3c",
    smooth: "#f2f2f2",
    unknown: "#8c8c8c",
  },
  light: {
    fair: "#e38b00",
    hi: "#ffe94d",
    ink: "#0a0a0a",
    paper: "#ffffff",
    rough: "#e5341b",
    smooth: "#0a0a0a",
    unknown: "#8c8c8c",
  },
};

export interface Drawn {
  road: Road;
  value: number;
}

export interface Badge {
  id: string;
  point: Point;
  rank: number;
}

export interface Camera {
  key: string;
  points: Point[];
}

export interface View {
  center: Point;
  bounds: [Point, Point];
  zoom: number;
  user: boolean;
}

interface Props {
  drawn: Drawn[];
  badges: Badge[];
  focusId: string | null;
  story: boolean;
  origin: Point | null;
  nearEnd: Point | null;
  camera: Camera | null;
  onSelect: (id: string) => void;
  onView: (view: View) => void;
}

const pieces = new WeakMap<Road, ReturnType<typeof pavingLines>>();

const piecesOf = (road: Road) => {
  const known = pieces.get(road);

  if (known) {
    return known;
  }

  const made = pavingLines(road);
  pieces.set(road, made);

  return made;
};

const widthOf = (value: number) => 1.5 + 4.5 * Math.min(1, value / 100);

const roadsData = (drawn: Drawn[]): GeoJSON.FeatureCollection => ({
  features: drawn.flatMap(({ road, value }) =>
    piecesOf(road).map(({ grade, line }) => ({
      geometry: { coordinates: line, type: "LineString" as const },
      properties: { grade, id: road.id, width: widthOf(value) },
      type: "Feature" as const,
    }))
  ),
  type: "FeatureCollection",
});

const badgesData = (
  badges: Badge[],
  focusId: string | null,
  story: boolean
): GeoJSON.FeatureCollection => ({
  features: badges.flatMap(({ id, point, rank }) =>
    story && id !== focusId
      ? []
      : [
          {
            geometry: { coordinates: point, type: "Point" as const },
            properties: {
              icon: `${id === focusId ? "focus" : "badge"}-${rank}`,
              id,
              order: id === focusId ? 0 : rank,
            },
            type: "Feature" as const,
          },
        ]
  ),
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

const zoomed = (width: ExpressionSpecification): ExpressionSpecification => [
  "interpolate",
  ["linear"],
  ["zoom"],
  7,
  ["*", 0.5, width],
  11,
  width,
  15,
  ["*", 1.8, width],
];

const scheme = () =>
  matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

const BADGE = 32;

const SCALE = 2;

const drawBadge = (label: string, fill: string, ink: string) => {
  const canvas = document.createElement("canvas");
  canvas.width = BADGE * SCALE;
  canvas.height = BADGE * SCALE;

  const context = canvas.getContext("2d");

  if (!context) {
    return null;
  }

  context.scale(SCALE, SCALE);
  context.beginPath();
  context.arc(BADGE / 2, BADGE / 2, BADGE / 2 - 2, 0, Math.PI * 2);
  context.fillStyle = fill;
  context.fill();
  context.lineWidth = 2.5;
  context.strokeStyle = ink === "#ffffff" ? "#ffffff" : "#0a0a0a";
  context.stroke();
  context.fillStyle = ink;
  context.font = "800 16px -apple-system, system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, BADGE / 2, BADGE / 2 + 1);

  return context.getImageData(0, 0, canvas.width, canvas.height);
};

const drawNearEnd = () => {
  const size = 18;
  const canvas = document.createElement("canvas");
  canvas.width = size * SCALE;
  canvas.height = size * SCALE;

  const context = canvas.getContext("2d");

  if (!context) {
    return null;
  }

  context.scale(SCALE, SCALE);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size, size);
  context.fillStyle = "#0a0a0a";
  context.fillRect(3, 3, size - 6, size - 6);

  return context.getImageData(0, 0, canvas.width, canvas.height);
};

const addImages = (map: MapLibre) => {
  const images: [string, ImageData | null][] = [["near-end", drawNearEnd()]];

  for (let rank = 1; rank <= 10; rank += 1) {
    images.push(
      [`badge-${rank}`, drawBadge(String(rank), "#0a0a0a", "#ffffff")],
      [`focus-${rank}`, drawBadge(String(rank), "#ffe94d", "#0a0a0a")]
    );
  }

  for (const [name, image] of images) {
    if (image && !map.hasImage(name)) {
      map.addImage(name, image, { pixelRatio: SCALE });
    }
  }
};

const PLACE_LABEL = /^(?:label|place)_/u;

const FONT = ["Noto Sans Regular"];

const plain = (layer: LayerSpecification): LayerSpecification[] => {
  if (layer.type !== "symbol") {
    return [layer];
  }

  const { "icon-image": icon, ...layout } = layer.layout ?? {};

  if (icon !== undefined && !PLACE_LABEL.test(layer.id)) {
    return [];
  }

  return [
    {
      ...layer,
      layout:
        layout["text-field"] === undefined
          ? layout
          : { ...layout, "text-font": FONT },
    },
  ];
};

const lighten = (
  _previous: StyleSpecification | undefined,
  next: StyleSpecification
): StyleSpecification => ({
  ...next,
  layers: next.layers.flatMap(plain),
  sprite: undefined,
});

const addLayers = (map: MapLibre) => {
  addImages(map);

  const paint = PAINT[scheme()];
  const width: ExpressionSpecification = ["get", "width"];

  const before = map
    .getStyle()
    .layers.find(({ type }) => type === "symbol")?.id;

  map.addSource("roads", { data: roadsData([]), type: "geojson" });
  map.addSource("ranks", {
    data: badgesData([], null, false),
    type: "geojson",
  });
  map.addSource("origin", { data: pointData(null), type: "geojson" });
  map.addSource("near-end", { data: pointData(null), type: "geojson" });

  map.addLayer(
    {
      filter: ["==", ["get", "id"], ""],
      id: "roads-focus",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": paint.hi,
        "line-width": zoomed(["+", 10, width]),
      },
      source: "roads",
      type: "line",
    },
    before
  );
  map.addLayer(
    {
      id: "roads-casing",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": paint.paper,
        "line-width": zoomed(["+", 2.5, width]),
      },
      source: "roads",
      type: "line",
    },
    before
  );
  map.addLayer(
    {
      filter: ["==", ["get", "grade"], 0],
      id: "roads-unknown",
      paint: {
        "line-color": paint.unknown,
        "line-dasharray": [1.5, 1],
        "line-width": zoomed(["*", 0.8, width]),
      },
      source: "roads",
      type: "line",
    },
    before
  );
  map.addLayer(
    {
      filter: [">", ["get", "grade"], 0],
      id: "roads-known",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": [
          "match",
          ["get", "grade"],
          1,
          paint.smooth,
          2,
          paint.fair,
          paint.rough,
        ],
        "line-width": zoomed(width),
      },
      source: "roads",
      type: "line",
    },
    before
  );
  map.addLayer({
    id: "origin-ring",
    paint: {
      "circle-color": "rgba(0,0,0,0)",
      "circle-radius": 14,
      "circle-stroke-color": paint.ink,
      "circle-stroke-width": 3,
    },
    source: "origin",
    type: "circle",
  });
  map.addLayer({
    id: "origin-dot",
    paint: {
      "circle-color": paint.ink,
      "circle-radius": 6,
    },
    source: "origin",
    type: "circle",
  });
  map.addLayer({
    id: "near-end",
    layout: { "icon-allow-overlap": true, "icon-image": "near-end" },
    source: "near-end",
    type: "symbol",
  });
  map.addLayer({
    id: "ranks",
    layout: {
      "icon-image": ["get", "icon"],
      "icon-padding": 1,
      "symbol-sort-key": ["get", "order"],
    },
    source: "ranks",
    type: "symbol",
  });
};

const FADED = ["roads-casing", "roads-unknown", "roads-known"];

const syncFocus = (map: MapLibre, props: Props) => {
  const { badges, focusId, story, origin, nearEnd } = props;
  const id = focusId ?? "";

  map.setFilter("roads-focus", ["==", ["get", "id"], id]);

  for (const layer of FADED) {
    map.setPaintProperty(
      layer,
      "line-opacity",
      story ? ["case", ["==", ["get", "id"], id], 1, 0.25] : 1
    );
  }

  void map
    .getSource<GeoJSONSource>("ranks")
    ?.setData(badgesData(badges, focusId, story));
  void map.getSource<GeoJSONSource>("origin")?.setData(pointData(origin));
  void map
    .getSource<GeoJSONSource>("near-end")
    ?.setData(pointData(story ? nearEnd : null));
};

const syncRoads = (map: MapLibre, drawn: Drawn[]) => {
  void map.getSource<GeoJSONSource>("roads")?.setData(roadsData(drawn));
};

const boundsOf = (points: Point[]) => {
  const [first = CALIFORNIA[0]] = points;
  const bounds = new maplibregl.LngLatBounds(first, first);

  for (const point of points) {
    bounds.extend(point);
  }

  return bounds;
};

const PADDING = { bottom: 28, left: 28, right: 28, top: 76 };

const viewOf = (map: MapLibre, user: boolean): View => {
  const { lng, lat } = map.getCenter();
  const bounds = map.getBounds();

  return {
    bounds: [
      [bounds.getWest(), bounds.getSouth()],
      [bounds.getEast(), bounds.getNorth()],
    ],
    center: [lng, lat],
    user,
    zoom: map.getZoom(),
  };
};

const TAPPABLE = ["ranks", "roads-known", "roads-unknown"];

const createMap = (
  element: HTMLDivElement,
  latest: RefObject<Props>,
  ready: RefObject<boolean>
) => {
  maplibregl.setWorkerUrl(WORKER);
  const points = latest.current.camera?.points ?? CALIFORNIA;

  const map = new maplibregl.Map({
    attributionControl: false,
    bounds: boundsOf(points),
    container: element,
    fitBoundsOptions: { maxZoom: 13, padding: PADDING },
    pitchWithRotate: false,
  });

  map.setStyle(STYLES[scheme()], { transformStyle: lighten });
  map.touchZoomRotate.disableRotation();

  map.on("style.load", () => {
    addLayers(map);
    ready.current = true;
    syncRoads(map, latest.current.drawn);
    syncFocus(map, latest.current);
  });
  map.on("click", ({ point: { x, y } }) => {
    const [hit] = map.queryRenderedFeatures(
      [
        [x - 18, y - 18],
        [x + 18, y + 18],
      ],
      { layers: TAPPABLE }
    );

    const id = String(hit?.properties.id ?? "");

    if (id) {
      latest.current.onSelect(id);
    }
  });
  map.on("moveend", (event) => {
    latest.current.onView(viewOf(map, event.originalEvent !== undefined));
  });
  map.once("load", () => {
    latest.current.onView(viewOf(map, false));
  });

  return map;
};

export const MapView = (props: Props) => {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibre | null>(null);
  const ready = useRef(false);
  const latest = useRef(props);
  const cameraKey = props.camera?.key ?? null;
  const { drawn, badges, focusId, story, origin, nearEnd } = props;

  useEffect(() => {
    latest.current = props;
  });

  useEffect(() => {
    if (map.current && ready.current) {
      syncRoads(map.current, drawn);
    }
  }, [drawn]);

  useEffect(() => {
    if (map.current && ready.current) {
      syncFocus(map.current, {
        ...latest.current,
        badges,
        focusId,
        nearEnd,
        origin,
        story,
      });
    }
  }, [badges, focusId, story, origin, nearEnd]);

  useEffect(() => {
    const instance = container.current
      ? createMap(container.current, latest, ready)
      : null;

    map.current = instance;

    const media = matchMedia("(prefers-color-scheme: dark)");

    const restyle = () => {
      ready.current = false;
      instance?.setStyle(STYLES[scheme()], { transformStyle: lighten });
    };

    media.addEventListener("change", restyle);

    return () => {
      media.removeEventListener("change", restyle);
      ready.current = false;
      map.current = null;
      instance?.remove();
    };
  }, []);

  useEffect(() => {
    const points = latest.current.camera?.points ?? [];

    if (map.current && cameraKey !== null && points.length > 0) {
      const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

      map.current.resize();
      map.current.fitBounds(boundsOf(points), {
        duration: still ? 0 : 700,
        maxZoom: 13,
        padding: PADDING,
      });
    }
  }, [cameraKey]);

  return <div className="size-full" ref={container} />;
};
