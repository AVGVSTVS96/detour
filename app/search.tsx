"use client";

import { useEffect, useMemo, useState } from "react";

import { TONE_FILL, TONE_WORD } from "@/app/paint";
import { distance } from "@/lib/geo";
import type { Point } from "@/lib/geo";
import { clock, guessMinutes, pavementText, words } from "@/lib/glance";
import type { Found, FoundPlace, FoundRoad, Pavement } from "@/lib/glance";
import { loadSearch } from "@/lib/glance-data";

type Hit =
  | { kind: "road"; found: FoundRoad; tier: number; meters: number }
  | { kind: "place"; found: FoundPlace; tier: number; meters: number };

const aliases = (ref: string) =>
  ref
    .split(";")
    .flatMap((part) => {
      const number = /\d+\w*/u.exec(part)?.[0];

      return number === undefined
        ? [part]
        : [part, `hwy ${number}`, `highway ${number}`, `route ${number}`];
    })
    .join(" ");

const tierOf = (text: string, query: string) => {
  if (text.startsWith(query)) {
    return 0;
  }

  return text.includes(query) ? 1 : null;
};

const find = (index: Found, typed: string, origin: Point | null) => {
  const query = words(typed);

  if (query.trim().length < 2) {
    return [];
  }

  const from = origin ?? [-119.4, 36.8];
  const hits: Hit[] = [];

  for (const found of index.places) {
    const tier = tierOf(words(found.name), query);

    if (tier !== null) {
      hits.push({
        found,
        kind: "place",
        meters: distance(from, found.at),
        tier,
      });
    }
  }

  for (const found of index.roads) {
    const tier = tierOf(words(`${found.name} ${aliases(found.ref)}`), query);

    if (tier !== null) {
      hits.push({
        found,
        kind: "road",
        meters: distance(from, found.at),
        tier,
      });
    }
  }

  const named = new Set<string>();

  return hits
    .toSorted(
      (a, b) =>
        a.tier - b.tier ||
        Number(a.kind === "road") - Number(b.kind === "road") ||
        a.meters - b.meters
    )
    .filter((hit) => {
      const miles = hit.kind === "road" ? hit.found.miles : 0;
      const name = `${hit.kind}${hit.found.name}${miles}`.toLowerCase();
      const fresh = !named.has(name);
      named.add(name);

      return fresh;
    })
    .slice(0, 7);
};

const PavementLine = ({
  pavement,
  rest,
}: {
  pavement: Pavement;
  rest: string;
}) => (
  <span className="flex items-center gap-2 text-base font-semibold">
    <span
      aria-hidden="true"
      className={`inline-block size-4 shrink-0 border-2 border-ink ${TONE_FILL[pavement.tone]}`}
    />
    <span className="shrink-0">{pavementText(pavement)}</span>
    <span className="truncate font-normal text-mute">{rest}</span>
  </span>
);

const RoadHit = ({
  found,
  origin,
  onPick,
}: {
  found: FoundRoad;
  origin: Point | null;
  onPick: (found: FoundRoad) => void;
}) => {
  const { name, ref, town, miles, pavement, at } = found;

  return (
    <button
      className="flex w-full flex-col gap-1 px-4 py-3 text-left active:bg-hi/50"
      onClick={() => {
        onPick(found);
      }}
      type="button"
    >
      <span className="flex w-full items-baseline justify-between gap-3">
        <span className="truncate text-xl font-bold">{name}</span>
        {origin && (
          <span className="shrink-0 text-base font-semibold text-mute tabular-nums">
            {clock(guessMinutes(origin, at))}
          </span>
        )}
      </span>
      <PavementLine
        pavement={pavement}
        rest={[`${miles} mi`, ref, town && `near ${town}`]
          .filter(Boolean)
          .join(" · ")}
      />
    </button>
  );
};

const PlaceHit = ({
  found,
  onPick,
}: {
  found: FoundPlace;
  onPick: (found: FoundPlace) => void;
}) => (
  <button
    className="flex w-full flex-col gap-1 px-4 py-3 text-left active:bg-hi/50"
    onClick={() => {
      onPick(found);
    }}
    type="button"
  >
    <span className="flex w-full items-baseline justify-between gap-3">
      <span className="truncate text-xl font-bold">{found.name}</span>
      <span className="shrink-0 text-base font-semibold text-mute">
        Best drives
      </span>
    </span>
    {found.bests.map(({ name, minutes, pavement }) => (
      <span className="flex items-center gap-2 text-base" key={name}>
        <span
          aria-hidden="true"
          className={`inline-block size-4 shrink-0 border-2 border-ink ${TONE_FILL[pavement.tone]}`}
        />
        <span className="min-w-0 flex-1 truncate font-semibold">{name}</span>
        <span className="shrink-0 text-mute">
          {TONE_WORD[pavement.tone]} ·{" "}
          {minutes < 2 ? "in town" : `${clock(minutes)} out`}
        </span>
      </span>
    ))}
  </button>
);

export const Search = ({
  query,
  origin,
  onRoad,
  onPlace,
}: {
  query: string;
  origin: Point | null;
  onRoad: (found: FoundRoad) => void;
  onPlace: (found: FoundPlace) => void;
}) => {
  const [index, setIndex] = useState<Found | null>(null);

  useEffect(() => {
    void loadSearch().then(setIndex);
  }, []);

  const hits = useMemo(
    () => (index ? find(index, query, origin) : []),
    [index, query, origin]
  );

  if (query.trim().length < 2) {
    return (
      <div className="flex flex-col gap-6 p-4">
        <p className="text-lg">
          Type a road, like Mulholland, or a town, like Big Sur.
        </p>
        <p className="text-base text-mute">
          Live closures cover state highways only. Road data © OpenStreetMap
          contributors, Caltrans, FHWA, city and county pavement surveys, AWS
          Terrain Tiles; rider quotes link to their sources. Check conditions
          before you go.
        </p>
      </div>
    );
  }

  if (index === null) {
    return <p className="p-4 text-lg text-mute">Looking…</p>;
  }

  return hits.length === 0 ? (
    <p className="p-4 text-lg text-mute">No road or town by that name.</p>
  ) : (
    <ul className="divide-y-2 divide-ink" id="results">
      {hits.map((hit) => (
        <li key={`${hit.kind}${hit.found.name}${hit.meters}`}>
          {hit.kind === "road" ? (
            <RoadHit found={hit.found} onPick={onRoad} origin={origin} />
          ) : (
            <PlaceHit found={hit.found} onPick={onPlace} />
          )}
        </li>
      ))}
    </ul>
  );
};
