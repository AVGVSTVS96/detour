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
  tracktype: string;
  smoothness: string;
  oneway: boolean;
  nodes: [number, number];
  coords: Point[];
}

export type Place = [name: string, kind: string, lon: number, lat: number];

export type Scenery = [
  kind: "viewpoint" | "coast",
  name: string,
  line: Point[],
];

const run = async (command: string[]) => {
  const child = Bun.spawn(command, { stderr: "inherit", stdout: "inherit" });

  if ((await child.exited) !== 0) {
    throw new Error(command.join(" "));
  }
};

const readLines = async <T>(path: string) => {
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

  if (!(await Bun.file(`${CACHE}/scenery.ndjson`).exists())) {
    await run([
      "uv",
      "run",
      "--script",
      `${import.meta.dir}/extract.py`,
      pbf,
      `${CACHE}/roads.ndjson`,
      `${CACHE}/places.ndjson`,
      `${CACHE}/scenery.ndjson`,
    ]);
  }

  return {
    places: await readLines<Place>(`${CACHE}/places.ndjson`),
    scenery: await readLines<Scenery>(`${CACHE}/scenery.ndjson`),
    ways: await readLines<Way>(`${CACHE}/roads.ndjson`),
  };
};

const refsOf = (way: Way) => way.ref.split(";").filter(Boolean);

const heading = (from: Point, to: Point) =>
  Math.atan2(
    to[1] - from[1],
    (to[0] - from[0]) * Math.cos((from[1] * Math.PI) / 180)
  );

const turn = (a: number, b: number) =>
  Math.abs(((b - a + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);

const MAX_TURN = Math.PI * 0.6;

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
  const chains: { coords: Point[]; ways: Way[] }[] = [];

  const extend = (
    coords: Point[],
    members: Way[],
    node: number,
    atEnd: boolean
  ) => {
    const refs = new Set(members.flatMap((way) => refsOf(way)));

    const names = new Set(
      members.flatMap((way) => (way.name ? [way.name] : []))
    );

    let current = node;

    const leaving = (way: Way) => {
      const points =
        way.nodes[0] === current ? way.coords : way.coords.toReversed();

      return heading(points[0], points[1] ?? points[0]);
    };

    for (;;) {
      const at = current;

      const [from, to] = atEnd
        ? coords.slice(-2)
        : coords.slice(0, 2).toReversed();

      const arriving = heading(from ?? to, to ?? from);

      const options = (byNode.get(at) ?? []).filter(
        (way) =>
          !used.has(way.id) &&
          (refsOf(way).some((ref) => refs.has(ref)) || names.has(way.name)) &&
          (!way.oneway || way.nodes[atEnd ? 0 : 1] === at)
      );

      const [next] = options.toSorted(
        (a, b) => turn(arriving, leaving(a)) - turn(arriving, leaving(b))
      );

      if (next === undefined || turn(arriving, leaving(next)) > MAX_TURN) {
        return;
      }

      used.add(next.id);
      members.push(next);
      names.add(next.name);

      for (const ref of refsOf(next)) {
        refs.add(ref);
      }

      const forward = next.nodes[0] === current;
      const points = forward ? next.coords : next.coords.toReversed();
      current = forward ? next.nodes[1] : next.nodes[0];

      if (atEnd) {
        coords.push(...points.slice(1));
      } else {
        coords.unshift(...points.slice(1).toReversed());
      }
    }
  };

  const starts = ways
    .filter((way) => way.name !== "" || way.ref !== "")
    .toSorted(
      (a, b) =>
        (byNode.get(a.nodes[0])?.length ?? 0) -
        (byNode.get(b.nodes[0])?.length ?? 0)
    );

  for (const way of starts) {
    if (used.has(way.id)) {
      continue;
    }

    used.add(way.id);
    const coords = [...way.coords];
    const members = [way];
    extend(coords, members, way.nodes[1], true);
    extend(coords, members, way.nodes[0], false);
    chains.push({ coords, ways: members });
  }

  return chains;
};
