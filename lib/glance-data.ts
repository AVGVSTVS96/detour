import type { Found, SearchFile } from "@/lib/glance";
import { readJson } from "@/lib/json";
import type { Road, RoadIndex } from "@/lib/road";

const cells = new Map<string, Promise<Road[]>>();
let index: Promise<RoadIndex> | undefined;
let search: Promise<Found> | undefined;

const fetchJson = async <T>(path: string, fallback: T) => {
  const response = await fetch(path).catch(() => null);

  return response?.ok === true ? await readJson<T>(response) : fallback;
};

const cellAt = async (path: string) => {
  const request = cells.get(path) ?? fetchJson<Road[]>(path, []);
  cells.set(path, request);

  return await request;
};

export const loadIndex = async () => {
  index ??= fetch("/roads/index.json", { cache: "no-cache" }).then(
    async (response) => await readJson<RoadIndex>(response)
  );

  return await index;
};

export const loadBest = async (build: string, key: string) =>
  await cellAt(`/glance/${build}/${key}.json`);

export const loadAll = async (build: string, key: string) =>
  await cellAt(`/roads/${build}/${key}.json`);

const readSearch = async (): Promise<Found> => {
  const { build } = await loadIndex();

  const { roads, places } = await fetchJson<SearchFile>(
    `/glance/${build}/search.json`,
    { places: [], roads: [] }
  );

  return {
    places: places.map(([name, lon, lat, best]) => {
      const [road, , minutes, drive, smooth] = best;

      return {
        at: [lon, lat],
        best: { drive, minutes, name: road, smooth },
        name,
      };
    }),
    roads: roads.map(([name, ref, town, cell, smooth, lon, lat]) => ({
      at: [lon, lat],
      cell,
      name,
      ref,
      smooth,
      town,
    })),
  };
};

export const loadSearch = async () => {
  search ??= readSearch();

  return await search;
};
