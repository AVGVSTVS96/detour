"use client";

import { useEffect, useState } from "react";

import { readJson } from "@/lib/json";
import type { Road, RoadIndex } from "@/lib/road";

const loaded = new Map<string, Promise<Road[]>>();
let index: Promise<RoadIndex> | undefined;

const readIndex = async () => {
  const response = await fetch("/roads/index.json", { cache: "no-cache" });

  return await readJson<RoadIndex>(response);
};

export const loadIndex = async () => {
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

export const loadCell = async (build: string, key: string) => {
  const path = `/roads/${build}/${key}.json`;
  const request = loaded.get(path) ?? readCell(path);
  loaded.set(path, request);

  return await request;
};

export const useRoads = (keys: string[]) => {
  const [result, setResult] = useState<{ key: string; roads: Road[] }>({
    key: "",
    roads: [],
  });

  const key = keys.toSorted().join(" ");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (key === "") {
        return;
      }

      const { build, cells } = await loadIndex();
      const available = new Set(cells);

      const lists = await Promise.all(
        key
          .split(" ")
          .filter((item) => available.has(item))
          .map(async (item) => await loadCell(build, item))
      );

      const byId = new Map<string, Road>();

      for (const road of lists.flat()) {
        byId.set(road.id, road);
      }

      if (!cancelled) {
        setResult({ key, roads: [...byId.values()] });
      }
    };

    load().catch(() => {
      if (!cancelled) {
        setResult((current) => ({ key, roads: current.roads }));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [key]);

  return { loading: key !== "" && result.key !== key, roads: result.roads };
};
