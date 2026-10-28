import { CACHE } from "@/data/cache";
import type { Point } from "@/lib/geo";
import { readJson } from "@/lib/json";

const PBF =
  "https://download.geofabrik.de/north-america/us/california-latest.osm.pbf";

export interface Way {
  id: number;
  name: string;
  ref: string;
  highway: string;
  surface: string;
  smoothness: string;
  oneway: boolean;
  structure: boolean;
  nodes: [number, number];
  coords: Point[];
}

export type Place = [name: string, kind: string, lon: number, lat: number];

export type Scenery = [
  kind: "viewpoint" | "coast",
  name: string,
  line: Point[],
];

export const run = async (command: string[]) => {
  const child = Bun.spawn(command, { stderr: "inherit", stdout: "inherit" });

  if ((await child.exited) !== 0) {
    throw new Error(command.join(" "));
  }
};

export const readLines = async <T>(path: string) => {
  const text = await Bun.file(path).text();

  return await Promise.all(
    text
      .split("\n")
      .filter(Boolean)
      .map(async (line) => await readJson<T>(new Response(line)))
  );
};

export const extractOsm = async () => {
  const pbf = `${CACHE}/california-latest.osm.pbf`;

  if (!(await Bun.file(pbf).exists())) {
    await run(["curl", "-sSLo", pbf, PBF]);
  }

  if (!(await Bun.file(`${CACHE}/density.json`).exists())) {
    await run([
      "uv",
      "run",
      "--script",
      `${import.meta.dir}/extract.py`,
      pbf,
      `${CACHE}/roads.ndjson`,
      `${CACHE}/places.ndjson`,
      `${CACHE}/scenery.ndjson`,
      `${CACHE}/density.json`,
    ]);
  }

  return {
    places: await readLines<Place>(`${CACHE}/places.ndjson`),
    scenery: await readLines<Scenery>(`${CACHE}/scenery.ndjson`),
    ways: await readLines<Way>(`${CACHE}/roads.ndjson`),
  };
};

const refsOf = (way: Way) => way.ref.split(";").filter(Boolean);

const baseName = (name: string) =>
  name.replace(/\s*\(.*\)$/u, "").replace(/^(?:North|South|East|West)\s+/u, "");

const heading = (from: Point, to: Point) =>
  Math.atan2(
    to[1] - from[1],
    (to[0] - from[0]) * Math.cos((from[1] * Math.PI) / 180)
  );

const turn = (a: number, b: number) =>
  Math.abs(((b - a + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);

const NAMED_TURN = Math.PI * 0.8;
const REF_TURN = Math.PI * 0.6;
const ONEWAY_TURN = Math.PI * 0.5;

export const chain = (ways: Way[]) => {
  const byNode = new Map<number, Way[]>();

  for (const way of ways) {
    for (const node of way.nodes) {
      const list = byNode.get(node);

      if (list) {
        list.push(way);
      } else {
        byNode.set(node, [way]);
      }
    }
  }

  const used = new Set<number>();
  const chains: { coords: Point[]; owners: Way[] }[] = [];

  const extend = (
    road: { name: string; refs: Set<string> },
    coords: Point[],
    owners: Way[],
    node: number,
    atEnd: boolean
  ) => {
    let current = node;

    const along = (way: Way, at: number) =>
      way.nodes[0] === at ? way.coords : way.coords.toReversed();

    const leaving = (way: Way, at: number) => {
      const points = along(way, at);

      return heading(points[0], points[1] ?? points[0]);
    };

    const sameName = (way: Way) =>
      way.name !== "" && baseName(way.name) === road.name;

    const joins = (way: Way) =>
      sameName(way) ||
      ((way.name === "" || road.name === "") &&
        refsOf(way).some((ref) => road.refs.has(ref)));

    const open = (way: Way, at: number) =>
      !used.has(way.id) && (!way.oneway || way.nodes[atEnd ? 0 : 1] === at);

    const limit = (way: Way, from: Way) => {
      if (way.oneway && from.oneway) {
        return ONEWAY_TURN;
      }

      return sameName(way) ? NAMED_TURN : REF_TURN;
    };

    const follow = (at: number, arriving: number, from: Way) => {
      const [next] = (byNode.get(at) ?? [])
        .filter((way) => open(way, at) && joins(way))
        .toSorted(
          (a, b) =>
            Number(sameName(b)) - Number(sameName(a)) ||
            turn(arriving, leaving(a, at)) - turn(arriving, leaving(b, at))
        );

      return next !== undefined &&
        turn(arriving, leaving(next, at)) <= limit(next, from)
        ? next
        : undefined;
    };

    const carries = (
      way: Way,
      at: number,
      arriving: number,
      depth: number
    ): boolean => {
      if (
        !way.structure ||
        !open(way, at) ||
        turn(arriving, leaving(way, at)) > REF_TURN
      ) {
        return false;
      }

      const points = along(way, at);
      const far = way.nodes[0] === at ? way.nodes[1] : way.nodes[0];

      const onward = heading(
        points.at(-2) ?? points[0],
        points.at(-1) ?? points[0]
      );

      return (
        follow(far, onward, way) !== undefined ||
        (depth > 0 &&
          (byNode.get(far) ?? []).some(
            (after) => after !== way && carries(after, far, onward, depth - 1)
          ))
      );
    };

    for (;;) {
      const at = current;

      const [from, to] = atEnd
        ? coords.slice(-2)
        : coords.slice(0, 2).toReversed();

      const arriving = heading(from ?? to, to ?? from);

      const next =
        follow(at, arriving, owners[atEnd ? owners.length - 1 : 0]) ??
        (byNode.get(at) ?? []).find((way) => carries(way, at, arriving, 2));

      if (next === undefined) {
        return;
      }

      used.add(next.id);

      if (!next.structure) {
        if (road.name === "" && next.name !== "") {
          road.name = baseName(next.name);
        }

        for (const ref of refsOf(next)) {
          road.refs.add(ref);
        }
      }

      const forward = next.nodes[0] === current;
      const points = forward ? next.coords : next.coords.toReversed();
      current = forward ? next.nodes[1] : next.nodes[0];

      const added = points.slice(1);
      const owned = added.map(() => next);

      if (atEnd) {
        coords.push(...added);
        owners.push(...owned);
      } else {
        coords.unshift(...added.toReversed());
        owners.unshift(...owned);
      }
    }
  };

  const degree = (way: Way) => byNode.get(way.nodes[0])?.length ?? 0;

  const starts = ways
    .filter((way) => way.name !== "" || way.ref !== "")
    .toSorted(
      (a, b) =>
        Number(a.structure) - Number(b.structure) || degree(a) - degree(b)
    );

  for (const way of starts) {
    if (used.has(way.id)) {
      continue;
    }

    used.add(way.id);
    const road = { name: baseName(way.name), refs: new Set(refsOf(way)) };
    const coords = [...way.coords];
    const owners = coords.map(() => way);
    extend(road, coords, owners, way.nodes[1], true);
    extend(road, coords, owners, way.nodes[0], false);
    chains.push({ coords, owners });
  }

  return chains;
};
