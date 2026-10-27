"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { UIEvent } from "react";

import type { Camera, View } from "@/app/map-view";
import { Card, Story } from "@/app/road";
import { Results } from "@/app/search";
import { cellOf, distance, lineDistance } from "@/lib/geo";
import type { Point } from "@/lib/geo";
import type { Ranked } from "@/lib/rank";
import { QUALITIES } from "@/lib/road";
import type { Quality, Road } from "@/lib/road";
import type { Listing } from "@/lib/search";
import { useDrives } from "@/lib/use-drives";
import { useOrigin } from "@/lib/use-origin";
import { loadCell, loadIndex } from "@/lib/use-roads";
import { useSearch } from "@/lib/use-search";
import { useWakeLock } from "@/lib/use-wake-lock";

const MapView = dynamic(
  async () => {
    const view = await import("@/app/map-view");

    return view.MapView;
  },
  { ssr: false }
);

const REACHES = [15, 30, 60, 90, 120];

const CARDS = 20;

const AWAY = 15_000;

const GAP = 8;

const CHIP =
  "flex h-11 items-center justify-center border-2 border-ink font-semibold";

const around = ([lon, lat]: Point): Point[] => [
  [lon - 0.25, lat - 0.2],
  [lon + 0.25, lat + 0.2],
];

const findRoad = async (listing: Listing) => {
  const [name, ref, , at] = listing;
  const { build } = await loadIndex();
  const roads = await loadCell(build, cellOf(at));

  return (
    roads
      .filter((road) => road.name === name && road.ref === ref)
      .toSorted((a, b) => lineDistance(at, a.line) - lineDistance(at, b.line))
      .at(0) ?? null
  );
};

const Legend = () => (
  <ul className="flex w-fit items-center gap-3 border-2 border-ink bg-paper px-2 py-1 leading-6 font-semibold">
    <li className="flex items-center gap-1">
      <span aria-hidden className="h-1 w-3 bg-smooth" />
      Smooth
    </li>
    <li className="flex items-center gap-1">
      <span aria-hidden className="h-1 w-3 bg-fair" />
      Fair
    </li>
    <li className="flex items-center gap-1">
      <span aria-hidden className="h-1 w-3 bg-rough" />
      Rough
    </li>
    <li className="flex items-center gap-1">
      <span
        aria-hidden
        className="h-1 w-3 border-t-4 border-dotted border-unknown"
      />
      No data
    </li>
  </ul>
);

const Reach = ({
  reach,
  onReach,
}: {
  reach: number;
  onReach: (minutes: number) => void;
}) => (
  <label className="relative shrink-0">
    <span className="sr-only">How far to drive</span>
    <select
      className={`${CHIP} h-12 appearance-none bg-paper pr-7 pl-3`}
      onChange={(event) => {
        onReach(Number(event.target.value));
      }}
      value={reach}
    >
      {REACHES.map((minutes) => (
        <option key={minutes} value={minutes}>
          {minutes < 60 ? `${minutes} min` : `${minutes / 60} h`}
        </option>
      ))}
    </select>
    <span
      aria-hidden
      className="pointer-events-none absolute top-3 right-2.5 font-bold"
    >
      ▾
    </span>
  </label>
);

const Picker = ({
  qualities,
  onToggle,
}: {
  qualities: Quality[];
  onToggle: (quality: Quality) => void;
}) => (
  <div className="grid grid-cols-4 gap-2 px-3">
    {QUALITIES.map((quality) => (
      <button
        aria-pressed={qualities.includes(quality)}
        className={`${CHIP} ${qualities.includes(quality) ? "bg-ink text-paper" : "bg-paper"}`}
        key={quality}
        onClick={() => {
          onToggle(quality);
        }}
        type="button"
      >
        {quality[0].toUpperCase() + quality.slice(1)}
      </button>
    ))}
  </div>
);

const Rail = ({
  ranked,
  focus,
  onFocus,
  onOpen,
}: {
  ranked: Ranked[];
  focus: number;
  onFocus: (index: number) => void;
  onOpen: (road: Road) => void;
}) => {
  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    const rail = event.currentTarget;
    const width = rail.firstElementChild?.getBoundingClientRect().width ?? 1;
    const index = Math.round(rail.scrollLeft / (width + GAP));

    if (index !== focus) {
      onFocus(index);
    }
  };

  return (
    <div
      className="flex snap-x snap-mandatory [scrollbar-width:none] gap-2 overflow-x-auto scroll-smooth px-3"
      onScroll={onScroll}
    >
      {ranked.slice(0, CARDS).map((item, index) => (
        <Card
          key={item.road.id}
          onOpen={() => {
            onOpen(item.road);
          }}
          rank={index + 1}
          ranked={item}
        />
      ))}
    </div>
  );
};

