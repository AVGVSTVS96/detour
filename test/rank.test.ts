import { describe, expect, test } from "bun:test";

import type { Point } from "@/lib/geo";
import { appleMaps, closuresOn, googleMaps, inReach, rank } from "@/lib/rank";

import { ROADS } from "./roads";

const PASADENA: Point = [-118.1445, 34.1478];
const roads = Object.values(ROADS);

const names = (list: { road: { name: string } }[]) =>
  list.map(({ road }) => road.name);

describe("inReach", () => {
  test("keeps roads within reach and puts the best first", () => {
    expect(names(inReach(roads, PASADENA, ["twisty"], 20))).toEqual([
      "Glendora Ridge Road",
      "Angeles Crest Highway",
    ]);
  });

  test("weighs the qualities asked for", () => {
    const pair = [ROADS.angelesCrestHighway, ROADS.pacificCoastHighway];

    expect(names(inReach(pair, PASADENA, ["scenic"], 60))).toEqual([
      "Angeles Crest Highway",
      "Pacific Coast Highway",
    ]);
    expect(names(inReach(pair, PASADENA, ["smooth"], 60))).toEqual([
      "Pacific Coast Highway",
      "Angeles Crest Highway",
    ]);
  });

  test("starts each road at the end nearer the driver", () => {
    const [crest] = inReach([ROADS.angelesCrestHighway], PASADENA, [], 30);

    expect(crest?.end).toEqual([
      ROADS.angelesCrestHighway.line[0],
      ROADS.angelesCrestHighway.line[2],
    ]);
  });
});

describe("rank", () => {
  const candidates = inReach(roads, PASADENA, ["twisty"], 60);

  test("uses real drive times when known and drops roads too far away", () => {
    const glendora = ROADS.glendoraRidgeRoad.id;

    const ranked = rank(
      candidates,
      PASADENA,
      60,
      [],
      new Map([[glendora, 2 * 60 * 60]])
    );

    expect(names(ranked)).not.toContain("Glendora Ridge Road");
    expect(ranked.every(({ estimated }) => estimated)).toBe(true);
  });

  test("a closer road beats an equal one farther away", () => {
    const crest = ROADS.angelesCrestHighway.id;
    const near = rank(candidates, PASADENA, 60, [], new Map([[crest, 600]]));
    const far = rank(candidates, PASADENA, 60, [], new Map([[crest, 3000]]));

    const score = (list: typeof near) =>
      list.find(({ road }) => road.id === crest)?.score ?? 0;

    expect(score(near)).toBeGreaterThan(score(far));
  });
});

describe("closuresOn", () => {
  const closure = {
    from: ROADS.angelesCrestHighway.line[1],
    kind: "Full",
    to: ROADS.angelesCrestHighway.line[1],
    until: null,
    work: "Rockslide",
  };

  test("matches a closure by route number and place", () => {
    expect(
      closuresOn(ROADS.angelesCrestHighway, [{ ...closure, route: "SR-2" }])
    ).toHaveLength(1);
  });

  test("ignores a closure on another route", () => {
    expect(
      closuresOn(ROADS.angelesCrestHighway, [{ ...closure, route: "SR-1" }])
    ).toHaveLength(0);
  });
});

describe("directions", () => {
  const [crest] = rank(
    inReach([ROADS.angelesCrestHighway], PASADENA, [], 60),
    PASADENA,
    60,
    [],
    new Map()
  );

  test("route through the start and middle of the road", () => {
    expect(crest).toBeDefined();

    if (crest === undefined) {
      return;
    }

    expect(appleMaps(crest)).toBe(
      "https://maps.apple.com/directions?destination=34.35251%2C-117.93792&waypoint=34.21804%2C-118.19988&waypoint=34.26575%2C-118.09279&mode=driving"
    );
    expect(googleMaps(crest)).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=34.35251%2C-117.93792&travelmode=driving&waypoints=34.21804%2C-118.19988%7C34.26575%2C-118.09279"
    );
  });
});
