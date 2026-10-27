import type { Cell, Found, SearchFile } from "@/lib/glance";
import { readJson } from "@/lib/json";
import type { Road, RoadIndex } from "@/lib/road";

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
  fallback: T
) => {
  const request = held.get(path) ?? fetchJson<T>(path, fallback);
  held.set(path, request);

  return await request;
};

export const loadIndex = async () => {
  index ??= fetch("/roads/index.json", { cache: "no-cache" }).then(
    async (response) => await readJson<RoadIndex>(response)
  );

  return await index;
};

export const loadBest = async (build: string, key: string) =>
  await once(cells, `/glance/${build}/${key}.json`, { roads: [], towns: [] });

export const loadAll = async (build: string, key: string) =>
  await once(fullCells, `/roads/${build}/${key}.json`, []);

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
