"use client";

import { useEffect, useMemo, useState } from "react";

import type { Point } from "@/lib/geo";
import { readJson } from "@/lib/json";

interface Table {
  code: string;
  durations: (number | null)[][];
}

export const useDriveTimes = (
  origin: Point | null,
  targets: { id: string; point: Point }[]
) => {
  const [known, setKnown] = useState(new Map<string, number>());

  const prefix = useMemo(
    () => (origin ? `${origin[0].toFixed(2)},${origin[1].toFixed(2)}:` : ""),
    [origin]
  );

  const missing = useMemo(
    () => (origin ? targets.filter(({ id }) => !known.has(prefix + id)) : []),
    [origin, targets, known, prefix]
  );

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      if (!origin || missing.length === 0) {
        return;
      }

      const coordinates = [origin, ...missing.map(({ point }) => point)]
        .map(([lon, lat]) => `${lon},${lat}`)
        .join(";");

      const response = await fetch(
        `https://router.project-osrm.org/table/v1/driving/${coordinates}?sources=0&annotations=duration`,
        { signal: controller.signal }
      );

      const table = await readJson<Table>(response);

      if (table.code !== "Ok") {
        return;
      }

      const found = new Map<string, number>();

      for (const [index, { id }] of missing.entries()) {
        const seconds = table.durations[0]?.[index + 1] ?? null;

        if (seconds !== null) {
          found.set(prefix + id, seconds);
        }
      }

      if (found.size > 0) {
        setKnown((current) => new Map([...current, ...found]));
      }
    };

    load().catch(() => null);

    return () => {
      controller.abort();
    };
  }, [origin, missing, prefix]);

  return useMemo(() => {
    const times = new Map<string, number>();

    for (const { id } of targets) {
      const seconds = known.get(prefix + id);

      if (seconds !== undefined) {
        times.set(id, seconds);
      }
    }

    return times;
  }, [targets, known, prefix]);
};