const statusText = (
  origin: ReturnType<typeof useOrigin>,
  loading: boolean,
  reach: number
) => {
  if (origin.denied && !origin.pin) {
    return "Location is off. Search a town, or move the map and tap Best drives here.";
  }

  if (!origin.here) {
    return origin.tracking
      ? "Finding you…"
      : "Use your location to see the best drives near you, or search a town.";
  }

  return loading
    ? "Loading drives…"
    : `No good roads we know within ${reach} minutes. Try a longer drive.`;
};

const cameraFor = (
  story: Ranked | null,
  here: Point | null,
  loading: boolean,
  ranked: Ranked[],
  focus: number,
  key: string
): Camera | null => {
  const focused = ranked.at(focus);

  if (story) {
    return { key: `story:${story.road.id}`, points: story.road.line };
  }

  if (here === null) {
    return null;
  }

  if (loading && ranked.length === 0) {
    return { key: `go:${here.join(",")}`, points: around(here) };
  }

  if (focus > 0 && focused) {
    return {
      key: `card:${focused.road.id}`,
      points: [here, ...focused.road.line],
    };
  }

  return {
    key: `start:${key}`,
    points: [here, ...ranked.slice(0, 5).flatMap(({ road }) => road.line)],
  };
};

const Sheet = ({
  search,
  origin,
  reach,
  qualities,
  ranked,
  loading,
  focus,
  onReach,
  onToggle,
  onFocus,
  onOpen,
  onFollow,
}: {
  search: ReturnType<typeof useSearch>;
  origin: ReturnType<typeof useOrigin>;
  reach: number;
  qualities: Quality[];
  ranked: Ranked[];
  loading: boolean;
  focus: { index: number; key: string };
  onReach: (minutes: number) => void;
  onToggle: (quality: Quality) => void;
  onFocus: (index: number) => void;
  onOpen: (road: Road | null) => void;
  onFollow: () => void;
}) => {
  const handleFocus = search.start;
  const handleCancel = search.close;

  return (
    <section
      className={`flex flex-col gap-2 border-ink bg-paper pt-3 pb-[max(12px,env(safe-area-inset-bottom))] ${search.open ? "absolute inset-0 z-20 pt-[max(12px,env(safe-area-inset-top))]" : "shrink-0 border-t-2"}`}
    >
      <div className="flex gap-2 px-3">
        <input
          aria-label="Search a road or town"
          autoComplete="off"
          className="h-12 min-w-0 flex-1 border-2 border-ink bg-paper px-3 text-base placeholder:text-mute"
          enterKeyHint="search"
          onChange={(event) => {
            search.setQuery(event.target.value);
          }}
          onFocus={handleFocus}
          placeholder="Search a road or town"
          type="search"
          value={search.query}
        />
        {search.open ? (
          <button
            className="h-12 shrink-0 px-2 font-bold underline underline-offset-4"
            onClick={handleCancel}
            type="button"
          >
            Cancel
          </button>
        ) : (
          <Reach onReach={onReach} reach={reach} />
        )}
      </div>

      {search.open ? (
        <div className="min-h-0 flex-1 overflow-y-auto border-t-2 border-ink">
          <Results
            hits={search.hits}
            onRoad={(listing) => {
              search.close();
              void findRoad(listing).then(onOpen);
            }}
            onTown={(town) => {
              search.close();
              onOpen(null);
              origin.pick({ name: town.name, point: town.at });
            }}
            query={search.query}
            ready={search.ready}
          />
        </div>
      ) : (
        <>
          <Picker onToggle={onToggle} qualities={qualities} />
          {(origin.pin !== null || origin.live === null) && (
            <div className="flex min-h-11 items-center justify-between gap-2 px-3">
              <span className="min-w-0 truncate">
                {origin.pin ? `From ${origin.pin.name}` : "Where are you?"}
              </span>
              <button
                className="h-11 shrink-0 font-bold underline underline-offset-4"
                onClick={onFollow}
                type="button"
              >
                Use my location
              </button>
            </div>
          )}
          {ranked.length > 0 ? (
            <Rail
              focus={focus.index}
              key={focus.key}
              onFocus={onFocus}
              onOpen={onOpen}
              ranked={ranked}
            />
          ) : (
            <p className="mx-3 flex h-[212px] items-center border-2 border-ink p-3">
              {statusText(origin, loading, reach)}
            </p>
          )}
        </>
      )}
    </section>
  );
};

