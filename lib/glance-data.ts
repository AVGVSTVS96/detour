import type { Cell, Found, PackedCell, SearchFile } from "@/lib/glance";
import { readJson } from "@/lib/json";
import { unpackRoad } from "@/lib/road";
import type { PackedRoad, Road, RoadIndex } from "@/lib/road";

const cells = new Map<string, Promise<Cell>>();
const fullCells = new Map<string, Promise<Road[]>>();
let index: Promise<RoadIndex> | undefined;
let search: Promise<Found> | undefined;

const fetchJson = async <T>(path: string, fallback: T) => {
  const response = await fetch(path).catch(() => null);

  return response?.ok === true ? await readJson<T>(response) : fallback;
};

const once = async <T>(
  held: Map<string, Promise<T>>,
  path: string,
  read: (path: string) => Promise<T>
) => {
  const request = held.get(path) ?? read(path);
  held.set(path, request);

  return await request;
};

const readBest = async (path: string): Promise<Cell> => {
  const { roads, towns } = await fetchJson<PackedCell>(path, {
    roads: [],
    towns: [],
  });

  return { roads: roads.map((road) => unpackRoad(road)), towns };
};

const readAll = async (path: string) => {
  const roads = await fetchJson<PackedRoad[]>(path, []);

  return roads.map((road) => unpackRoad(road));
};

export const loadIndex = async () => {
  index ??= fetch("/roads/index.json", { cache: "no-cache" }).then(
    async (response) => await readJson<RoadIndex>(response)
  );

  return await index;
};

export const loadBest = async (build: string, key: string) =>
  await once(cells, `/glance/${build}/${key}.json`, readBest);

export const loadAll = async (build: string, key: string) =>
  await once(fullCells, `/roads/${build}/${key}.json`, readAll);

const readSearch = async (): Promise<Found> => {
  const { build } = await loadIndex();

  const { roads, places } = await fetchJson<SearchFile>(
    `/glance/${build}/search.json`,
    { places: [], roads: [] }
  );

  return {
    places: places.map(([name, lon, lat, bests]) => ({
      at: [lon, lat],
      bests: bests.map(([road, cell, minutes, drive, smooth, word, tone]) => ({
        cell,
        drive,
        minutes,
        name: road,
        pavement: { smooth, tone, word },
      })),
      name,
    })),
    roads: roads.map(
      ([name, ref, town, cell, miles, smooth, word, tone, lon, lat]) => ({
        at: [lon, lat],
        cell,
        miles,
        name,
        pavement: { smooth, tone, word },
        ref,
        town,
      })
    ),
  };
};

export const loadSearch = async () => {
  search ??= readSearch();

  return await search;
};
