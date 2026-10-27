"use client";

import { useEffect, useMemo, useState } from "react";

import { cellOf } from "@/lib/geo";
import { loadAll, loadIndex } from "@/lib/glance-data";
import { onRoad } from "@/lib/on-road";
import type { Road } from "@/lib/road";
import type { LocationState } from "@/lib/use-location";

const DRIVING = 3;

export const useOnRoad = (location: LocationState) => {
  const live = location.status === "live" ? location : null;
  const moving = (live?.speed ?? 0) >= DRIVING;
  const [engaged, setEngaged] = useState(false);
  const [loaded, setLoaded] = useState({ key: "", roads: new Array<Road>() });
  const key = engaged && live ? cellOf(live.point) : null;

  if (moving && !engaged) {
    setEngaged(true);
  }

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (key !== null) {
        const { build, cells } = await loadIndex();
        const roads = cells.includes(key) ? await loadAll(build, key) : [];

        if (!cancelled) {
          setLoaded({ key, roads });
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [key]);

  return useMemo(
    () =>
      live && loaded.key === key
        ? onRoad(loaded.roads, live.point, live.heading)
        : null,
    [key, live, loaded]
  );
};
