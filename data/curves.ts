import { distance, lineDistance, project } from "@/lib/geo";
import type { Point } from "@/lib/geo";

export interface Piece {
  line: Point[];
  curvature: number;
  meters: number;
}

const STRAIGHT_BREAK = 2000;
const MAX_PIECE = 60_000;

export const thin = (line: Point[], meters: number) => {
  const kept = [line[0]];

  for (const point of line.slice(1, -1)) {
    if (distance(kept.at(-1) ?? point, point) >= meters) {
      kept.push(point);
    }
  }

  kept.push(line.at(-1) ?? line[0]);

  return kept;
};

const radius = (a: Point, b: Point, c: Point) => {
  const toMeters = project(b);
  const [ax, ay] = toMeters(a);
  const [cx, cy] = toMeters(c);
  const area = Math.abs(ax * cy - ay * cx) / 2;

  return area === 0
    ? Number.POSITIVE_INFINITY
    : (distance(a, b) * distance(b, c) * distance(c, a)) / (4 * area);
};

const curveWeight = (meters: number) => {
  if (meters < 30) {
    return 2;
  }

  if (meters < 60) {
    return 1.6;
  }

  if (meters < 100) {
    return 1.3;
  }

  return meters < 175 ? 1 : 0;
};

export const pieces = (line: Point[], scenicAt: (point: Point) => boolean) => {
  const radii = line.map((point, index) =>
    index === 0 || index === line.length - 1
      ? Number.POSITIVE_INFINITY
      : radius(line[index - 1], point, line[index + 1])
  );

  const found: Piece[] = [];
  let current: Piece = { curvature: 0, line: [line[0]], meters: 0 };
  let straight = { line: [line[0]], meters: 0 };

  const flush = () => {
    if (current.line.length > 1) {
      found.push(current);
    }
  };

  const breaks = () =>
    straight.meters >= STRAIGHT_BREAK &&
    !scenicAt(
      straight.line[Math.floor(straight.line.length / 2)] ?? straight.line[0]
    );

  const closeStraight = () => {
    if (breaks()) {
      flush();
      found.push({
        curvature: 0,
        line: straight.line,
        meters: straight.meters,
      });
      current = {
        curvature: 0,
        line: [straight.line.at(-1) ?? line[0]],
        meters: 0,
      };
    } else {
      current.line.push(...straight.line.slice(1));
      current.meters += straight.meters;
    }
  };

  for (let index = 1; index < line.length; index += 1) {
    const meters = distance(line[index - 1], line[index]);
    const weight = curveWeight(Math.min(radii[index - 1], radii[index]));

    if (weight === 0) {
      straight.line.push(line[index]);
      straight.meters += meters;
      continue;
    }

    closeStraight();
    straight = { line: [line[index]], meters: 0 };
    current.line.push(line[index]);
    current.meters += meters;
    current.curvature += meters * weight;

    if (current.meters >= MAX_PIECE) {
      flush();
      current = { curvature: 0, line: [line[index]], meters: 0 };
    }
  }

  closeStraight();
  flush();

  return found;
};

export const simplify = (line: Point[], tolerance: number): Point[] => {
  if (line.length < 3) {
    return line;
  }

  const [first] = line;
  const last = line.at(-1) ?? first;
  let farthest = 0;
  let split = 0;

  for (let index = 1; index < line.length - 1; index += 1) {
    const meters = lineDistance(line[index], [first, last]);

    if (meters > farthest) {
      farthest = meters;
      split = index;
    }
  }

  if (farthest <= tolerance) {
    return [first, last];
  }

  return [
    ...simplify(line.slice(0, split + 1), tolerance).slice(0, -1),
    ...simplify(line.slice(split), tolerance),
  ];
};

export const samples = (line: Point[], every: number) => {
  const points: { point: Point; meters: number }[] = [];

  for (let index = 1; index < line.length; index += 1) {
    const [lon1, lat1] = line[index - 1];
    const [lon2, lat2] = line[index];
    const meters = distance(line[index - 1], line[index]);
    const steps = Math.max(1, Math.round(meters / every));

    for (let step = 0; step < steps; step += 1) {
      const t = (step + 0.5) / steps;
      points.push({
        meters: meters / steps,
        point: [lon1 + (lon2 - lon1) * t, lat1 + (lat2 - lat1) * t],
      });
    }
  }

  return points;
};
