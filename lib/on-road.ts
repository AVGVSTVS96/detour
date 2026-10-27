import { distance, project } from "@/lib/geo";
import type { Point } from "@/lib/geo";
import type { Grade, Road } from "@/lib/road";

export type Paving = [miles: number, grade: Grade | 0][];

export interface OnRoad {
  road: Road;
  gap: number;
  ahead: Paving;
  left: number;
  end: Point;
  line: Point[];
}

const NEAR = 45;

const bearingGap = (a: number, b: number) => {
  const turn = Math.abs(a - b) % 360;

  return turn > 180 ? 360 - turn : turn;
};

const nearest = (point: Point, line: Point[]) => {
  const toMeters = project(point);

  let best = {
    along: 0,
    at: line[0],
    bearing: 0,
    gap: Number.POSITIVE_INFINITY,
    index: 1,
  };

  let walked = 0;

  for (let index = 1; index < line.length; index += 1) {
    const [ax, ay] = toMeters(line[index - 1]);
    const [bx, by] = toMeters(line[index]);
    const dx = bx - ax;
    const dy = by - ay;
    const square = dx * dx + dy * dy;

    const t =
      square === 0
        ? 0
        : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / square));

    const gap = Math.hypot(ax + t * dx, ay + t * dy);
    const meters = distance(line[index - 1], line[index]);

    if (gap < best.gap) {
      const [lon1, lat1] = line[index - 1];
      const [lon2, lat2] = line[index];

      best = {
        along: walked + t * meters,
        at: [lon1 + (lon2 - lon1) * t, lat1 + (lat2 - lat1) * t],
        bearing: (Math.atan2(dx, dy) * 180) / Math.PI,
        gap,
        index,
      };
    }

    walked += meters;
  }

  return { ...best, length: walked };
};

export const merged = (paving: Paving) => {
  const out: Paving = [];

  for (const [miles, grade] of paving) {
    const last = out.at(-1);

    if (last?.[1] === grade) {
      last[0] += miles;
    } else {
      out.push([miles, grade]);
    }
  }

  return out;
};

const skip = (paving: Paving, miles: number) => {
  let left = miles;
  const out: Paving = [];

  for (const [length, grade] of paving) {
    if (left >= length) {
      left -= length;
    } else {
      out.push([length - left, grade]);
      left = 0;
    }
  }

  return out;
};

export const onRoad = (
  roads: Road[],
  point: Point,
  heading: number | null
): OnRoad | null => {
  let found: OnRoad | null = null;

  for (const road of roads) {
    const { along, at, bearing, gap, index, length } = nearest(
      point,
      road.line
    );

    if (gap <= NEAR && (found === null || gap < found.gap)) {
      const forward =
        heading === null
          ? along < length / 2
          : bearingGap(heading, (bearing + 360) % 360) < 90;

      const total = road.paving.reduce((sum, [miles]) => sum + miles, 0);
      const done = length === 0 ? 0 : (along / length) * total;
      const [first] = road.line;
      const last = road.line.at(-1) ?? first;

      found = {
        ahead: merged(
          forward
            ? skip(road.paving, done)
            : skip(road.paving.toReversed(), total - done)
        ),
        end: forward ? last : first,
        gap,
        left: ((forward ? length - along : along) / length) * road.miles,
        line: forward
          ? [at, ...road.line.slice(index)]
          : [at, ...road.line.slice(0, index).toReversed()],
        road,
      };
    }
  }

  return found;
};
