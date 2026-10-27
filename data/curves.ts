import { headingOf } from "@/data/line-grid";
import { distance, lineDistance, project } from "@/lib/geo";
import type { Point } from "@/lib/geo";

export interface Piece {
  line: Point[];
  from: number;
  to: number;
  curvature: number;
  meters: number;
}

const STRAIGHT_BREAK = 5000;
const MAX_PIECE = 60_000;

export const thin = (line: Point[], meters: number) => {
  const kept = [0];

  for (let index = 1; index < line.length - 1; index += 1) {
    if (distance(line[kept.at(-1) ?? 0], line[index]) >= meters) {
      kept.push(index);
    }
  }

  kept.push(line.length - 1);

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

interface Span {
  from: number;
  to: number;
  meters: number;
  curvature: number;
}

export const pieces = (line: Point[], scenicAt: (point: Point) => boolean) => {
  const radii = line.map((point, index) =>
    index === 0 || index === line.length - 1
      ? Number.POSITIVE_INFINITY
      : radius(line[index - 1], point, line[index + 1])
  );

  const found: Span[] = [];
  let current: Span = { curvature: 0, from: 0, meters: 0, to: 0 };
  let straight: Span = { curvature: 0, from: 0, meters: 0, to: 0 };

  const flush = () => {
    if (current.to > current.from) {
      found.push(current);
    }
  };

  const breaks = () =>
    straight.meters >= STRAIGHT_BREAK &&
    !scenicAt(line[Math.floor((straight.from + straight.to) / 2)] ?? line[0]);

  const closeStraight = () => {
    if (breaks()) {
      flush();
      found.push(straight);
      current = { curvature: 0, from: straight.to, meters: 0, to: straight.to };
    } else {
      current.to = straight.to;
      current.meters += straight.meters;
    }
  };

  for (let index = 1; index < line.length; index += 1) {
    const meters = distance(line[index - 1], line[index]);
    const weight = curveWeight(Math.min(radii[index - 1], radii[index]));

    if (weight === 0) {
      straight.to = index;
      straight.meters += meters;
      continue;
    }

    closeStraight();
    straight = { curvature: 0, from: index, meters: 0, to: index };
    current.to = index;
    current.meters += meters;
    current.curvature += meters * weight;

    if (current.meters >= MAX_PIECE) {
      flush();
      current = { curvature: 0, from: index, meters: 0, to: index };
    }
  }

  closeStraight();
  flush();

  return found.map((span): Piece => ({
    ...span,
    line: line.slice(span.from, span.to + 1),
  }));
};

export const splitWhere = (
  line: Point[],
  flag: (point: Point) => boolean,
  shortest: number
) => {
  const runs: { from: number; to: number; on: boolean; meters: number }[] = [];
  let on = flag(line[0]);
  let checked = 0;

  for (let index = 1; index < line.length; index += 1) {
    const meters = distance(line[index - 1], line[index]);
    checked += meters;

    if (checked >= 100) {
      checked = 0;
      on = flag(line[index]);
    }

    const last = runs.at(-1);

    if (last?.on === on) {
      last.to = index;
      last.meters += meters;
    } else {
      runs.push({ from: index - 1, meters, on, to: index });
    }
  }

  const kept: typeof runs = [];

  for (const run of runs) {
    const last = kept.at(-1);

    if (last && (run.meters < shortest || last.on === run.on)) {
      last.to = run.to;
      last.meters += run.meters;
    } else {
      kept.push({ ...run });
    }
  }

  return kept.map(({ from, to }) => [from, to] as const);
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
  const points: {
    point: Point;
    meters: number;
    segment: number;
    heading: number;
  }[] = [];

  for (let index = 1; index < line.length; index += 1) {
    const [lon1, lat1] = line[index - 1];
    const [lon2, lat2] = line[index];
    const meters = distance(line[index - 1], line[index]);
    const steps = Math.max(1, Math.round(meters / every));
    const heading = headingOf(line[index - 1], line[index]);

    for (let step = 0; step < steps; step += 1) {
      const t = (step + 0.5) / steps;
      points.push({
        heading,
        meters: meters / steps,
        point: [lon1 + (lon2 - lon1) * t, lat1 + (lat2 - lat1) * t],
        segment: index,
      });
    }
  }

  return points;
};
