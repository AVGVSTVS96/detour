"use client";

import { useEffect, useMemo, useState } from "react";

import { smoothText } from "@/app/answer";
import { distance } from "@/lib/geo";
import type { Point } from "@/lib/geo";
import { clock, gradeOf, guessMinutes, words } from "@/lib/glance";
import type { Found, FoundPlace, FoundRoad, Grade } from "@/lib/glance";
import { loadSearch } from "@/lib/glance-data";

const SWATCH: Record<Grade, string> = {
  fair: "bg-fair",
  rough: "bg-rough",
  smooth: "bg-smooth",
  unknown: "bg-unknown",
};

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
    .filter(({ kind, found }) => {
      const name = `${kind}${found.name}`.toLowerCase();
      const fresh = !named.has(name);
      named.add(name);

      return fresh;
    })
    .slice(0, 7);
};

const Swatch = ({ smooth }: { smooth: number | null }) => (
  <span
    aria-hidden="true"
    className={`inline-block size-4 shrink-0 border-2 border-ink ${SWATCH[gradeOf(smooth)]}`}
  />
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
  const { name, ref, town, smooth, at } = found;

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
      <span className="flex items-center gap-2 text-base font-semibold">
        <Swatch smooth={smooth} />
        {smoothText(smooth)}
        <span className="truncate font-normal text-mute">
          {[ref, town && `near ${town}`].filter(Boolean).join(" · ")}
        </span>
      </span>
    </button>
  );
};

const PlaceHit = ({
  found,
  onPick,
}: {
  found: FoundPlace;
  onPick: (found: FoundPlace) => void;
}) => {
  const {
    name,
    best: { minutes, drive, smooth },
  } = found;

  return (
    <button
      className="flex w-full flex-col gap-1 px-4 py-3 text-left active:bg-hi/50"
      onClick={() => {
        onPick(found);
      }}
      type="button"
    >
      <span className="truncate text-xl font-bold">{name}</span>
      <span className="text-base">
        Best drive: <span className="font-semibold">{found.best.name}</span>,{" "}
        {minutes < 2 ? "right there" : `${clock(minutes)} out`}, {clock(drive)}{" "}
        of road
      </span>
      <span className="flex items-center gap-2 text-base font-semibold">
        <Swatch smooth={smooth} />
        {smoothText(smooth)}
      </span>
    </button>
  );
};

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
      <p className="p-4 text-lg text-mute">
        Type a road, like Mulholland, or a town, like Big Sur.
      </p>
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
