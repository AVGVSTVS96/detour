"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { PointerEvent, ReactNode, RefObject } from "react";

import { Answer } from "@/app/answer";
import { Search } from "@/app/search";
import { Sketch } from "@/app/sketch";
import type { Closure } from "@/lib/closure";
import type { Point } from "@/lib/geo";
import { title } from "@/lib/glance";
import type { FoundPlace, FoundRoad } from "@/lib/glance";
import { loadAll, loadBest, loadIndex } from "@/lib/glance-data";
import { readJson } from "@/lib/json";
import { appleMaps, googleMaps } from "@/lib/rank";
import type { Ranked } from "@/lib/rank";
import type { Road } from "@/lib/road";
import { useLocation } from "@/lib/use-location";
import { usePicks } from "@/lib/use-picks";
import { useWakeLock } from "@/lib/use-wake-lock";

interface Spot {
  name: string;
  at: Point;
}

const pointFromSearch = (search: string): Point | null => {
  const at = new URLSearchParams(search).get("at")?.split(",").map(Number);

  if (at?.length === 2 && at.every(Number.isFinite)) {
    return [at[1] ?? 0, at[0] ?? 0];
  }

  return null;
};

const onPopState = (notify: () => void) => {
  window.addEventListener("popstate", notify);

  return () => {
    window.removeEventListener("popstate", notify);
  };
};

const findRoad = async ({ name, cell, miles }: FoundRoad) => {
  const { build } = await loadIndex();

  const match = (roads: Road[]) =>
    roads.find((road) => title(road) === name && road.miles === miles);

  const best = await loadBest(build, cell);

  return match(best.roads) ?? match(await loadAll(build, cell));
};

const labelOf = (focused: boolean, spot: Spot | null) => {
  if (focused) {
    return `From ${spot ? spot.name : "you"}`;
  }

  return spot ? `Near ${spot.name}` : "Near you";
};

const waitingFor = (located: boolean, denied: boolean, ready: boolean) => {
  if (!located) {
    return denied
      ? "Location is off. Search a town to see drives near it."
      : "Finding where you are…";
  }

  return ready ? "No drives we know within 90 min." : "Finding the best drive…";
};

const Waiting = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-col gap-3">
    <p className="min-h-[2lh] text-[1.875rem] leading-[1.1] font-black tracking-tight">
      {children}
    </p>
    <p className="min-h-[7.75rem] text-lg text-mute">
      detour ranks the twisty, scenic, smooth and quiet roads within an hour and
      a half.
    </p>
  </div>
);

const Pager = ({
  index,
  count,
  onPage,
}: {
  index: number;
  count: number;
  onPage: (step: number) => void;
}) => (
  <div className="flex items-center">
    <button
      aria-label="Previous drive"
      className="size-12 border-[3px] border-ink text-2xl font-black"
      onClick={() => {
        onPage(-1);
      }}
      type="button"
    >
      ‹
    </button>
    <span className="w-16 text-center text-base font-bold tabular-nums">
      {index + 1} of {count}
    </span>
    <button
      aria-label="Next drive"
      className="size-12 border-[3px] border-ink text-2xl font-black"
      onClick={() => {
        onPage(1);
      }}
      type="button"
    >
      ›
    </button>
  </div>
);

const Go = ({ ranked, apple }: { ranked: Ranked | null; apple: boolean }) => {
  const first = apple
    ? { href: ranked && appleMaps(ranked), name: "Apple Maps" }
    : { href: ranked && googleMaps(ranked), name: "Google Maps" };

  const second = apple
    ? { href: ranked && googleMaps(ranked), name: "Google Maps" }
    : { href: ranked && appleMaps(ranked), name: "Apple Maps" };

  const live = ranked !== null;

  return (
    <nav
      aria-label="Directions"
      className={`grid shrink-0 grid-cols-[1fr_7.5rem] gap-3 px-4 pt-1 pb-[max(16px,env(safe-area-inset-bottom))] ${live ? "" : "pointer-events-none opacity-40"}`}
    >
      <a
        className="flex h-16 items-center justify-between border-[3px] border-ink bg-hi px-4 text-[#0a0a0a] shadow-[4px_4px_0_var(--color-ink)] active:translate-1 active:shadow-none"
        href={first.href ?? "#"}
      >
        <span className="text-[1.75rem] font-black tracking-tight">Go</span>
        <span className="text-base font-bold">{first.name}</span>
      </a>
      <a
        className="flex h-16 items-center justify-center border-[3px] border-ink px-2 text-center text-base leading-tight font-bold"
        href={second.href ?? "#"}
      >
        {second.name}
      </a>
    </nav>
  );
};

