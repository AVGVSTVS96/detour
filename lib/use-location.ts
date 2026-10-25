"use client";

import { useEffect, useState } from "react";

import type { Point } from "@/lib/geo";

export type LocationState =
  | { status: "waiting" }
  | { status: "denied"; message: string }
  | { status: "live"; point: Point; heading: number | null };

export const useLocation = (enabled: boolean) => {
  const [state, setState] = useState<LocationState>({ status: "waiting" });

  useEffect(() => {
    const watch = enabled
      ? navigator.geolocation.watchPosition(
          ({ coords }) => {
            setState({
              heading: coords.heading,
              point: [coords.longitude, coords.latitude],
              status: "live",
            });
          },
          (error) => {
            setState({ message: error.message, status: "denied" });
          },
          { enableHighAccuracy: true, maximumAge: 10_000 }
        )
      : null;

    return () => {
      if (watch !== null) {
        navigator.geolocation.clearWatch(watch);
      }
    };
  }, [enabled]);

  return state;
};
