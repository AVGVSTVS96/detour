import { Database } from "bun:sqlite";
import { mkdir, readdir, rm } from "node:fs/promises";

import { CACHE, cached, MONTH } from "@/data/cache";
import { pieces, samples, simplify, thin } from "@/data/curves";
import type { Piece } from "@/data/curves";
import { Grid } from "@/data/grid";
import { LineGrid } from "@/data/line-grid";
import { chain, extractOsm } from "@/data/osm";
import type { Way } from "@/data/osm";
import { fetchLayer, fetchPavement, LAYERS } from "@/data/sources";
import { cellOf, distance, METERS_PER_MILE } from "@/lib/geo";
import type { Point } from "@/lib/geo";
import type { Road, RoadIndex } from "@/lib/road";

const OUT = `${import.meta.dir}/../public/roads`;
const BUILD = new Date().toISOString().slice(0, 16).replaceAll(/[-:T]/gu, "");

const SCENIC_WEIGHT = new Map([
  ["Connecting Federal Highway & National Scenic Byway", 1],
  ["County Route", 0.8],
  ["Eligible", 0.6],
  ["Federal Byway", 1],
  ["Officially Designated", 1],
]);

const ESTIMATED_TRAFFIC = new Map([
  ["primary", 8000],
  ["secondary", 3000],
  ["tertiary", 1200],
  ["trunk", 15_000],
  ["unclassified", 300],
]);

const SMOOTHNESS_IRI = new Map([
  ["bad", 250],
  ["excellent", 60],
  ["good", 90],
  ["intermediate", 150],
  ["very_bad", 320],
]);

const PAVED = new Set([
  "asphalt",
  "concrete",
  "paved",
  "chipseal",
  "concrete:plates",
]);

const scale = (value: number, worst: number, best: number) =>
  Math.round(Math.max(0, Math.min(1, (value - worst) / (best - worst))) * 100);

const round = (line: Point[]) =>
  line.map(([lon, lat]): Point => [
    Math.round(lon * 1e5) / 1e5,
    Math.round(lat * 1e5) / 1e5,
  ]);

const slug = (text: string) =>
  text
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-|-$/gu, "");

const spot = ([lon, lat]: Point) =>
  `${Math.round((lat + 90) * 100).toString(36)}${Math.round((lon + 180) * 100).toString(36)}`;

const stableId = (name: string, line: Point[]) => {
  const ends = [spot(line[0]), spot(line.at(-1) ?? line[0])].toSorted();

  return `${slug(name)}-${ends.join("-")}`;
};

const mostCommon = (values: string[]) => {
  const counts = new Map<string, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts].toSorted((a, b) => b[1] - a[1])[0]?.[0] ?? "";
};

const loadSources = async () => {
  const osm = await extractOsm();

  const scenic = await cached(
    "scenic",
    async () => await fetchLayer(LAYERS.scenic, "1=1", "Official_Status,Route")
  );

  const vistas = await cached(
    "vistas",
    async () => await fetchLayer(LAYERS.vistas, "1=1", "NAME,ROUTE")
  );

  const pavement = await cached("pavement", fetchPavement);

  console.log(
    `${osm.ways.length} ways, ${osm.scenery.length} viewpoints and coastlines, ${scenic.length} scenic highways, ${vistas.length} vista points, ${pavement.length} pavement sections`
  );

  const scenicGrid = new LineGrid<string>(0.01);

  for (const feature of scenic) {
    const status = String(feature.properties?.Official_Status ?? "");

    const lines =
      feature.geometry?.type === "MultiLineString"
        ? feature.geometry.coordinates
        : [];

    for (const line of lines) {
      scenicGrid.add(
        line.map(([lon, lat]): Point => [lon, lat]),
        status
      );
    }
  }

  const viewGrid = new Grid<{ name: string; point: Point }>(0.01);
  const coastGrid = new LineGrid<true>(0.02);

  for (const feature of vistas) {
    if (feature.geometry?.type === "Point") {
      const [lon, lat] = feature.geometry.coordinates;

      const name = String(feature.properties?.NAME ?? "")
        .replace(/\s+-\s+.*$/u, "")
        .toLowerCase()
        .replaceAll(/\b\w/gu, (letter) => letter.toUpperCase());

      viewGrid.add({ name, point: [lon, lat] }, [[lon, lat]]);
    }
  }

  for (const [kind, name, line] of osm.scenery) {
    if (kind === "viewpoint") {
      viewGrid.add({ name, point: line[0] }, line);
    } else {
      coastGrid.add(line, true);
    }
  }

  const pavementGrid = new LineGrid<{
    iri: number | null;
    aadt: number | null;
    unpaved: boolean;
  }>(0.005);

  for (const section of pavement) {
    pavementGrid.add(
      section.line.map(([lon, lat]): Point => [lon, lat]),
      { aadt: section.aadt, iri: section.iri, unpaved: section.unpaved }
    );
  }

  return {
    coastGrid,
    pavementGrid,
    places: osm.places,
    scenicGrid,
    viewGrid,
    ways: osm.ways,
  };
};