const originKey = ({ pin, here }: ReturnType<typeof useOrigin>) =>
  pin ? `${pin.name}@${pin.point.join(",")}` : String(here !== null);

const movedAway = (view: View | null, here: Point | null) =>
  view?.user === true &&
  view.zoom >= 8 &&
  (here === null || distance(view.center, here) > AWAY);

export const Detour = () => {
  const origin = useOrigin();
  const { here } = origin;
  const [qualities, setQualities] = useState<Quality[]>(["twisty", "scenic"]);
  const [reach, setReach] = useState(30);
  const [view, setView] = useState<View | null>(null);
  const [focus, setFocus] = useState({ index: 0, key: "" });
  const [opened, setOpened] = useState<Road | null>(null);
  const [recenter, setRecenter] = useState(0);
  const [screenOn, setScreenOn] = useWakeLock();
  const search = useSearch(here);

  const { badges, drawn, loading, ranked, story } = useDrives({
    here,
    opened,
    qualities,
    reach,
    seen: view,
  });

  const cardsKey = `${originKey(origin)}|${qualities.join(",")}|${reach}|${recenter}`;
  const focusIndex = focus.key === cardsKey ? focus.index : 0;
  const focused = ranked.at(focusIndex) ?? null;
  const camera = cameraFor(story, here, loading, ranked, focusIndex, cardsKey);
  const showMap = camera !== null || (origin.settled && here === null);

  const away = movedAway(view, here);

  return (
    <main className="flex h-dvh flex-col overflow-hidden">
      <div className="relative min-h-0 flex-1">
        {showMap && (
          <MapView
            camera={camera}
            badges={badges}
            drawn={drawn}
            focusId={story?.road.id ?? focused?.road.id ?? null}
            nearEnd={story?.start ?? null}
            onSelect={(id) => {
              setOpened(drawn.find(({ road }) => road.id === id)?.road ?? null);
            }}
            onView={setView}
            origin={here}
            story={story !== null}
          />
        )}
        <header className="pointer-events-none absolute inset-x-0 top-0 p-3 pt-[max(12px,env(safe-area-inset-top))]">
          <h1 className="sr-only">detour</h1>
          <Legend />
        </header>
        <button
          aria-pressed={screenOn}
          className={`absolute right-3 bottom-3 h-11 border-2 border-ink px-3 font-bold ${screenOn ? "bg-hi text-[#0a0a0a]" : "bg-paper"}`}
          onClick={() => {
            setScreenOn(!screenOn);
          }}
          type="button"
        >
          {screenOn ? "Screen stays on" : "Keep screen on"}
        </button>
        {away && view !== null && story === null && (
          <button
            className="absolute bottom-3 left-3 h-11 border-2 border-ink bg-hi px-3 font-bold text-[#0a0a0a]"
            onClick={() => {
              origin.pick({ name: "the map", point: view.center });
              setView({ ...view, user: false });
            }}
            type="button"
          >
            Best drives here
          </button>
        )}
      </div>

      {story ? (
        <section className="flex h-[60dvh] shrink-0 flex-col border-t-2 border-ink bg-paper">
          <Story
            onBack={() => {
              setOpened(null);
            }}
            ranked={story}
          />
        </section>
      ) : (
        <Sheet
          focus={{ index: focusIndex, key: cardsKey }}
          loading={loading}
          onFocus={(index) => {
            setFocus({ index, key: cardsKey });
          }}
          onFollow={() => {
            origin.follow();
            setRecenter((count) => count + 1);
          }}
          onOpen={setOpened}
          onReach={setReach}
          onToggle={(quality) => {
            setQualities((current) =>
              current.includes(quality)
                ? current.filter((item) => item !== quality)
                : [...current, quality]
            );
          }}
          origin={origin}
          qualities={qualities}
          ranked={ranked}
          reach={reach}
          search={search}
        />
      )}
    </main>
  );
};
