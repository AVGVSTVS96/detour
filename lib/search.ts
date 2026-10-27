import { distance } from "@/lib/geo";
import type { Point } from "@/lib/geo";
import { readJson } from "@/lib/json";
import type { Road } from "@/lib/road";
import type { Tone } from "@/lib/verdict";

export type Listing = [
  name: string,
  ref: string,
  town: string,
  at: Point,
  word: string,
  tone: Tone,
  paving: Road["paving"],
  source: string,
];

export interface Town {
  name: string;
  at: Point;
  roads: number;
}

export interface Directory {
  roads: Listing[];
  towns: Town[];
}

export type Hit =
  | { kind: "road"; listing: Listing; meters: number }
  | { kind: "town"; town: Town; meters: number };

let directory: Promise<Directory> | undefined;

export const loadDirectory = async (build: string) => {
  directory ??= fetch(`/roads/${build}/search.json`).then(
    async (response) => await readJson<Directory>(response)
  );

  return await directory;
};

const fold = (text: string) =>
  text
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, " ")
    .trim();

const matches = (text: string, query: string) => {
  const folded = fold(text);

  return folded.startsWith(query) || folded.includes(` ${query}`);
};

export const hitsFor = (
  found: Directory,
  text: string,
  near: Point | null
): Hit[] => {
  const query = fold(text);

  if (query === "") {
    return [];
  }

  const away = (at: Point) => (near ? distance(near, at) : 0);

  const towns: Hit[] = found.towns
    .filter(({ name }) => matches(name, query))
    .map((town) => ({ kind: "town", meters: away(town.at), town }));

  const roads: Hit[] = found.roads
    .filter(([name, ref]) => matches(`${name} ${ref}`, query))
    .map((listing) => ({ kind: "road", listing, meters: away(listing[3]) }));

  return [
    ...towns.toSorted((a, b) => a.meters - b.meters).slice(0, 3),
    ...roads.toSorted((a, b) => a.meters - b.meters).slice(0, 8),
  ];
};