type Sources = Awaited<ReturnType<typeof loadSources>>;

const scenicAt = (sources: Sources, point: Point) => {
  let best = "";

  for (const status of sources.scenicGrid.within(point, 80)) {
    if ((SCENIC_WEIGHT.get(status) ?? 0.5) > (SCENIC_WEIGHT.get(best) ?? 0)) {
      best = status;
    }
  }

  return best;
};

const measure = (sources: Sources, piece: Piece) => {
  let scenicMeters = 0;
  let scenicBest = "";
  let coastMeters = 0;
  let iriMeters = 0;
  let iriSum = 0;
  let unpavedMeters = 0;
  const traffic: number[] = [];

  for (const { point, meters } of samples(piece.line, 100)) {
    const status = scenicAt(sources, point);

    if (status !== "") {
      scenicMeters += meters * (SCENIC_WEIGHT.get(status) ?? 0.5);

      if (
        (SCENIC_WEIGHT.get(status) ?? 0) > (SCENIC_WEIGHT.get(scenicBest) ?? 0)
      ) {
        scenicBest = status;
      }
    }

    if (sources.coastGrid.nearest(point, 1000) !== null) {
      coastMeters += meters;
    }

    const section = sources.pavementGrid.nearest(point, 25);
    const sectionIri = section?.iri ?? null;
    const sectionAadt = section?.aadt ?? null;

    if (sectionIri !== null) {
      iriMeters += meters;
      iriSum += sectionIri * meters;
    }

    if (sectionAadt !== null) {
      traffic.push(sectionAadt);
    }

    if (section?.unpaved === true) {
      unpavedMeters += meters;
    }
  }

  return {
    coastMeters,
    iriMeters,
    iriSum,
    scenicBest,
    scenicMeters,
    traffic,
    unpavedMeters,
  };
};

const viewsAlong = (sources: Sources, piece: Piece) => {
  const views = new Map<string, Point>();

  for (const { point } of samples(piece.line, 250)) {
    for (const view of sources.viewGrid.near(point)) {
      if (distance(point, view.point) <= 400) {
        views.set(
          view.name === "" ? view.point.join(",") : view.name,
          view.point
        );
      }
    }
  }

  return views;
};

const pavedFor = (
  unpavedMeters: number,
  meters: number,
  measured: boolean,
  tagged: string[]
) => {
  if (unpavedMeters > meters * 0.3) {
    return false;
  }

  if (
    measured ||
    (tagged.length > 0 && tagged.every((surface) => PAVED.has(surface)))
  ) {
    return true;
  }

  return null;
};

const describe = (sources: Sources, piece: Piece, members: Way[]) => {
  const measured = measure(sources, piece);
  const views = viewsAlong(sources, piece);
  const highway = mostCommon(members.map((way) => way.highway));

  const smoothnessTag =
    members.find((way) => SMOOTHNESS_IRI.has(way.smoothness))?.smoothness ?? "";

  const hasIri = measured.iriMeters >= piece.meters * 0.3;

  const iri = hasIri
    ? Math.round(measured.iriSum / measured.iriMeters)
    : (SMOOTHNESS_IRI.get(smoothnessTag) ?? null);

  const aadtMeasured = measured.traffic.length >= 3;

  const aadt = aadtMeasured
    ? (measured.traffic.toSorted((a, b) => a - b)[
        Math.floor(measured.traffic.length / 2)
      ] ?? 0)
    : (ESTIMATED_TRAFFIC.get(highway) ?? 1000);

  const tagged = members.flatMap((way) =>
    way.surface === "" ? [] : [way.surface]
  );

  const miles = piece.meters / METERS_PER_MILE;
  const caltrans = measured.scenicMeters / piece.meters;
  const coast = measured.coastMeters / piece.meters;

  return {
    aadt,
    aadtMeasured,
    coast: coast >= 0.3,
    curvature: Math.round(piece.curvature),
    iri,
    miles: Math.round(miles * 10) / 10,
    name: mostCommon(
      members.flatMap((way) => (way.name === "" ? [] : [way.name]))
    ),
    paved: pavedFor(measured.unpavedMeters, piece.meters, hasIri, tagged),
    quiet: scale(
      Math.log10(Math.max(aadt, 1)),
      Math.log10(20_000),
      Math.log10(200)
    ),
    ref: members.find((way) => way.ref !== "")?.ref ?? "",
    scenic: Math.min(
      100,
      Math.round(caltrans * 60 + coast * 40 + Math.min(views.size, 3) * 10)
    ),
    scenicStatus: caltrans >= 0.25 ? measured.scenicBest : "",
    smooth: iri === null ? null : scale(iri, 220, 60),
    twisty:
      piece.curvature === 0
        ? 0
        : scale(
            Math.log(piece.curvature / miles),
            Math.log(150),
            Math.log(2000)
          ),
    viewCount: views.size,
    views: [...views.keys()].filter((key) => !/^-?\d/u.test(key)),
  };
};

const listed = (road: ReturnType<typeof describe>) =>
  road.paved !== false &&
  !(road.paved === null && road.ref.startsWith("FR ")) &&
  ((road.curvature >= 300 && road.miles >= 1) ||
    (road.scenic >= 40 && road.miles >= 2));

