import { describe, expect, test } from "bun:test";

import {
  pavementVerdict,
  pavingFrom,
  pavingShares,
  scenicVerdict,
  tagsOf,
  twistyVerdict,
} from "@/lib/verdict";

import { ROADS } from "./roads";

const words = (road: keyof typeof ROADS) =>
  tagsOf(ROADS[road]).map((tag) => tag.word);

describe("tagsOf", () => {
  test("names what each real road is known for", () => {
    expect(words("angelesCrestHighway")).toEqual([
      "Rider favorite",
      "Twisty",
      "Mountain views",
      "Rough pavement",
      "Quiet",
    ]);
    expect(words("glendoraRidgeRoad")).toEqual([
      "Rider favorite",
      "Very twisty",
      "Fair pavement",
      "Quiet",
    ]);
    expect(words("pacificCoastHighway")).toEqual([
      "Coast views",
      "Rough patches",
      "Busy",
    ]);
    expect(words("skylineDrive")).toEqual([
      "Very twisty",
      "Pavement unknown",
      "Quiet",
    ]);
  });

  test("leaves out the unremarkable middle of each scale", () => {
    expect(words("pacificCoastHighway")).not.toContain("Sweeping");
    expect(words("mulhollandHighway")).not.toContain("Some traffic");
  });
});

describe("verdicts", () => {
  test("the coast wins over mountains for views", () => {
    expect(scenicVerdict({ ...ROADS.pacificCoastHighway, high: 3000 })).toEqual(
      { tone: "good", word: "Coast views" }
    );
  });

  test("twistiness steps at 30, 55 and 80", () => {
    expect(
      [29, 30, 55, 80].map(
        (twisty) => twistyVerdict({ ...ROADS.glendoraRidgeRoad, twisty }).word
      )
    ).toEqual(["Sweeping", "Some curves", "Twisty", "Very twisty"]);
  });

  test("pavement with no measured miles is unknown, not smooth", () => {
    expect(pavementVerdict(ROADS.skylineDrive)).toEqual({
      tone: "unknown",
      word: "Pavement unknown",
    });
  });

  test("shares add up to the road's paved miles by grade", () => {
    const shares = pavingShares(ROADS.southMalibuCanyonRoad);

    expect(shares.map((miles) => Math.round(miles * 100) / 100)).toEqual([
      0, 0.35, 2.04, 2.24,
    ]);
  });

  test("paving reads backwards when the drive starts at the far end", () => {
    const road = ROADS.southMalibuCanyonRoad;

    expect(pavingFrom(road, road.line[0])).toEqual(road.paving);
    expect(pavingFrom(road, road.line[2])).toEqual(road.paving.toReversed());
  });
});
