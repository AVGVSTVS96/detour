"use client";

import { Strip, Swatch } from "@/app/road";
import { METERS_PER_MILE } from "@/lib/geo";
import type { Hit, Listing, Town } from "@/lib/search";

const milesText = (meters: number) => {
  const miles = meters / METERS_PER_MILE;

  return miles < 10 ? `${miles.toFixed(1)} mi` : `${Math.round(miles)} mi`;
};

const RoadHit = ({
  listing,
  meters,
  onPick,
}: {
  listing: Listing;
  meters: number;
  onPick: (listing: Listing) => void;
}) => {
  const [name, ref, town, , word, tone, paving, source] = listing;

  return (
    <button
      className="flex w-full flex-col gap-1 border-b-2 border-ink px-3 py-2.5 text-left active:bg-hi/40"
      onClick={() => {
        onPick(listing);
      }}
      type="button"
    >
      <span className="flex w-full items-baseline justify-between gap-2">
        <span className="truncate text-lg font-black">
          {name || ref}
          {name && ref && <span className="font-normal"> {ref}</span>}
        </span>
        <span className="shrink-0 tabular-nums">{milesText(meters)}</span>
      </span>
      <span className="flex flex-wrap items-center gap-x-2">
        <Swatch tone={tone} />
        <span className="font-bold">{word}</span>
        {source && <span>· {source}</span>}
      </span>
      {paving.length > 0 && <Strip paving={paving} />}
      {town && <span className="text-mute">near {town}</span>}
    </button>
  );
};

const TownHit = ({
  town,
  meters,
  onPick,
}: {
  town: Town;
  meters: number;
  onPick: (town: Town) => void;
}) => (
  <button
    aria-label={`${town.name}: best drives around there`}
    className="flex min-h-14 w-full items-center gap-3 border-b-2 border-ink px-3 py-2 text-left active:bg-hi/40"
    onClick={() => {
      onPick(town);
    }}
    type="button"
  >
    <span
      aria-hidden
      className="size-4 shrink-0 rounded-full border-4 border-ink bg-hi"
    />
    <span className="min-w-0 flex-1">
      <span className="block truncate text-lg font-black">{town.name}</span>
      <span className="block text-mute">
        Best drives around here · {milesText(meters)} away
      </span>
    </span>
  </button>
);

export const Results = ({
  hits,
  query,
  ready,
  onRoad,
  onTown,
}: {
  hits: Hit[];
  query: string;
  ready: boolean;
  onRoad: (listing: Listing) => void;
  onTown: (town: Town) => void;
}) => {
  if (query.trim() === "") {
    return (
      <p className="p-3 text-mute">
        Type a road to see its pavement, or a town to see the best drives there.
      </p>
    );
  }

  if (!ready) {
    return <p className="p-3 text-mute">Loading every road in California…</p>;
  }

  if (hits.length === 0) {
    return (
      <p className="p-3 text-mute">
        No road or town called “{query.trim()}” in detour yet.
      </p>
    );
  }

  return (
    <ul>
      {hits.map((hit) => (
        <li
          key={
            hit.kind === "town"
              ? `town:${hit.town.name}`
              : `road:${hit.listing[0]}:${hit.listing[3].join(",")}`
          }
        >
          {hit.kind === "town" ? (
            <TownHit meters={hit.meters} onPick={onTown} town={hit.town} />
          ) : (
            <RoadHit
              listing={hit.listing}
              meters={hit.meters}
              onPick={onRoad}
            />
          )}
        </li>
      ))}
    </ul>
  );
};
