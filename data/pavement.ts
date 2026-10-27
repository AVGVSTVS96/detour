import type { Grade, PavementSource } from "@/lib/road";

const between = (value: number, points: [number, number][]) => {
  const [first] = points;
  const last = points.at(-1) ?? first;

  if (value <= first[0]) {
    return first[1];
  }

  for (let index = 1; index < points.length; index += 1) {
    const [x1, y1] = points[index - 1];
    const [x2, y2] = points[index];

    if (value <= x2) {
      return y1 + ((value - x1) / (x2 - x1)) * (y2 - y1);
    }
  }

  return last[1];
};

export const smoothFromIri = (iri: number) =>
  between(iri, [
    [60, 100],
    [95, 70],
    [170, 35],
    [250, 0],
  ]);

export const smoothFromPci = (pci: number) =>
  between(pci, [
    [10, 0],
    [50, 35],
    [70, 70],
    [100, 100],
  ]);

export const SMOOTHNESS_TAG = new Map([
  ["excellent", 95],
  ["good", 80],
  ["intermediate", 55],
  ["bad", 25],
  ["very_bad", 10],
  ["horrible", 0],
  ["very_horrible", 0],
]);

export const RIDER_SMOOTH = new Map([
  ["positive", 80],
  ["mixed", 50],
  ["negative", 20],
]);

export const gradeOf = (smooth: number): Grade => {
  if (smooth >= 70) {
    return 1;
  }

  return smooth >= 35 ? 2 : 3;
};

export interface Reading {
  smooth: number;
  year: number | null;
  kind: PavementSource["kind"];
  name: string;
}

const RIDERS_NEWER_BY = 2;

export const pick = (
  measured: Reading | null,
  riders: Reading | null,
  mapped: Reading | null
) => {
  const ridersYear = riders?.year ?? null;

  if (
    measured !== null &&
    (ridersYear === null || ridersYear < (measured.year ?? 0) + RIDERS_NEWER_BY)
  ) {
    return measured;
  }

  return riders ?? measured ?? mapped;
};

export interface Run {
  grade: Grade | 0;
  meters: number;
}

const MIN_RUN = 300;

const joinSame = (runs: Run[]) => {
  const joined: Run[] = [];

  for (const run of runs) {
    const last = joined.at(-1);

    if (last?.grade === run.grade) {
      last.meters += run.meters;
    } else {
      joined.push({ ...run });
    }
  }

  return joined;
};

const shortestOf = (runs: Run[]) => {
  let shortest = 0;

  for (const [index, run] of runs.entries()) {
    if (run.meters < (runs[shortest]?.meters ?? Infinity)) {
      shortest = index;
    }
  }

  return shortest;
};

export const runsOf = (steps: Run[]) => {
  let runs = joinSame(steps);

  for (;;) {
    const shortest = shortestOf(runs);
    const run = runs[shortest];

    if (runs.length < 2 || run === undefined || run.meters >= MIN_RUN) {
      return runs;
    }

    const before = runs[shortest - 1];
    const after = runs[shortest + 1];

    const into =
      before === undefined ||
      (after !== undefined && after.meters > before.meters)
        ? after
        : before;

    if (into !== undefined) {
      into.meters += run.meters;
    }

    runs = joinSame(runs.toSpliced(shortest, 1));
  }
};
