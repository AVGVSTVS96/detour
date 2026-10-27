import { mkdir, rm } from "node:fs/promises";

import { simplify } from "@/data/curves";
import { cellOf, distance } from "@/lib/geo";
import type { Point } from "@/lib/geo";
import {
  driveMinutes,
  ends,
  guessMinutes,
  pavementOf,
  quality,
  title,
  worth,
} from "@/lib/glance";
import type {
  BestRow,
  Cell,
  PlaceRow,
  RoadRow,
  SearchFile,
  Town,
} from "@/lib/glance";
import { readJson } from "@/lib/json";
import type { Road, RoadIndex } from "@/lib/road";

const ROADS = `${import.meta.dir}/../public/roads`;
const OUT = `${import.meta.dir}/../public/glance`;
const PER_CELL = 40;
const AROUND = 40_000;
const BESTS = 3;

const read = async <T>(path: string) => await readJson<T>(Bun.file(path));

const round = (value: number, places: number) => {
  const scale = 10 ** places;

  return Math.round(value * scale) / scale;
};

const roundPoint = ([lon, lat]: Point, places: number): Point => [
  round(lon, places),
  round(lat, places),
];

const lighter = (road: Road): Road => ({
  ...road,
  line: simplify(road.line, 20).map((point) => roundPoint(point, 4)),
  reports: road.reports
    .filter(({ topic }) => topic === "pavement")
    .toSorted((a, b) => (b.year ?? 0) - (a.year ?? 0))
    .slice(0, 1),
  views: road.views.slice(0, 3),
});

const bestByTitle = (roads: Road[]) => {
  const best = new Map<string, Road>();

  for (const road of roads) {
    const key = title(road).toLowerCase();
    const held = best.get(key);

    if (held === undefined || quality(road) > quality(held)) {
      best.set(key, road);
    }
  }

  return [...best.values()];
};

const middle = (road: Road) =>
  road.line[Math.floor(road.line.length / 2)] ?? road.line[0];

const { build, cells } = await read<RoadIndex>(`${ROADS}/index.json`);
const towns = await read<Town[]>(`${import.meta.dir}/places.json`);
const townsIn = Map.groupBy(towns, (town) => cellOf([town[2], town[3]]));

await rm(OUT, { force: true, recursive: true });

await mkdir(`${OUT}/${build}`, { recursive: true });

const byCell = await Promise.all(
  cells.map(async (key) => {
    const roads = await read<Road[]>(`${ROADS}/${build}/${key}.json`);
    const named = roads.filter((road) => title(road) !== "");

    const cell: Cell = {
      roads: bestByTitle(named)
        .toSorted((a, b) => quality(b) - quality(a))
        .slice(0, PER_CELL)
        .map((road) => lighter(road)),
      towns: townsIn.get(key) ?? [],
    };

    await Bun.write(`${OUT}/${build}/${key}.json`, JSON.stringify(cell));

    return { key, named };
  })
);

const everyRoad = new Map<string, { road: Road; key: string }>();

for (const { key, named } of byCell) {
  for (const road of named) {
    everyRoad.set(road.id, { key, road });
  }
}

const roadRows = [...everyRoad.values()].map(({ road, key }): RoadRow => {
  const [lon, lat] = roundPoint(middle(road), 3);
  const { smooth, word, tone } = pavementOf(road);

  return [
    title(road),
    road.name ? road.ref : "",
    road.town,
    key,
    road.miles,
    smooth,
    word,
    tone,
    lon,
    lat,
  ];
});

const bestAround = (at: Point) => {
  const near: { value: number; row: BestRow }[] = [];

  for (const { road, key } of everyRoad.values()) {
    const [start] = ends(road, at);

    if (distance(at, start) <= AROUND) {
      const minutes = guessMinutes(at, start);
      const { smooth, word, tone } = pavementOf(road);

      near.push({
        row: [
          title(road),
          key,
          Math.round(minutes),
          Math.round(driveMinutes(road)),
          smooth,
          word,
          tone,
        ],
        value: worth(road, minutes),
      });
    }
  }

  const named = new Set<string>();

  return near
    .toSorted((a, b) => b.value - a.value)
    .flatMap(({ row }) => {
      const fresh = !named.has(row[0]);
      named.add(row[0]);

      return fresh ? [row] : [];
    })
    .slice(0, BESTS);
};

const index: SearchFile = {
  places: towns.flatMap(([name, , lon, lat]): PlaceRow[] => {
    const bests = bestAround([lon, lat]);

    return bests.length === 0 ? [] : [[name, lon, lat, bests]];
  }),
  roads: roadRows,
};

await Bun.write(`${OUT}/${build}/search.json`, JSON.stringify(index));

console.log(
  `glance: ${cells.length} cells, ${roadRows.length} roads, ${index.places.length} places in public/glance/${build}`
);
