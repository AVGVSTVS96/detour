"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { PointerEvent, ReactNode, RefObject } from "react";

import { Answer, OnRoadAnswer } from "@/app/answer";
import { Search } from "@/app/search";
import { Sketch } from "@/app/sketch";
import type { Closure } from "@/lib/closure";
import type { Point } from "@/lib/geo";
import { appleTo, googleTo, title } from "@/lib/glance";
import type { FoundPlace, FoundRoad } from "@/lib/glance";
import { loadAll, loadBest, loadIndex } from "@/lib/glance-data";
import { readJson } from "@/lib/json";
import type { OnRoad } from "@/lib/on-road";
import { appleMaps, closuresOn, googleMaps } from "@/lib/rank";
import type { Ranked } from "@/lib/rank";
import type { Road } from "@/lib/road";
import { useLocation } from "@/lib/use-location";
import { useOnRoad } from "@/lib/use-on-road";
import { usePicks } from "@/lib/use-picks";
import { useWakeLock } from "@/lib/use-wake-lock";

interface Spot {
  name: string;
  at: Point;
}

type Page =
  | { kind: "pick"; ranked: Ranked }
  | { kind: "on"; ranked: Ranked; on: OnRoad };

interface Links {
  apple: string;
  google: string;
}

const linksOf = (page: Page | null): Links | null => {
  if (page === null) {
    return null;
  }

  return page.kind === "on"
    ? { apple: appleTo(page.on.end), google: googleTo(page.on.end) }
    : { apple: appleMaps(page.ranked), google: googleMaps(page.ranked) };
};

const onRoadPage = (
  on: OnRoad | null,
  at: Point | null,
  closures: Closure[]
): Page[] =>
  on && at
    ? [
        {
          kind: "on",
          on,
          ranked: {
            closures: closuresOn(on.road, closures),
            end: on.end,
            estimated: false,
            minutes: 0,
            road: {
              ...on.road,
              line: on.line,
              miles: on.left,
              paving: on.ahead,
            },
            score: 0,
            start: at,
          },
        },
      ]
    : [];

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

const pagesOf = (
  focused: Ranked | null,
  driving: Page[],
  picks: Ranked[]
): Page[] => {
  if (focused) {
    return [{ kind: "pick", ranked: focused }];
  }

  const skip = new Set(driving.map(({ ranked }) => ranked.road.id));

  return [
    ...driving,
    ...picks.flatMap((ranked): Page[] =>
      skip.has(ranked.road.id) ? [] : [{ kind: "pick", ranked }]
    ),
  ];
};

const sketchFrom = (
  current: Page | null,
  live: Point | null,
  origin: Point | null
) =>
  current?.kind === "on"
    ? { behind: current.on.road.line, from: live }
    : { behind: null, from: origin };

