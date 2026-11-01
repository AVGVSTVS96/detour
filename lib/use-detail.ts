"use client";

import { useEffect, useState } from "react";

import type { Point } from "@/lib/geo";
import { readJson } from "@/lib/json";
import { unpackDetail } from "@/lib/road";
import type { DetailFile } from "@/lib/road";
import { loadIndex } from "@/lib/use-roads";

export const DETAIL_ZOOM = 12;

const loaded = new Map<string, Promise<Map<string, Point[]>>>();

const readDetail = async (path: string) => {
  const response = await fetch(path);

  return response.ok
    ? unpackDetail(await readJson<DetailFile>(response))
    : new Map<string, Point[]>();
};

const loadDetail = async (build: string, key: string) => {
  const path = `/roads/${build}/${key}.detail.json`;
  const request = loaded.get(path) ?? readDetail(path);
  loaded.set(path, request);

  return await request;
};

export const useDetail = (keys: string[]) => {
  const [detail, setDetail] = useState(new Map<string, Point[]>());
  const key = keys.toSorted().join(" ");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (key === "") {
        return;
      }

      const { build, cells } = await loadIndex();
      const available = new Set(cells);

      const found = await Promise.all(
        key
          .split(" ")
          .filter((item) => available.has(item))
          .map(async (item) => await loadDetail(build, item))
      );

      if (!cancelled) {
        setDetail(
          (current) =>
            new Map([...current, ...found.flatMap((lines) => [...lines])])
        );
      }
    };

    load().catch(() => null);

    return () => {
      cancelled = true;
    };
  }, [key]);

  return detail;
};
