"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import type { Point } from "@/lib/geo";
import { useLocation } from "@/lib/use-location";

export interface Pin {
  name: string;
  point: Point;
}

const rounded = (point: Point): Point => [
  Math.round(point[0] * 100) / 100,
  Math.round(point[1] * 100) / 100,
];

const pointFromUrl = (query: string): Point | null => {
  const at = new URLSearchParams(query).get("at")?.split(",").map(Number);

  if (at?.length === 2 && at.every(Number.isFinite)) {
    return [at[1] ?? 0, at[0] ?? 0];
  }

  return null;
};

const subscribe = (notify: () => void) => {
  window.addEventListener("popstate", notify);

  return () => {
    window.removeEventListener("popstate", notify);
  };
};

const usePermission = () => {
  const [state, setState] = useState<PermissionState | "checking">("checking");

  useEffect(() => {
    const check = async () => {
      const status = await navigator.permissions.query({ name: "geolocation" });
      setState(status.state);
    };

    check().catch(() => {
      setState("prompt");
    });
  }, []);

  return state;
};

export const useOrigin = () => {
  const permission = usePermission();
  const [asked, setAsked] = useState(false);
  const tracking = asked || permission === "granted";
  const location = useLocation(tracking);
  const [picked, setPicked] = useState<Pin | null | undefined>();

  const url = useSyncExternalStore(
    subscribe,
    () => window.location.search,
    () => ""
  );

  const fromUrl = pointFromUrl(url);

  const pin =
    picked === undefined
      ? fromUrl && { name: "the spot you picked", point: fromUrl }
      : picked;

  const live = location.status === "live" ? location.point : null;
  const exact = pin?.point ?? live;
  const [lon, lat] = exact ? rounded(exact) : [null, null];

  const here = useMemo<Point | null>(
    () => (lon === null || lat === null ? null : [lon, lat]),
    [lon, lat]
  );

  const denied = location.status === "denied" || permission === "denied";

  return {
    denied,
    follow: () => {
      setAsked(true);
      setPicked(null);
    },
    here,
    live,
    pick: setPicked,
    pin,
    settled: permission !== "checking" && !(tracking && here === null),
    tracking,
  };
};
