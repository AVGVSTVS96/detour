"use client";

import { useEffect, useMemo, useState } from "react";

import type { Closure } from "@/lib/closure";
import { cellsAround, cellsIn } from "@/lib/geo";
import type { Point } from "@/lib/geo";
import { readJson } from "@/lib/json";
import { inReach, quality, rank, toTime } from "@/lib/rank";
import type { Ranked } from "@/lib/rank";
import type { Quality, Road } from "@/lib/road";
import { useDriveTimes } from "@/lib/use-drive-times";
import { useRoads } from "@/lib/use-roads";

const FASTEST = 26.8;

const BADGES = 10;

const MOST_CELLS = 12;

interface Seen {
  bounds: [Point, Point];
  zoom: number;
}

export interface Picks {
  here: Point | null;
  qualities: Quality[];
  reach: number;
  seen: Seen | null;
  opened: Road | null;
}

const useClosures = () => {
  const [closures, setClosures] = useState<Closure[]>([]);

  useEffect(() => {
    const load = async () => {
      const response = await fetch("/api/closures");
      setClosures(response.ok ? await readJson<Closure[]>(response) : []);
    };

    load().catch(() => null);
  }, []);

  return closures;
};

const cellsFor = (picks: Picks) => {
  const { here, reach, seen } = picks;
  const near = here ? cellsAround(here, reach * 60 * FASTEST) : [];

  const inView =
    seen && seen.zoom >= 8.5 ? cellsIn(seen.bounds[0], seen.bounds[1]) : [];

  return [
    ...new Set([...near, ...(inView.length <= MOST_CELLS ? inView : [])]),
  ];
};

const storyOf = (
  opened: Road,
  ranked: Ranked[],
  from: Point,
  closures: Closure[],
  times: Map<string, number>
) =>
  ranked.find(({ road }) => road.id === opened.id) ??
  rank(
    inReach([opened], from, [], Number.POSITIVE_INFINITY),
    from,
    Number.POSITIVE_INFINITY,
    closures,
    times
  ).at(0) ??
  null;

export const useDrives = (picks: Picks) => {
  const { here, qualities, reach, opened } = picks;
  const { roads, loading } = useRoads(cellsFor(picks));
  const closures = useClosures();

  const candidates = useMemo(
    () => (here ? inReach(roads, here, qualities, reach) : []),
    [roads, here, qualities, reach]
  );

  const targets = useMemo(
    () =>
      [
        ...toTime(candidates),
        ...(opened && here
          ? inReach([opened], here, [], Number.POSITIVE_INFINITY)
          : []),
      ].map(({ road, end: [start] }) => ({ id: road.id, point: start })),
    [candidates, opened, here]
  );

  const times = useDriveTimes(here, targets);

  const ranked = useMemo(
    () => (here ? rank(candidates, here, reach, closures, times) : []),
    [candidates, here, reach, closures, times]
  );

  const story = useMemo(
    () =>
      opened
        ? storyOf(opened, ranked, here ?? opened.line[0], closures, times)
        : null,
    [opened, ranked, here, closures, times]
  );

  const drawn = useMemo(
    () =>
      (opened && !roads.includes(opened) ? [...roads, opened] : roads).map(
        (road) => ({ road, value: quality(road, qualities) })
      ),
    [roads, opened, qualities]
  );

  const badges = useMemo(
    () =>
      ranked.slice(0, BADGES).map(({ road }, index) => ({
        id: road.id,
        point: road.line[Math.floor(road.line.length / 2)] ?? road.line[0],
        rank: index + 1,
      })),
    [ranked]
  );

  return { badges, drawn, loading, ranked, story };
};
