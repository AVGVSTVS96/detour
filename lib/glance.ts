import { distance } from "@/lib/geo";
import type { Point } from "@/lib/geo";
import type { Road } from "@/lib/road";
import { pavementVerdict, pavingShares, tagsOf } from "@/lib/verdict";
import type { Tone } from "@/lib/verdict";

export interface Pavement {
  smooth: number | null;
  word: string;
  tone: Tone;
}

export type BestRow = [
  name: string,
  cell: string,
  minutes: number,
  drive: number,
  smooth: number | null,
  word: string,
  tone: Tone,
];

export type PlaceRow = [
  name: string,
  lon: number,
  lat: number,
  bests: BestRow[],
];

export type Town = [name: string, kind: string, lon: number, lat: number];

export interface Cell {
  roads: Road[];
  towns: Town[];
}

export type RoadRow = [
  name: string,
  ref: string,
  town: string,
  cell: string,
  miles: number,
  smooth: number | null,
  word: string,
  tone: Tone,
  lon: number,
  lat: number,
];

export interface SearchFile {
  roads: RoadRow[];
  places: PlaceRow[];
}

export interface FoundRoad {
  name: string;
  ref: string;
  town: string;
  cell: string;
  miles: number;
  pavement: Pavement;
  at: Point;
}

export interface Best {
  name: string;
  cell: string;
  minutes: number;
  drive: number;
  pavement: Pavement;
}

export interface FoundPlace {
  name: string;
  at: Point;
  bests: Best[];
}

export interface Found {
  roads: FoundRoad[];
  places: FoundPlace[];
}

export const TYPICAL = 17.9;
export const REACH = 75_000;
export const FARTHEST = 90;

export const title = (road: { name: string; ref: string }) =>
  road.name || road.ref;

export const quality = (road: Road) => {
  const blend =
    0.35 * road.twisty +
    0.3 * road.scenic +
    0.2 * (road.smooth ?? 45) +
    0.15 * road.quiet;

  const length = 0.5 + 0.5 * Math.min(1, road.miles / 10);
  const riders = 1 + 0.25 * Math.min(1, road.riders / 4);

  return blend * length * riders;
};

export const worth = (road: Road, minutes: number) =>
  quality(road) * (1 - 0.5 * Math.min(1, minutes / FARTHEST));

export const ends = (road: Road, origin: Point): [Point, Point] => {
  const [first] = road.line;
  const last = road.line.at(-1) ?? first;

  return distance(origin, first) <= distance(origin, last)
    ? [first, last]
    : [last, first];
};

export const guessMinutes = (from: Point, to: Point) =>
  distance(from, to) / TYPICAL / 60;

export const driveMinutes = (road: Road) =>
  (road.miles / (45 - 0.2 * road.twisty)) * 60;

export const pavementOf = (road: Road): Pavement => {
  const { word, tone } = pavementVerdict(road);

  return { smooth: road.smooth, tone, word };
};

export const pavementText = ({ smooth, word }: Pavement) =>
  smooth === null ? word : `${word} ${smooth}/100`;

export const roughMiles = (road: Road) => pavingShares(road)[3] ?? 0;

export const traits = (road: Road) => {
  const pavement = pavementVerdict(road).word;

  return tagsOf(road).flatMap(({ word }) => (word === pavement ? [] : [word]));
};

export const clock = (minutes: number) => {
  const whole = Math.max(1, Math.round(minutes));

  if (whole < 60) {
    return `${whole} min`;
  }

  const rest = whole % 60;

  return rest === 0
    ? `${Math.floor(whole / 60)} h`
    : `${Math.floor(whole / 60)} h ${rest} min`;
};

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

export const heading = ([lon1, lat1]: Point, [lon2, lat2]: Point) => {
  const dx = (lon2 - lon1) * Math.cos((lat1 * Math.PI) / 180);
  const dy = lat2 - lat1;
  const degrees = (Math.atan2(dx, dy) * 180) / Math.PI;

  return COMPASS[Math.round(((degrees + 360) % 360) / 45) % 8] ?? "N";
};

export const words = (text: string) =>
  ` ${text
    .toLowerCase()
    .normalize("NFD")
    .replaceAll(/[^a-z0-9]+/gu, " ")
    .trim()}`;