const labelOf = (page: Page | null, focused: boolean, spot: Spot | null) => {
  if (page?.kind === "on") {
    return "You're on";
  }

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

const Waiting = ({
  children,
  onSearch,
}: {
  children: ReactNode;
  onSearch: (() => void) | null;
}) => (
  <div className="flex flex-col gap-3">
    <p className="min-h-[2lh] text-[1.875rem] leading-[1.1] font-black tracking-tight">
      {children}
    </p>
    {onSearch ? (
      <button
        className="h-14 border-[3px] border-ink bg-hi text-lg font-bold text-[#0a0a0a]"
        onClick={onSearch}
        type="button"
      >
        Search a town
      </button>
    ) : (
      <p className="min-h-[7.75rem] text-lg text-mute">
        detour ranks the twisty, scenic, smooth and quiet roads within an hour
        and a half.
      </p>
    )}
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

const Go = ({ links, apple }: { links: Links | null; apple: boolean }) => {
  const first = apple
    ? { href: links?.apple, name: "Apple Maps" }
    : { href: links?.google, name: "Google Maps" };

  const second = apple
    ? { href: links?.google, name: "Google Maps" }
    : { href: links?.apple, name: "Apple Maps" };

  const live = links !== null;

  return (
    <nav
      aria-label="Directions"
      className={`grid shrink-0 grid-cols-[1fr_7.5rem] gap-3 px-4 pt-1 pb-[max(16px,env(safe-area-inset-bottom))] dash:col-start-2 dash:row-start-3 dash:border-l-[3px] dash:border-ink dash:pr-[max(16px,env(safe-area-inset-right))] ${live ? "" : "pointer-events-none opacity-40"}`}
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
  <header className="flex shrink-0 gap-2 p-3 pt-[max(12px,env(safe-area-inset-top))] dash:col-start-1 dash:row-start-1 dash:pl-[max(12px,env(safe-area-inset-left))]">
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

const Shown = ({
  current,
  origin,
  detail,
  denied,
  ready,
  onSearch,
}: {
  current: Page | null;
  origin: Point | null;
  detail: boolean;
  denied: boolean;
  ready: boolean;
  onSearch: () => void;
}) => (
  <>
    {current?.kind === "on" && (
      <OnRoadAnswer closures={current.ranked.closures} on={current.on} />
    )}
    {current?.kind === "pick" && origin && (
      <Answer detail={detail} from={origin} ranked={current.ranked} />
    )}
    {current === null && (
      <Waiting onSearch={denied && origin === null ? onSearch : null}>
        {waitingFor(origin !== null, denied, ready)}
      </Waiting>
    )}
  </>
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
  const on = useOnRoad(location);
  const driving = spot === null && focus === null ? on : null;

  const pages = pagesOf(
    focused,
    onRoadPage(driving, live, closures),
    ready ? picks : []
  );

  const index = Math.max(
    0,
    pages.findIndex(({ ranked }) => ranked.road.id === shownId)
  );

  const current = pages[index] ?? null;
  const shown = current?.ranked ?? null;
  const view = sketchFrom(current, live, origin);

  const page = (step: number) => {
    const next = pages[(index + step + pages.length) % pages.length];

    setShownId(next?.ranked.road.id ?? null);
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

    if (Math.abs(moved) > 60 && pages.length > 1) {
      page(moved < 0 ? 1 : -1);
    }
  };

  const context = focus ? title(focus) : (spot?.name ?? null);

  return (
    <main className="mx-auto flex h-dvh max-w-[30rem] flex-col dash:grid dash:max-w-none dash:grid-cols-[1fr_25rem] dash:grid-rows-[auto_1fr_auto]">
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
          className="min-h-0 flex-1 overflow-y-auto border-t-[3px] border-ink dash:col-span-2 dash:row-span-2 dash:row-start-2"
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
          <div className="min-h-0 flex-1 border-y-[3px] border-ink dash:col-start-1 dash:row-span-2 dash:row-start-2 dash:border-b-0">
            <Sketch
              origin={view.from}
              behind={view.behind}
              picks={picks}
              place={spot?.name ?? null}
              shown={shown}
              towns={towns}
            />
          </div>
          <section
            aria-label="Best drive"
            className="shrink-0 touch-pan-y px-4 pt-3 pb-4 dash:col-start-2 dash:row-span-2 dash:row-start-1 dash:self-stretch dash:border-l-[3px] dash:border-ink dash:pr-[max(16px,env(safe-area-inset-right))]"
            onPointerDown={startSwipe}
            onPointerUp={endSwipe}
          >
            <div className="mb-2 flex h-12 items-center justify-between gap-2">
              <p className="truncate text-base font-bold tracking-wide uppercase">
                {labelOf(current, focused !== null, spot)}
              </p>
              {pages.length > 1 && (
                <Pager count={pages.length} index={index} onPage={page} />
              )}
            </div>
            <Shown
              current={current}
              denied={location.status === "denied"}
              detail={focused !== null}
              onSearch={() => {
                input.current?.focus();
              }}
              origin={origin}
              ready={ready}
            />
          </section>
          <Go apple={apple} links={linksOf(current)} />
        </>
      )}
    </main>
  );
};
