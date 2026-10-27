import { Database } from "bun:sqlite";
import { mkdir, readdir, rm } from "node:fs/promises";

import { CACHE, cached, MONTH } from "@/data/cache";
import { pieces, samples, simplify, splitWhere, thin } from "@/data/curves";
import type { Piece } from "@/data/curves";
import { Grid } from "@/data/grid";
import { LineGrid } from "@/data/line-grid";
import { chain, extractOsm } from "@/data/osm";
import type { Place, Way } from "@/data/osm";
import {
  gradeOf,
  pick,
  RIDER_SMOOTH,
  runsOf,
  SMOOTHNESS_TAG,
  smoothFromIri,
} from "@/data/pavement";
import type { Reading, Run } from "@/data/pavement";
import { loadRiders, onSpan, roadKey } from "@/data/riders";
import type { Rider } from "@/data/riders";
import { fetchLayer, fetchPavement, LAYERS } from "@/data/sources";
import { loadSurveys } from "@/data/surveys";
import { loadBuiltUp, loadElevation } from "@/data/terrain";
import { cellOf, distance, METERS_PER_MILE } from "@/lib/geo";
import type { Point } from "@/lib/geo";
import type {
  Grade,
  PavementSource,
  Report,
  Road,
  RoadIndex,
} from "@/lib/road";

const OUT = `${import.meta.dir}/../public/roads`;
const BUILD = new Date().toISOString().slice(0, 16).replaceAll(/[-:T]/gu, "");
const FEET = 3.28084;
const BUILT_UP = 12;
const OPEN = 4;

const SCENIC_WEIGHT = new Map([
  ["Connecting Federal Highway & National Scenic Byway", 1],
  ["County Route", 0.8],
  ["Eligible", 0.6],
  ["Federal Byway", 1],
  ["Officially Designated", 1],
]);

const ESTIMATED_TRAFFIC = new Map([
  ["primary", 8000],
  ["residential", 400],
  ["secondary", 3000],
  ["tertiary", 1200],
  ["trunk", 15_000],
  ["unclassified", 300],
]);

const PAVED = new Set([
  "asphalt",
  "concrete",
  "paved",
  "chipseal",
  "concrete:plates",
]);

const FIRE_ROAD = /\b(?:motorway|truck trail|fire road|fire trail)$/iu;

const TOPICS = ["pavement", "twistiness", "scenery", "safety", "closure"];

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

const median = (values: number[]) =>
  values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

interface Owned {
  way: Way;
  meters: number;
}

