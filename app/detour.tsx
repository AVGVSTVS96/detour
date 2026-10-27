"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { RoadDetail, RoadRow } from "@/app/road";
import type { Closure } from "@/lib/closure";
import type { Point } from "@/lib/geo";
import { readJson } from "@/lib/json";
import { inReach, rank, toTime } from "@/lib/rank";
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

const Origin = ({
  pinned,
  live,
  denied,
  onStart,
}: {
  pinned: boolean;
  live: boolean;
  denied: boolean;
  onStart: () => void;
}) => {
  if (live && !pinned) {
    return (
      <span className="flex items-center gap-1.5 font-semibold">
        <span className="size-2.5 rounded-full border-2 border-ink bg-hi" />
        Live
      </span>
    );
  }

  if (denied && !pinned) {
    return <span className="text-mute">Location off</span>;
  }

  return (
    <button
      className="font-semibold underline underline-offset-2"
      onClick={onStart}
      type="button"
    >
      Use my location
    </button>
  );
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
    className={`h-9 border-2 border-ink text-sm font-semibold ${on ? "bg-hi text-[#0a0a0a]" : "bg-paper"}`}
    onClick={onClick}
    type="button"
  >
    {label}
  </button>
);

const PAGE = 30;

export const Detour = () => {
  const [tracking, setTracking] = useState(false);
  const location = useLocation(tracking);
  const [picked, setPicked] = useState<Point | null | undefined>();
  const [center, setCenter] = useState<Point | null>(null);
  const [qualities, setQualities] = useState<Quality[]>(["twisty", "scenic"]);
  const [reach, setReach] = useState(30);
  const [shown, setShown] = useState(PAGE);
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
        : inReach(roads, [lon, lat], qualities, reach),
    [roads, lon, lat, qualities, reach]
  );

  const targets = useMemo(
    () =>
      toTime(candidates).map(({ road, end: [start] }) => ({
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
        : rank(candidates, [lon, lat], reach, closures, times),
    [candidates, lon, lat, reach, closures, times]
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
          <div className="grid grid-cols-4 gap-2 border-b-2 border-ink p-3">
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
          </div>
          <div className="flex items-center justify-between gap-3 border-b-2 border-ink px-3 py-2 text-sm">
            <label className="flex items-center gap-1">
              <span>
                {origin && !loading
                  ? `${ranked.length} drives within`
                  : "Drives within"}
              </span>
              <select
                className="appearance-none bg-transparent font-semibold underline underline-offset-2"
                onChange={(event) => {
                  setReach(Number(event.target.value));
                  setShown(PAGE);
                }}
                value={reach}
              >
                {REACHES.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes} min
                  </option>
                ))}
              </select>
            </label>
            <Origin
              denied={location.status === "denied"}
              live={live !== null}
              onStart={start}
              pinned={pinned !== null}
            />
          </div>
          <ol className="min-h-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
            {!origin && (
              <li className="p-4 text-mute">
                Tap Use my location, or move the map and tap Search here.
              </li>
            )}
            {origin && !loading && ranked.length === 0 && (
              <li className="p-4 text-mute">
                No drives we know within {reach} minutes. Try a longer reach.
              </li>
            )}
            {ranked.slice(0, shown).map((item, index) => (
              <RoadRow
                index={index}
                key={item.road.id}
                onSelect={setSelectedId}
                ranked={item}
              />
            ))}
            {ranked.length > shown && (
              <li>
                <button
                  className="w-full p-4 text-left font-semibold underline underline-offset-2"
                  onClick={() => {
                    setShown(shown + PAGE);
                  }}
                  type="button"
                >
                  Show {Math.min(PAGE, ranked.length - shown)} more of{" "}
                  {ranked.length - shown}
                </button>
              </li>
            )}
          </ol>
        </section>
      )}
    </main>
  );
};
