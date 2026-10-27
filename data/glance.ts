import { mkdir, rm } from "node:fs/promises";

import { simplify } from "@/data/curves";
import { distance } from "@/lib/geo";
import type { Point } from "@/lib/geo";
import {
  driveMinutes,
  ends,
  guessMinutes,
  quality,
  title,
  worth,
} from "@/lib/glance";
import type { BestRow, PlaceRow, RoadRow, SearchFile } from "@/lib/glance";
import { readJson } from "@/lib/json";
import type { Road, RoadIndex } from "@/lib/road";

const ROADS = `${import.meta.dir}/../public/roads`;
const OUT = `${import.meta.dir}/../public/glance`;
const PER_CELL = 40;
const AROUND = 40_000;

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

const places = await read<[string, string, number, number][]>(
  `${import.meta.dir}/places.json`
);

await rm(OUT, { force: true, recursive: true });

await mkdir(`${OUT}/${build}`, { recursive: true });

const found = new Map<string, RoadRow>();
const everyRoad = new Map<string, { road: Road; cell: string }>();

const byCell = await Promise.all(
  cells.map(async (cell) => {
    const roads = await read<Road[]>(`${ROADS}/${build}/${cell}.json`);
    const named = bestByTitle(roads.filter((road) => title(road) !== ""));

    const top = named
      .toSorted((a, b) => quality(b) - quality(a))
      .slice(0, PER_CELL);

    await Bun.write(
      `${OUT}/${build}/${cell}.json`,
      JSON.stringify(top.map((road) => lighter(road)))
    );

    return { cell, named };
  })
);

for (const { cell, named } of byCell) {
  for (const road of named) {
    const [lon, lat] = roundPoint(middle(road), 3);
    everyRoad.set(road.id, { cell, road });
    found.set(road.id, [
      title(road),
      road.name ? road.ref : "",
      road.town,
      cell,
      road.smooth,
      lon,
      lat,
    ]);
  }
}

const bestAround = (at: Point) => {
  let best: BestRow | null = null;
  let bestWorth = 0;

  for (const { road, cell } of everyRoad.values()) {
    const [start] = ends(road, at);

    if (distance(at, start) > AROUND) {
      continue;
    }

    const minutes = guessMinutes(at, start);
    const value = worth(road, minutes);

    if (value > bestWorth) {
      bestWorth = value;
      best = [
        title(road),
        cell,
        Math.round(minutes),
        Math.round(driveMinutes(road)),
        road.smooth,
      ];
    }
  }

  return best;
};

const index: SearchFile = {
  places: places.flatMap(([name, , lon, lat]): PlaceRow[] => {
    const best = bestAround([lon, lat]);

    return best === null ? [] : [[name, lon, lat, best]];
  }),
  roads: [...found.values()],
};

await Bun.write(`${OUT}/${build}/search.json`, JSON.stringify(index));

console.log(
  `glance: ${cells.length} cells, ${found.size} roads, ${index.places.length} places in public/glance/${build}`
);
