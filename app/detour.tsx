"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { RoadDetail, RoadRow } from "@/app/road";
import type { Closure } from "@/lib/closure";
import type { Point } from "@/lib/geo";
import { readJson } from "@/lib/json";
import { rank, shortlist } from "@/lib/rank";
import { QUALITIES } from "@/lib/road";
import type { Quality } from "@/lib/road";
import { useDriveTimes } from "@/lib/use-drive-times";
import { useLocation } from "@/lib/use-location";
import { useRoads } from "@/lib/use-roads";
import { useWakeLock } from "@/lib/use-wake-lock";

const MapView = dynamic(
  async () => {
    const view = await import("@/app/map-view");

    return view.MapView;
  },
  { ssr: false }
);

const REACHES = [15, 30, 60, 90];

const FASTEST = 26.8;

const rounded = (point: Point): Point => [
  Math.round(point[0] * 100) / 100,
  Math.round(point[1] * 100) / 100,
];

const pointFromSearch = (search: string): Point | null => {
  const at = new URLSearchParams(search).get("at")?.split(",").map(Number);

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

const OriginNote = ({
  pinned,
  live,
  denied,
}: {
  pinned: boolean;
  live: boolean;
  denied: boolean;
}) => {
  if (pinned) {
    return "From the spot you picked";
  }

  if (live) {
    return "From where you are, live";
  }

  return denied
    ? "Location is off. Move the map and tap Search here."
    : "Tap Use my location, or move the map and tap Search here.";
};

const Chip = ({
  on,
  label,
  onClick,
}: {
  on: boolean;
  label: string;
  onClick: () => void;
}) => (
  <button
    className={`h-9 shrink-0 border-2 border-ink px-3 text-sm font-semibold ${on ? "bg-hi text-[#0a0a0a]" : "bg-paper"}`}
    onClick={onClick}
    type="button"
  >
    {label}
  </button>
);

export const Detour = () => {
  const [tracking, setTracking] = useState(false);
  const location = useLocation(tracking);
  const [picked, setPicked] = useState<Point | null | undefined>();
  const [center, setCenter] = useState<Point | null>(null);
  const [qualities, setQualities] = useState<Quality[]>(["twisty", "scenic"]);
  const [reach, setReach] = useState(30);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [closures, setClosures] = useState<Closure[]>([]);
  const [screenOn, setScreenOn] = useWakeLock();

  const search = useSyncExternalStore(
    subscribe,
    () => window.location.search,
    () => ""
  );

  const pinned = picked === undefined ? pointFromSearch(search) : picked;

  const live = location.status === "live" ? location.point : null;
  const origin = pinned ?? live;
  const [lon, lat] = origin ? rounded(origin) : [null, null];
  const { roads, loading } = useRoads(lon, lat, reach * 60 * FASTEST);

  useEffect(() => {
    void fetch("/api/closures")
      .then(async (response) =>
        response.ok ? await readJson<Closure[]>(response) : []
      )
      .then(setClosures);
  }, []);

  const here = useMemo<Point | null>(
    () => (lon === null || lat === null ? null : [lon, lat]),
    [lon, lat]
  );

  const candidates = useMemo(
    () =>
      lon === null || lat === null
        ? []
        : shortlist(roads, [lon, lat], qualities, reach),
    [roads, lon, lat, qualities, reach]
  );

  const targets = useMemo(
    () =>
      candidates.map(({ road, end: [start] }) => ({
        id: road.id,
        point: start,
      })),
    [candidates]
  );

  const times = useDriveTimes(here, targets);

  const ranked = useMemo(
    () =>
      lon === null || lat === null
        ? []
        : rank(candidates, [lon, lat], qualities, reach, closures, times),
    [candidates, lon, lat, qualities, reach, closures, times]
  );

  const selected = ranked.find(({ road }) => road.id === selectedId) ?? null;

  const toggle = (quality: Quality) => {
    setQualities((current) =>
      current.includes(quality)
        ? current.filter((item) => item !== quality)
        : [...current, quality]
    );
  };

  const start = () => {
    setTracking(true);
    setPicked(null);
    setScreenOn(true);
  };

  return (
    <main className="flex h-dvh flex-col">
      <div className="relative h-[46dvh] shrink-0 border-b-2 border-ink">
        <MapView
          onMove={setCenter}
          onSelect={setSelectedId}
          origin={origin}
          ranked={ranked}
          selected={selected}
        />
        <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3 pt-[max(12px,env(safe-area-inset-top))]">
          <h1 className="pointer-events-auto border-2 border-ink bg-paper px-2 py-0.5 text-xl font-black tracking-tight">
            detour
          </h1>
          <div className="pointer-events-auto flex gap-2">
            {center && (
              <button
                className="h-9 border-2 border-ink bg-paper px-3 text-sm font-semibold"
                onClick={() => {
                  setPicked(center);
                  setSelectedId(null);
                }}
                type="button"
              >
                Search here
              </button>
            )}
            <button
              className={`h-9 border-2 border-ink px-3 text-sm font-semibold ${screenOn ? "bg-hi text-[#0a0a0a]" : "bg-paper"}`}
              onClick={() => {
                setScreenOn(!screenOn);
              }}
              type="button"
            >
              {screenOn ? "Screen stays on" : "Keep screen on"}
            </button>
          </div>
        </header>
      </div>

      {selected ? (
        <RoadDetail
          onBack={() => {
            setSelectedId(null);
          }}
          ranked={selected}
        />
      ) : (
        <section className="flex min-h-0 flex-1 flex-col">
          <div className="flex gap-2 overflow-x-auto border-b-2 border-ink p-3">
            {QUALITIES.map((quality) => (
              <Chip
                key={quality}
                label={quality[0].toUpperCase() + quality.slice(1)}
                on={qualities.includes(quality)}
                onClick={() => {
                  toggle(quality);
                }}
              />
            ))}
            <span className="w-1 shrink-0" />
            {REACHES.map((minutes) => (
              <Chip
                key={minutes}
                label={`${minutes} min`}
                on={reach === minutes}
                onClick={() => {
                  setReach(minutes);
                }}
              />
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 border-b-2 border-ink px-3 py-2 text-sm">
            <span className="text-mute">
              <OriginNote
                denied={location.status === "denied"}
                live={live !== null}
                pinned={pinned !== null}
              />
            </span>
            {(pinned !== null || !tracking) && (
              <button
                className="shrink-0 font-semibold underline underline-offset-2"
                onClick={start}
                type="button"
              >
                Use my location
              </button>
            )}
          </div>
          <ol className="min-h-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
            {origin && !loading && ranked.length === 0 && (
              <li className="p-4 text-mute">
                No good roads we know within {reach} minutes. Try a longer
                drive.
              </li>
            )}
            {ranked.slice(0, 40).map((item, index) => (
              <RoadRow
                index={index}
                key={item.road.id}
                onSelect={setSelectedId}
                ranked={item}
              />
            ))}
          </ol>
        </section>
      )}
    </main>
  );
};