const longest = (owned: Owned[], field: (way: Way) => string) => {
  const totals = new Map<string, number>();

  for (const { way, meters } of owned) {
    const value = field(way);

    if (value !== "") {
      totals.set(value, (totals.get(value) ?? 0) + meters);
    }
  }

  return [...totals].toSorted((a, b) => b[1] - a[1])[0]?.[0] ?? "";
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
  const surveys = await loadSurveys();
  const riders = await loadRiders();

  console.log(
    `${osm.ways.length} ways, ${osm.scenery.length} viewpoints and coastlines, ${scenic.length} scenic highways, ${vistas.length} vista points, ${pavement.length} FHWA 2018 sections, ${surveys.length} pavement survey sections, ${riders.length} rider reports`
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

  const trafficGrid = new LineGrid<{ aadt: number | null; unpaved: boolean }>(
    0.005
  );

  const measuredGrid = new LineGrid<Reading>(0.005);

  for (const section of pavement) {
    const line = section.line.map(([lon, lat]): Point => [lon, lat]);
    trafficGrid.add(line, { aadt: section.aadt, unpaved: section.unpaved });

    if (section.iri !== null) {
      measuredGrid.add(line, {
        kind: "measured",
        name: "FHWA",
        smooth: smoothFromIri(section.iri),
        year: 2018,
      });
    }
  }

  for (const survey of surveys) {
    measuredGrid.add(
      survey.line.map(([lon, lat]): Point => [lon, lat]),
      {
        kind: "measured",
        name: survey.name,
        smooth: survey.smooth,
        year: survey.year,
      }
    );
  }

  const placeGrid = new Grid<Place>(0.3);

  for (const place of osm.places) {
    placeGrid.add(place, [[place[2], place[3]]]);
  }

  return {
    builtUp: await loadBuiltUp(),
    coastGrid,
    elevation: await loadElevation(),
    measuredGrid,
    placeGrid,
    riders,
    scenicGrid,
    trafficGrid,
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

const newest = (readings: Reading[]) => {
  let best: Reading | null = null;

  for (const reading of readings) {
    if (best === null || (reading.year ?? 0) > (best.year ?? 0)) {
      best = reading;
    }
  }

  return best;
};

const ROUGHNESS =
  /smooth|rough|bump|pothole|crack|patched|broken|repav|resurfac|excellent|tar.?snake|seam|ripple|washboard|chip.?seal|frost heave|condition|maintained|new (?:pavement|asphalt)/iu;

const HAZARD = /ice|gravel|sand|debris|rocks?\b|leaves|oil|wet|snow|mud/iu;

const aboutRoughness = (text: string) =>
  ROUGHNESS.test(text) ||
  (!HAZARD.test(text) && /pavement|asphalt|surface/iu.test(text));

const weightOf = (year: number | null) => {
  if (year === null) {
    return 0.5;
  }

  if (year >= 2022) {
    return 1;
  }

  return year >= 2018 ? 0.7 : 0.4;
};

const ridersReading = (riders: Rider[], point: Point): Reading | null => {
  const covering = riders.filter(
    (rider) =>
      rider.topic === "pavement" &&
      aboutRoughness(rider.text) &&
      onSpan(rider, point)
  );

  const named = covering.filter((rider) => rider.names.length > 0);
  const used = named.length > 0 ? named : covering;

  if (used.length === 0) {
    return null;
  }

  let weighted = 0;
  let total = 0;

  for (const rider of used) {
    const weight = weightOf(rider.year);
    weighted += (RIDER_SMOOTH.get(rider.tone) ?? 50) * weight;
    total += weight;
  }

  const latest = Math.max(...used.map((rider) => rider.year ?? 0));

  return {
    kind: "riders",
    name: "Riders",
    smooth: weighted / total,
    year: latest === 0 ? null : latest,
  };
};

interface Stretch {
  piece: Piece;
  owners: Way[];
}

type Samples = ReturnType<typeof samples>;

const pavementAlong = (
  sources: Sources,
  { piece, owners }: Stretch,
  riders: Rider[],
  points: Samples
) => {
  let smoothSum = 0;
  let knownMeters = 0;
  const steps: Run[] = [];
  const pavedBy = new Map<string, PavementSource>();

  for (const { point, meters, segment, heading } of points) {
    const tag = SMOOTHNESS_TAG.get(
      owners[piece.from + segment]?.smoothness ?? ""
    );

    const reading = pick(
      newest(sources.measuredGrid.along(point, heading, 25)),
      ridersReading(riders, point),
      tag === undefined
        ? null
        : { kind: "mapped", name: "OpenStreetMap", smooth: tag, year: null }
    );

    steps.push({ grade: reading ? gradeOf(reading.smooth) : 0, meters });

    if (reading) {
      smoothSum += reading.smooth * meters;
      knownMeters += meters;
      const key = `${reading.kind}:${reading.name}`;

      const source = pavedBy.get(key) ?? {
        from: reading.year,
        kind: reading.kind,
        miles: 0,
        name: reading.name,
        to: reading.year,
      };

      source.miles += meters / METERS_PER_MILE;

      if (reading.year !== null) {
        source.from = Math.min(source.from ?? reading.year, reading.year);
        source.to = Math.max(source.to ?? reading.year, reading.year);
      }

      pavedBy.set(key, source);
    }
  }

  return {
    pavedBy: [...pavedBy.values()],
    runs: runsOf(steps),
    smooth:
      knownMeters >= piece.meters * 0.25
        ? Math.round(smoothSum / knownMeters)
        : null,
  };
};

const elevationAlong = (sources: Sources, points: Samples) => {
  const heights = points.flatMap(({ point }) => {
    const height = sources.elevation(point);

    return height === null ? [] : [height];
  });

  let low: number | null = null;
  let high: number | null = null;

  for (let index = 0; index < heights.length; index += 1) {
    const around = heights.slice(Math.max(0, index - 2), index + 3);
    let sum = 0;

    for (const height of around) {
      sum += height;
    }

    const level = sum / around.length;
    low = Math.min(low ?? level, level);
    high = Math.max(high ?? level, level);
  }

  return { high, low };
};

const scenicStatusAlong = (sources: Sources, points: Samples) => {
  let meters = 0;
  let best = "";

  for (const point of points) {
    const status = scenicAt(sources, point.point);

    if (status !== "") {
      meters += point.meters * (SCENIC_WEIGHT.get(status) ?? 0.5);

      if ((SCENIC_WEIGHT.get(status) ?? 0) > (SCENIC_WEIGHT.get(best) ?? 0)) {
        best = status;
      }
    }
  }

  return { best, meters };
};

const measure = (sources: Sources, points: Samples) => {
  let coastMeters = 0;
  let openMeters = 0;
  let unpavedMeters = 0;
  const traffic: number[] = [];
  const density: number[] = [];

  for (const { point, meters, heading } of points) {
    if (sources.coastGrid.nearest(point, 1000) !== null) {
      coastMeters += meters;
    }

    const built = sources.builtUp(point);
    density.push(built);

    if (built < OPEN) {
      openMeters += meters;
    }

    const [section] = sources.trafficGrid.along(point, heading, 25);

    if (section?.aadt !== null && section?.aadt !== undefined) {
      traffic.push(section.aadt);
    }

    if (section?.unpaved) {
      unpavedMeters += meters;
    }
  }

  return {
    built: median(density),
    coastMeters,
    openMeters,
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

const clip = (text: string) =>
  text.length <= 220 ? text : `${text.slice(0, 220).replace(/\s+\S*$/u, "")}…`;

const newestFirst = (a: Rider, b: Rider) => (b.year ?? 0) - (a.year ?? 0);

const reportsFor = (riders: Rider[]): Report[] => {
  const seen = new Set<string>();

  const fresh = riders.filter((rider) => {
    const key = `${rider.url}${rider.topic}`;
    const keep = TOPICS.includes(rider.topic) && !seen.has(key);
    seen.add(key);

    return keep;
  });

  const pavement = fresh
    .filter((rider) => rider.topic === "pavement")
    .toSorted(newestFirst);

  const others = fresh
    .filter((rider) => rider.topic !== "pavement")
    .toSorted(
      (a, b) =>
        TOPICS.indexOf(a.topic) - TOPICS.indexOf(b.topic) || newestFirst(a, b)
    );

  return [...pavement.slice(0, 3), ...others.slice(0, 3)].map((rider) => ({
    site: rider.site,
    text: clip(rider.text),
    tone: rider.tone,
    topic: rider.topic,
    url: rider.url,
    year: rider.year,
  }));
};

const describe = (sources: Sources, stretch: Stretch, riders: Rider[]) => {
  const { piece, owners } = stretch;
  const points = samples(piece.line, 100);
  const measured = measure(sources, points);
  const pavement = pavementAlong(sources, stretch, riders, points);
  const { high, low } = elevationAlong(sources, points);
  const scenicStatus = scenicStatusAlong(sources, points);
  const views = viewsAlong(sources, piece);

  const owned: Owned[] = points.map(({ meters, segment }) => ({
    meters,
    way: owners[piece.from + segment],
  }));

  const members = [...new Set(owned.map(({ way }) => way))];
  const highway = longest(owned, (way) => way.highway);
  const aadtMeasured = measured.traffic.length >= points.length * 0.3;

  const aadt = aadtMeasured
    ? median(measured.traffic)
    : (ESTIMATED_TRAFFIC.get(highway) ?? 1000);

  const tagged = members.flatMap((way) =>
    way.surface === "" ? [] : [way.surface]
  );

  const miles = piece.meters / METERS_PER_MILE;
  const caltrans = scenicStatus.meters / piece.meters;
  const coast = measured.coastMeters / piece.meters;
  const open = measured.openMeters / piece.meters;
  const relief = high === null || low === null ? 0 : high - low;

  const hasMeasure = pavement.pavedBy.some(
    (source) => source.kind === "measured"
  );

  return {
    aadt,
    aadtMeasured,
    built: measured.built,
    coast: coast >= 0.3,
    curvature: Math.round(piece.curvature),
    high: high === null ? null : Math.round((high * FEET) / 10) * 10,
    low: low === null ? null : Math.round((low * FEET) / 10) * 10,
    miles: Math.round(miles * 10) / 10,
    name: longest(owned, (way) => way.name),
    paved: FIRE_ROAD.test(longest(owned, (way) => way.name))
      ? false
      : pavedFor(measured.unpavedMeters, piece.meters, hasMeasure, tagged),
    pavedBy: pavement.pavedBy
      .filter((source) => source.miles >= 0.1)
      .map((source) => ({
        ...source,
        miles: Math.round(source.miles * 10) / 10,
      }))
      .toSorted((a, b) => b.miles - a.miles),
    paving: pavement.runs.map(({ meters, grade }): [number, Grade | 0] => [
      Math.round((meters / METERS_PER_MILE) * 100) / 100,
      grade,
    ]),
    quiet: scale(
      Math.log10(Math.max(aadt, 1)),
      Math.log10(20_000),
      Math.log10(200)
    ),
    ref: longest(owned, (way) => way.ref),
    reports: reportsFor(riders),
    riders: new Set(riders.map((rider) => rider.url)).size,
    scenic: Math.min(
      100,
      Math.round(
        caltrans * 45 +
          coast * 35 +
          Math.min(views.size, 3) * 8 +
          open * 20 +
          Math.min(1, relief / 600) * 25
      )
    ),
    scenicStatus: caltrans >= 0.25 ? scenicStatus.best : "",
    smooth: pavement.smooth,
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

type Described = ReturnType<typeof describe>;

const listed = (road: Described) => {
  if (
    road.paved === false ||
    (road.paved === null && road.ref.startsWith("FR ")) ||
    road.miles < 1
  ) {
    return false;
  }

  if (road.built >= BUILT_UP) {
    return road.riders > 0 || road.scenic >= 60;
  }

  return (
    road.riders > 0 ||
    (road.twisty >= 30 && road.miles >= 1.5) ||
    road.curvature >= 1500 ||
    (road.scenic >= 45 && road.miles >= 2)
  );
};

const namesOf = (owners: Way[]) =>
  new Set(
    owners.flatMap((way) => (way.name === "" ? [] : [roadKey(way.name)]))
  );

const refsOf = (owners: Way[]) =>
  new Set(owners.flatMap((way) => way.ref.split(";").filter(Boolean)));

const keysOf = ({ piece, owners }: Stretch) => {
  const span = owners.slice(piece.from, piece.to + 1);

  return { names: namesOf(span), refs: refsOf(span) };
};

const matches = (rider: Rider, keys: ReturnType<typeof keysOf>) =>
  rider.names.length > 0
    ? rider.names.some((name) => keys.names.has(name))
    : rider.refs.some((ref) => keys.refs.has(ref));

const attachRiders = (
  riders: Rider[],
  stretches: Stretch[],
  builtUp: (point: Point) => number
) => {
  const byKey = new Map<string, Rider[]>();

  for (const rider of riders) {
    for (const key of [...rider.names, ...rider.refs]) {
      const list = byKey.get(key);

      if (list) {
        list.push(rider);
      } else {
        byKey.set(key, [rider]);
      }
    }
  }

  const candidates = stretches.map((stretch) => {
    const keys = keysOf(stretch);

    const found = new Set(
      [...keys.names, ...keys.refs].flatMap((key) => byKey.get(key) ?? [])
    );

    return [...found].filter((rider) => matches(rider, keys));
  });

  const boxes = new Map<number, [number, number, number, number]>();

  for (const [index, { piece }] of stretches.entries()) {
    for (const rider of candidates[index] ?? []) {
      const box = boxes.get(rider.id) ?? [180, 90, -180, -90];

      for (const [lon, lat] of [
        piece.line[0],
        piece.line.at(-1) ?? piece.line[0],
      ]) {
        box[0] = Math.min(box[0], lon);
        box[1] = Math.min(box[1], lat);
        box[2] = Math.max(box[2], lon);
        box[3] = Math.max(box[3], lat);
      }

      boxes.set(rider.id, box);
    }
  }

  const sprawling = new Set(
    [...boxes].flatMap(([id, box]) =>
      distance([box[0], box[1]], [box[2], box[3]]) > 150_000 ? [id] : []
    )
  );

  return stretches.map(({ piece }, index) => {
    const middle =
      piece.line[Math.floor(piece.line.length / 2)] ?? piece.line[0];

    const built = builtUp(middle) >= BUILT_UP;
    const points = samples(piece.line, 200);

    return (candidates[index] ?? []).filter((rider) => {
      if (
        rider.from === null &&
        (sprawling.has(rider.id) || (built && rider.names.length === 0))
      ) {
        return false;
      }

      const covered = points.filter(({ point }) => onSpan(rider, point)).length;

      return covered >= Math.min(5, points.length * 0.25);
    });
  });
};

const writeDatabase = (
  all: (Road & { listed: boolean; built: number; ways: number[] })[]
) => {
  const db = new Database(`${CACHE}/roads.db`);
  db.run("DROP TABLE IF EXISTS roads");
  db.run("DROP TABLE IF EXISTS meta");
  db.run(
    "CREATE TABLE roads (id TEXT PRIMARY KEY, listed INTEGER, name TEXT, ref TEXT, town TEXT, miles REAL, curvature INTEGER, twisty INTEGER, scenic INTEGER, scenic_status TEXT, coast INTEGER, views TEXT, view_count INTEGER, low INTEGER, high INTEGER, built REAL, smooth INTEGER, paving TEXT, paved_by TEXT, paved INTEGER, quiet INTEGER, aadt INTEGER, aadt_measured INTEGER, riders INTEGER, reports TEXT, osm_ways TEXT, line TEXT)"
  );
  db.run("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)");

  const insert = db.prepare(
    `INSERT INTO roads VALUES (${Array.from({ length: 27 }, () => "?").join(", ")})`
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
        road.low,
        road.high,
        Math.round(road.built * 10) / 10,
        road.smooth,
        JSON.stringify(road.paving),
        JSON.stringify(road.pavedBy),
        road.paved === null ? null : Number(road.paved),
        road.quiet,
        road.aadt,
        Number(road.aadtMeasured),
        road.riders,
        JSON.stringify(road.reports),
        JSON.stringify(road.ways),
        JSON.stringify(road.line)
      );
    }

    meta.run("build", BUILD);
    meta.run("inputs", MONTH);
    meta.run(
      "sources",
      "OpenStreetMap California (Geofabrik), Caltrans Scenic Highways, Caltrans Vista Points, FHWA HPMS California 2018 and 2025, pavement surveys (City of LA, LA County, MTC Bay Area, City and County of San Diego, Santa Barbara, Sonoma, SLO and Santa Cruz counties), AWS Terrain Tiles, rider and driver reports"
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

const townNear = (sources: Sources, point: Point) =>
  sources.placeGrid
    .near(point)
    .flatMap(([name, kind, lon, lat]) => {
      const meters = distance(point, [lon, lat]);

      return meters <= (kind === "village" ? 15_000 : 30_000)
        ? [{ meters, name }]
        : [];
    })
    .toSorted((a, b) => a.meters - b.meters)[0]?.name ?? "";

const build = async () => {
  const sources = await loadSources();
  const stretches: Stretch[] = [];

  for (const { coords, owners } of chain(sources.ways)) {
    const kept = thin(coords, 8);
    const line = kept.map((index) => coords[index]);
    const lineOwners = kept.map((index) => owners[index]);

    const parts = splitWhere(
      line,
      (point) => sources.builtUp(point) >= BUILT_UP,
      1500
    );

    for (const [start, end] of parts) {
      for (const piece of pieces(
        line.slice(start, end + 1),
        (point) => scenicAt(sources, point) !== ""
      )) {
        if (piece.meters >= 1000) {
          stretches.push({
            owners: lineOwners,
            piece: { ...piece, from: piece.from + start, to: piece.to + start },
          });
        }
      }
    }
  }

  const attached = attachRiders(sources.riders, stretches, sources.builtUp);
  const all: (Road & { listed: boolean; built: number; ways: number[] })[] = [];
  const seen = new Map<string, number>();

  for (const [index, stretch] of stretches.entries()) {
    const { piece } = stretch;

    const middle =
      piece.line[Math.floor(piece.line.length / 2)] ?? piece.line[0];

    const road = describe(sources, stretch, attached[index] ?? []);

    const base = stableId(road.name === "" ? road.ref : road.name, piece.line);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);

    const ways = new Set(
      stretch.owners.slice(piece.from + 1, piece.to + 1).map((way) => way.id)
    );

    const { built: density, ...shipped } = road;

    all.push({
      ...shipped,
      built: density,
      id: count === 1 ? base : `${base}-${count}`,
      line: round(simplify(piece.line, 12)),
      listed: listed(road),
      town: townNear(sources, middle),
      ways: [...ways],
    });
  }

  const keptGrid = new LineGrid<string>(0.005);
  const roads: Road[] = [];

  for (const road of all
    .filter((item) => item.listed)
    .toSorted(
      (a, b) =>
        b.riders - a.riders || b.twisty + b.scenic - (a.twisty + a.scenic)
    )) {
    const points = samples(road.line, 200);

    const overlapping = points.filter(
      ({ point }) => keptGrid.nearest(point, 40) !== null
    ).length;

    if (overlapping >= points.length * 0.6) {
      road.listed = false;
      continue;
    }

    keptGrid.add(road.line, road.id);
    const { listed: _listed, built: _built, ways: _ways, ...shipped } = road;
    roads.push(shipped);
  }

  writeDatabase(all);
  const squares = await writeSquares(roads);
  console.log(
    `build ${BUILD}: ${all.length} roads stored, ${roads.length} listed in ${squares} squares`
  );
};

await build();
