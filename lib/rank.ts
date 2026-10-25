import type { Closure } from "@/lib/closure";
import { distance, lineDistance } from "@/lib/geo";
import type { Point } from "@/lib/geo";
import type { Quality, Road } from "@/lib/road";

export interface Ranked {
  road: Road;
  score: number;
  minutes: number;
  estimated: boolean;
  start: Point;
  end: Point;
  closures: Closure[];
}

const FASTEST = 26.8;
const TYPICAL = 17.9;

const routeNumber = (text: string) => /\d+/u.exec(text)?.[0] ?? null;

export const closuresOn = (road: Road, closures: Closure[]) => {
  const numbers = new Set(road.ref.split(";").map((ref) => routeNumber(ref)));

  return closures.filter(
    (closure) =>
      numbers.has(routeNumber(closure.route)) &&
      Math.min(
        lineDistance(closure.from, road.line),
        lineDistance(closure.to, road.line)
      ) <= 300
  );
};

const ends = (road: Road, origin: Point): [Point, Point] => {
  const [first] = road.line;
  const last = road.line.at(-1) ?? first;

  return distance(origin, first) <= distance(origin, last)
    ? [first, last]
    : [last, first];
};

const quality = (road: Road, qualities: Quality[]) => {
  if (qualities.length === 0) {
    return 50;
  }

  const total = qualities.reduce((sum, item) => sum + (road[item] ?? 50), 0);

  return (
    (total / qualities.length) * (0.7 + 0.3 * Math.min(1, road.miles / 15))
  );
};

export const shortlist = (
  roads: Road[],
  origin: Point,
  qualities: Quality[],
  minutes: number
) =>
  roads
    .flatMap((road) => {
      const end = ends(road, origin);

      return distance(origin, end[0]) <= minutes * 60 * FASTEST
        ? [{ end, road }]
        : [];
    })
    .toSorted((a, b) => quality(b.road, qualities) - quality(a.road, qualities))
    .slice(0, 80);

export const rank = (
  candidates: ReturnType<typeof shortlist>,
  origin: Point,
  qualities: Quality[],
  minutes: number,
  closures: Closure[],
  driveSeconds: Map<string, number>
) => {
  const ranked: Ranked[] = [];

  for (const {
    road,
    end: [start, end],
  } of candidates) {
    const known = driveSeconds.get(road.id);
    const away = (known ?? distance(origin, start) / TYPICAL) / 60;

    if (away > minutes) {
      continue;
    }

    ranked.push({
      closures: closuresOn(road, closures),
      end,
      estimated: known === undefined,
      minutes: away,
      road,
      score: quality(road, qualities) * (1 - 0.4 * (away / minutes)),
      start,
    });
  }

  return ranked.toSorted((a, b) => b.score - a.score);
};

const middle = (road: Road) =>
  road.line[Math.floor(road.line.length / 2)] ?? road.line[0];

const latLon = ([lon, lat]: Point) => `${lat},${lon}`;

export const appleMaps = ({ road, start, end }: Ranked) =>
  `https://maps.apple.com/directions?${new URLSearchParams([
    ["destination", latLon(end)],
    ["waypoint", latLon(start)],
    ["waypoint", latLon(middle(road))],
    ["mode", "driving"],
  ])}`;

export const googleMaps = ({ road, start, end }: Ranked) =>
  `https://www.google.com/maps/dir/?${new URLSearchParams({
    api: "1",
    destination: latLon(end),
    travelmode: "driving",
    waypoints: `${latLon(start)}|${latLon(middle(road))}`,
  })}`;
