import type { Point } from "@/lib/geo";
import { readJson } from "@/lib/json";
import type { PavementSource, Road, RoadIndex } from "@/lib/road";
import type { Directory, Listing, Town } from "@/lib/search";
import { pavementVerdict } from "@/lib/verdict";

const ROADS = `${import.meta.dir}/../public/roads`;

const years = ({ from, to }: PavementSource) => {
  if (from === null) {
    return "";
  }

  return from === to || to === null ? ` ${from}` : ` ${from}–${to}`;
};

const sourceOf = (road: Road) => {
  const first = road.pavedBy.at(0);

  return first ? `${first.name}${years(first)}` : "";
};

const round = (value: number) => Math.round(value * 1000) / 1000;

const middle = (road: Road): Point => {
  const [lon, lat] = road.line[Math.floor(road.line.length / 2)];

  return [round(lon), round(lat)];
};

const { build, cells } = await readJson<RoadIndex>(
  Bun.file(`${ROADS}/index.json`)
);

const tenths = (paving: Road["paving"]): Road["paving"] =>
  paving.some(([, grade]) => grade > 0)
    ? paving.map(([miles, grade]) => [Math.round(miles * 10) / 10, grade])
    : [];

const lists = await Promise.all(
  cells.map(
    async (cell) =>
      await readJson<Road[]>(Bun.file(`${ROADS}/${build}/${cell}.json`))
  )
);

const roads = new Map<string, Listing>();
const towns = new Map<string, Point[]>();

for (const list of lists) {
  for (const road of list) {
    if (roads.has(road.id)) {
      continue;
    }

    const verdict = pavementVerdict(road);
    const at = middle(road);

    roads.set(road.id, [
      road.name,
      road.ref,
      road.town,
      at,
      verdict.word,
      verdict.tone,
      tenths(road.paving),
      sourceOf(road),
    ]);

    if (road.town) {
      towns.set(road.town, [...(towns.get(road.town) ?? []), at]);
    }
  }
}

const centroid = (points: Point[]): Point => [
  round(points.reduce((sum, [lon]) => sum + lon, 0) / points.length),
  round(points.reduce((sum, [, lat]) => sum + lat, 0) / points.length),
];

const directory: Directory = {
  roads: [...roads.values()],
  towns: [...towns].map(([name, points]): Town => ({
    at: centroid(points),
    name,
    roads: points.length,
  })),
};

await Bun.write(`${ROADS}/${build}/search.json`, JSON.stringify(directory));