const SearchBar = ({
  context,
  input,
  query,
  searching,
  onOpen,
  onClose,
  onClear,
  onQuery,
}: {
  context: string | null;
  input: RefObject<HTMLInputElement | null>;
  query: string;
  searching: boolean;
  onOpen: () => void;
  onClose: () => void;
  onClear: () => void;
  onQuery: (query: string) => void;
}) => (
  <header className="flex shrink-0 gap-2 p-3 pt-[max(12px,env(safe-area-inset-top))]">
    <h1 className="flex h-14 items-center bg-ink px-3 text-xl font-black tracking-tight text-paper">
      detour
    </h1>
    <div className="relative flex min-w-0 flex-1">
      <input
        aria-label="Search a road or town"
        autoComplete="off"
        className="h-14 w-full min-w-0 border-[3px] border-ink bg-paper pr-14 pl-3 text-lg font-semibold outline-none focus:bg-hi/20"
        enterKeyHint="search"
        onChange={(event) => {
          onQuery(event.target.value);
        }}
        onFocus={onOpen}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onClose();
          }
        }}
        placeholder={context ?? "Road or town"}
        ref={input}
        type="search"
        value={query}
      />
      {(searching || context !== null) && (
        <button
          aria-label={searching ? "Close search" : "Back to drives near you"}
          className="absolute top-0 right-0 size-14 text-3xl font-black"
          onClick={searching ? onClose : onClear}
          type="button"
        >
          ×
        </button>
      )}
    </div>
  </header>
);

export const Detour = () => {
  const location = useLocation(true);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [focus, setFocus] = useState<Road | null>(null);
  const [shownId, setShownId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [closures, setClosures] = useState<Closure[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const swipe = useRef<number | null>(null);

  useWakeLock(true);

  const search = useSyncExternalStore(
    onPopState,
    () => window.location.search,
    () => ""
  );

  const apple = useSyncExternalStore(
    onPopState,
    () => /iPhone|iPad|Macintosh/u.test(navigator.userAgent),
    () => true
  );

  useEffect(() => {
    void fetch("/api/closures")
      .then(async (response) =>
        response.ok ? await readJson<Closure[]>(response) : []
      )
      .then(setClosures)
      .catch(() => null);
  }, []);

  const live = location.status === "live" ? location.point : null;
  const origin = spot?.at ?? pointFromSearch(search) ?? live;
  const { picks, focused, ready, towns } = usePicks(origin, closures, focus);

  const index = Math.max(
    0,
    picks.findIndex(({ road }) => road.id === shownId)
  );

  const shown = focused ?? (ready ? (picks[index] ?? null) : null);

  const page = (step: number) => {
    const next = picks[(index + step + picks.length) % picks.length];

    setShownId(next?.road.id ?? null);
  };

  const close = () => {
    setSearching(false);
    setQuery("");
    input.current?.blur();
  };

  const home = () => {
    close();
    setSpot(null);
    setFocus(null);
    setShownId(null);
  };

  const pickRoad = async (found: FoundRoad) => {
    close();
    setFocus((await findRoad(found)) ?? null);
  };

  const pickPlace = ({ name, at }: FoundPlace) => {
    close();
    setFocus(null);
    setShownId(null);
    setSpot({ at, name });
  };

  const startSwipe = (event: PointerEvent) => {
    swipe.current = event.clientX;
  };

  const endSwipe = (event: PointerEvent) => {
    const moved = event.clientX - (swipe.current ?? event.clientX);

    swipe.current = null;

    if (!focused && Math.abs(moved) > 60 && picks.length > 1) {
      page(moved < 0 ? 1 : -1);
    }
  };

  const context = focus ? title(focus) : (spot?.name ?? null);

  return (
    <main className="mx-auto flex h-dvh max-w-[30rem] flex-col">
      <SearchBar
        context={context}
        input={input}
        onClear={home}
        onClose={close}
        onOpen={() => {
          setSearching(true);
        }}
        onQuery={setQuery}
        query={query}
        searching={searching}
      />

      {searching ? (
        <section
          aria-label="Search results"
          className="min-h-0 flex-1 overflow-y-auto border-t-[3px] border-ink"
        >
          <Search
            onPlace={pickPlace}
            onRoad={(row) => {
              void pickRoad(row);
            }}
            origin={origin}
            query={query}
          />
        </section>
      ) : (
        <>
          <div className="min-h-0 flex-1 border-y-[3px] border-ink">
            <Sketch
              origin={origin}
              picks={picks}
              place={spot?.name ?? null}
              shown={shown}
              towns={towns}
            />
          </div>
          <section
            aria-label="Best drive"
            className="shrink-0 touch-pan-y px-4 pt-3 pb-4"
            onPointerDown={startSwipe}
            onPointerUp={endSwipe}
          >
            <div className="mb-2 flex h-12 items-center justify-between gap-2">
              <p className="truncate text-base font-bold tracking-wide uppercase">
                {labelOf(focused !== null, spot)}
              </p>
              {!focused && shown && picks.length > 1 && (
                <Pager count={picks.length} index={index} onPage={page} />
              )}
            </div>
            {shown && origin ? (
              <Answer detail={focused !== null} from={origin} ranked={shown} />
            ) : (
              <Waiting>
                {waitingFor(
                  origin !== null,
                  location.status === "denied",
                  ready
                )}
              </Waiting>
            )}
          </section>
          <Go apple={apple} ranked={shown} />
        </>
      )}
    </main>
  );
};
