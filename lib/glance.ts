import { distance } from "@/lib/geo";
import type { Point } from "@/lib/geo";
import type { Road } from "@/lib/road";

export type Grade = "smooth" | "fair" | "rough" | "unknown";

export type BestRow = [
  name: string,
  cell: string,
  minutes: number,
  drive: number,
  smooth: number | null,
];

export type PlaceRow = [name: string, lon: number, lat: number, best: BestRow];

export type RoadRow = [
  name: string,
  ref: string,
  town: string,
  cell: string,
  smooth: number | null,
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
  smooth: number | null;
  at: Point;
}

export interface FoundPlace {
  name: string;
  at: Point;
  best: { name: string; minutes: number; drive: number; smooth: number | null };
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

  return blend * (0.5 + 0.5 * Math.min(1, road.miles / 10));
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

export const gradeOf = (smooth: number | null): Grade => {
  if (smooth === null) {
    return "unknown";
  }

  if (smooth >= 70) {
    return "smooth";
  }

  return smooth >= 45 ? "fair" : "rough";
};

export const GRADE_WORDS: Record<Grade, string> = {
  fair: "Fair pavement",
  rough: "Rough pavement",
  smooth: "Smooth",
  unknown: "Pavement unknown",
};

export const traits = (road: Road) =>
  [
    road.twisty >= 80 && "Very twisty",
    road.twisty >= 55 && road.twisty < 80 && "Twisty",
    road.coast && "Coast",
    !road.coast && road.scenic >= 60 && "Scenic",
    road.quiet >= 75 && "Quiet",
    road.quiet < 35 && "Busy",
  ].filter((trait) => trait !== false);

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
