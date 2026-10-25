"use client";

import { useEffect, useState } from "react";

import { cellsAround } from "@/lib/geo";
import { readJson } from "@/lib/json";
import type { Road, RoadIndex } from "@/lib/road";

const loaded = new Map<string, Promise<Road[]>>();
let index: Promise<RoadIndex> | undefined;

const readIndex = async () => {
  const response = await fetch("/roads/index.json", { cache: "no-cache" });

  return await readJson<RoadIndex>(response);
};

const loadIndex = async () => {
  index ??= readIndex();

  return await index;
};

const readCell = async (path: string) => {
  const response = await fetch(path);

  if (!response.ok) {
    return [];
  }

  return await readJson<Road[]>(response);
};

const cell = async (build: string, key: string) => {
  const path = `/roads/${build}/${key}.json`;
  const request = loaded.get(path) ?? readCell(path);
  loaded.set(path, request);

  return await request;
};

export const useRoads = (
  lon: number | null,
  lat: number | null,
  reach: number
) => {
  const [result, setResult] = useState<{ key: string; roads: Road[] }>({
    key: "",
    roads: [],
  });

  const key = lon === null || lat === null ? null : `${lon},${lat},${reach}`;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (key === null || lon === null || lat === null) {
        return;
      }

      const { build, cells } = await loadIndex();
      const available = new Set(cells);

      const keys = cellsAround([lon, lat], reach).filter((item) =>
        available.has(item)
      );

      const byId = new Map<string, Road>();

      for (const list of await Promise.all(
        keys.map(async (item) => await cell(build, item))
      )) {
        for (const road of list) {
          byId.set(road.id, road);
        }
      }

      if (!cancelled) {
        setResult({ key, roads: [...byId.values()] });
      }
    };

    load().catch(() => {
      if (key !== null && !cancelled) {
        setResult((current) => ({ key, roads: current.roads }));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [key, lon, lat, reach]);

  return { loading: key !== null && result.key !== key, roads: result.roads };
};
