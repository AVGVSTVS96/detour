"use client";

import { useEffect, useMemo, useState } from "react";

import type { Closure } from "@/lib/closure";
import { cellsAround, distance } from "@/lib/geo";
import type { Point } from "@/lib/geo";
import {
  ends,
  FARTHEST,
  guessMinutes,
  REACH,
  title,
  worth,
} from "@/lib/glance";
import { loadBest, loadIndex } from "@/lib/glance-data";
import { closuresOn } from "@/lib/rank";
import type { Ranked } from "@/lib/rank";
import type { Road } from "@/lib/road";
import { useDriveTimes } from "@/lib/use-drive-times";

const TIMED = 25;
const SHOWN = 8;
const PATIENCE = 2500;

const keyOf = (point: Point | null) =>
  point ? `${point[0].toFixed(2)},${point[1].toFixed(2)}` : null;

const pointOf = (key: string | null): Point | null => {
  const [lon, lat] = key?.split(",").map(Number) ?? [];

  return lon === undefined || lat === undefined ? null : [lon, lat];
};

const nearby = async (origin: Point) => {
  const { build, cells } = await loadIndex();
  const available = new Set(cells);
  const byId = new Map<string, Road>();

  const lists = await Promise.all(
    cellsAround(origin, REACH)
      .filter((key) => available.has(key))
      .map(async (key) => await loadBest(build, key))
  );

  for (const road of lists.flat()) {
    byId.set(road.id, road);
  }

  return [...byId.values()];
};

const toRanked = (
  road: Road,
  here: Point,
  times: Map<string, number>,
  closures: Closure[]
): Ranked => {
  const [start, end] = ends(road, here);
  const known = times.get(road.id);
  const minutes = known === undefined ? guessMinutes(here, start) : known / 60;
  const blocked = closuresOn(road, closures);
  const closed = blocked.some(({ kind }) => kind === "Full");

  return {
    closures: blocked,
    end,
    estimated: known === undefined,
    minutes,
    road,
    score: worth(road, minutes) * (closed ? 0.01 : 1),
    start,
  };
};

export const usePicks = (
  origin: Point | null,
  closures: Closure[],
  focus: Road | null
) => {
  const key = keyOf(origin);
  const here = useMemo(() => pointOf(key), [key]);
  const [loaded, setLoaded] = useState({ key: "", roads: new Array<Road>() });
  const [waited, setWaited] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (here !== null && key !== null) {
        const roads = await nearby(here);

        if (!cancelled) {
          setLoaded({ key, roads });
        }
      }
    };

    void load();

    const timer = setTimeout(() => {
      setWaited(key);
    }, PATIENCE);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [here, key]);

  const candidates = useMemo(() => {
    if (here === null || loaded.key !== key) {
      return [];
    }

    return loaded.roads
      .flatMap((road) => {
        const [start] = ends(road, here);
        const meters = distance(here, start);

        return meters <= REACH
          ? [{ road, start, value: worth(road, guessMinutes(here, start)) }]
          : [];
      })
      .toSorted((a, b) => b.value - a.value)
      .slice(0, TIMED);
  }, [here, key, loaded]);

  const targets = useMemo(
    () =>
      [
        ...candidates,
        ...(focus && here
          ? [{ road: focus, start: ends(focus, here)[0] }]
          : []),
      ].map(({ road, start }) => ({ id: road.id, point: start })),
    [candidates, focus, here]
  );

  const times = useDriveTimes(here, targets);

  const picks = useMemo(() => {
    if (here === null) {
      return [];
    }

    const seen = new Set<string>();

    return candidates
      .map(({ road }) => toRanked(road, here, times, closures))
      .filter(({ minutes }) => minutes <= FARTHEST)
      .toSorted((a, b) => b.score - a.score)
      .filter(({ road }) => {
        const name = title(road).toLowerCase();
        const fresh = !seen.has(name);
        seen.add(name);

        return fresh;
      })
      .slice(0, SHOWN);
  }, [candidates, closures, here, times]);

  const focused = useMemo(
    () => (focus && here ? toRanked(focus, here, times, closures) : null),
    [closures, focus, here, times]
  );

  const timed = candidates.some(({ road }) => times.has(road.id));

  return {
    focused,
    picks,
    ready:
      here !== null &&
      loaded.key === key &&
      (timed || waited === key || candidates.length === 0),
  };
};