const writeDatabase = (all: (Road & { listed: boolean; ways: number[] })[]) => {
  const db = new Database(`${CACHE}/roads.db`);
  db.run("DROP TABLE IF EXISTS roads");
  db.run("DROP TABLE IF EXISTS meta");
  db.run(
    "CREATE TABLE roads (id TEXT PRIMARY KEY, listed INTEGER, name TEXT, ref TEXT, town TEXT, miles REAL, curvature INTEGER, twisty INTEGER, scenic INTEGER, scenic_status TEXT, coast INTEGER, views TEXT, view_count INTEGER, smooth INTEGER, iri INTEGER, paved INTEGER, quiet INTEGER, aadt INTEGER, aadt_measured INTEGER, osm_ways TEXT, line TEXT)"
  );
  db.run("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)");

  const insert = db.prepare(
    "INSERT INTO roads VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );

  const meta = db.prepare("INSERT INTO meta VALUES (?, ?)");

  db.transaction(() => {
    for (const road of all) {
      insert.run(
        road.id,
        Number(road.listed),
        road.name,
        road.ref,
        road.town,
        road.miles,
        road.curvature,
        road.twisty,
        road.scenic,
        road.scenicStatus,
        Number(road.coast),
        JSON.stringify(road.views),
        road.viewCount,
        road.smooth,
        road.iri,
        road.paved === null ? null : Number(road.paved),
        road.quiet,
        road.aadt,
        Number(road.aadtMeasured),
        JSON.stringify(road.ways),
        JSON.stringify(road.line)
      );
    }

    meta.run("build", BUILD);
    meta.run("inputs", MONTH);
    meta.run(
      "sources",
      "OpenStreetMap California (Geofabrik), Caltrans Scenic Highways, Caltrans Vista Points, FHWA HPMS California 2018"
    );
  })();
  db.close();
};

const writeSquares = async (roads: Road[]) => {
  const cells = new Map<string, Road[]>();

  for (const road of roads) {
    for (const cell of new Set(road.line.map((point) => cellOf(point)))) {
      cells.set(cell, [...(cells.get(cell) ?? []), road]);
    }
  }

  const old = await readdir(OUT).catch(() => []);

  await Promise.all(
    old.map(async (entry) => {
      await rm(`${OUT}/${entry}`, { force: true, recursive: true });
    })
  );
  await mkdir(`${OUT}/${BUILD}`, { recursive: true });
  await Promise.all(
    [...cells].map(
      async ([cell, cellRoads]) =>
        await Bun.write(
          `${OUT}/${BUILD}/${cell}.json`,
          JSON.stringify(cellRoads)
        )
    )
  );

  const index: RoadIndex = {
    build: BUILD,
    cells: [...cells.keys()].toSorted(),
  };

  await Bun.write(`${OUT}/index.json`, JSON.stringify(index));

  return cells.size;
};

const build = async () => {
  const sources = await loadSources();
  const all: (Road & { listed: boolean; ways: number[] })[] = [];
  const seen = new Map<string, number>();

  for (const { coords, ways: members } of chain(sources.ways)) {
    for (const piece of pieces(
      thin(coords, 8),
      (point) => scenicAt(sources, point) !== ""
    )) {
      if (piece.meters < 1000) {
        continue;
      }

      const road = describe(sources, piece, members);

      const middle =
        piece.line[Math.floor(piece.line.length / 2)] ?? piece.line[0];

      const [town] = sources.places
        .flatMap(([name, kind, lon, lat]) => {
          const meters = distance(middle, [lon, lat]);

          return meters <= (kind === "village" ? 15_000 : 30_000)
            ? [{ meters, name }]
            : [];
        })
        .toSorted((a, b) => a.meters - b.meters);

      const base = stableId(
        road.name === "" ? road.ref : road.name,
        piece.line
      );

      const count = (seen.get(base) ?? 0) + 1;
      seen.set(base, count);
      all.push({
        ...road,
        id: count === 1 ? base : `${base}-${count}`,
        line: round(simplify(piece.line, 12)),
        listed: listed(road),
        town: town?.name ?? "",
        ways: members.map((way) => way.id),
      });
    }
  }

  const keptGrid = new LineGrid<string>(0.005);
  const roads: Road[] = [];

  for (const road of all
    .filter((item) => item.listed)
    .toSorted((a, b) => b.twisty + b.scenic - (a.twisty + a.scenic))) {
    const points = samples(road.line, 200);

    const overlapping = points.filter(
      ({ point }) => keptGrid.nearest(point, 40) !== null
    ).length;

    if (overlapping >= points.length * 0.6) {
      road.listed = false;
      continue;
    }

    keptGrid.add(road.line, road.id);
    const { listed: _listed, ways: _ways, ...shipped } = road;
    roads.push(shipped);
  }

  writeDatabase(all);
  const squares = await writeSquares(roads);
  console.log(
    `build ${BUILD}: ${all.length} roads stored, ${roads.length} listed in ${squares} squares`
  );
};

await build();
