import { Database } from "bun:sqlite";

import { CACHE } from "@/data/cache";
import { readLines } from "@/data/osm";
import { distance } from "@/lib/geo";
import type { Point } from "@/lib/geo";

interface Placed {
  id: number;
  roads: { name: string; ref: string }[];
  from: Point | null;
  to: Point | null;
}

interface Row {
  id: number;
  topic: string;
  sentiment: string;
  quote: string;
  source_url: string;
  source_site: string | null;
  source_date: string | null;
}

export interface Rider {
  id: number;
  topic: string;
  tone: string;
  text: string;
  url: string;
  site: string;
  year: number | null;
  names: string[];
  refs: string[];
  from: Point | null;
  to: Point | null;
}

export const roadKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/\s*\(.*\)$/u, "")
    .replace(/^(?:north|south|east|west)\s+/u, "")
    .trim();

export const loadRiders = async () => {
  const placed = new Map<number, Placed>();

  for (const item of await readLines<Placed>(`${CACHE}/placed.ndjson`)) {
    placed.set(item.id, item);
  }

  const db = new Database(`${CACHE}/reports.db`, { readonly: true });

  const rows = db
    .query<Row, []>(
      "SELECT id, topic, sentiment, quote, source_url, source_site, source_date FROM anecdotes WHERE quote_verified = 1"
    )
    .all();

  db.close();

  return rows.flatMap((row): Rider[] => {
    const place = placed.get(row.id);

    if (place === undefined || place.roads.length === 0) {
      return [];
    }

    const year = Number(row.source_date?.slice(0, 4));

    return [
      {
        from: place.from,
        id: row.id,
        names: place.roads.flatMap(({ name }) =>
          name === "" ? [] : [roadKey(name)]
        ),
        refs: place.roads.flatMap(({ ref }) => (ref === "" ? [] : [ref])),
        site: row.source_site ?? new URL(row.source_url).hostname,
        text: row.quote,
        to: place.to,
        tone: row.sentiment,
        topic: row.topic,
        url: row.source_url,
        year: Number.isFinite(year) && year > 1990 ? year : null,
      },
    ];
  });
};

export const onSpan = (rider: Rider, point: Point) => {
  if (rider.from === null || rider.to === null) {
    return true;
  }

  const across = distance(rider.from, rider.to);

  return (
    distance(rider.from, point) + distance(point, rider.to) <=
    Math.max(across * 1.6, across + 3000)
  );
};
