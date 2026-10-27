import { Grid } from "@/data/grid";
import { lineDistance, project } from "@/lib/geo";
import type { Point } from "@/lib/geo";

interface Segment<T> {
  value: T;
  start: Point;
  end: Point;
}

const ALIGNED = (35 * Math.PI) / 180;

export const headingOf = (start: Point, end: Point) => {
  const [x, y] = project(start)(end);

  return Math.atan2(y, x);
};

const aligned = (a: number, b: number) => {
  const turn = Math.abs(a - b) % Math.PI;

  return Math.min(turn, Math.PI - turn) <= ALIGNED;
};

export class LineGrid<T> {
  private readonly grid: Grid<Segment<T>>;

  constructor(size: number) {
    this.grid = new Grid(size);
  }

  add(line: Point[], value: T) {
    for (let index = 1; index < line.length; index += 1) {
      this.grid.add({ end: line[index], start: line[index - 1], value }, [
        line[index - 1],
        line[index],
      ]);
    }
  }

  along(point: Point, heading: number, meters: number) {
    return this.grid
      .near(point)
      .filter(
        ({ start, end }) =>
          lineDistance(point, [start, end]) <= meters &&
          aligned(heading, headingOf(start, end))
      )
      .map(({ value }) => value);
  }

  within(point: Point, meters: number) {
    return this.grid
      .near(point)
      .filter(({ start, end }) => lineDistance(point, [start, end]) <= meters)
      .map(({ value }) => value);
  }

  nearest(point: Point, meters: number) {
    let best: { value: T; meters: number } | null = null;

    for (const { value, start, end } of this.grid.near(point)) {
      const away = lineDistance(point, [start, end]);

      if (away <= meters && (best === null || away < best.meters)) {
        best = { meters: away, value };
      }
    }

    return best?.value ?? null;
  }
}
