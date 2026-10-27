import { distance } from "@/lib/geo";
import type { Point } from "@/lib/geo";
import type { Grade, Road } from "@/lib/road";

export type Tone = "plain" | "good" | "bad" | "unknown";

export interface Verdict {
  word: string;
  tone: Tone;
}

export const GRADE_NAMES = ["Unknown", "Smooth", "Fair", "Rough"] as const;

export const twistyVerdict = (road: Road): Verdict => {
  if (road.twisty >= 80) {
    return { tone: "good", word: "Very twisty" };
  }

  if (road.twisty >= 55) {
    return { tone: "good", word: "Twisty" };
  }

  return road.twisty >= 30
    ? { tone: "plain", word: "Some curves" }
    : { tone: "plain", word: "Sweeping" };
};

const relief = (road: Road) =>
  road.high === null || road.low === null ? 0 : road.high - road.low;

export const scenicVerdict = (road: Road): Verdict => {
  if (road.coast) {
    return { tone: "good", word: "Coast views" };
  }

  if (relief(road) >= 1500) {
    return { tone: "good", word: "Mountain views" };
  }

  if (road.scenic >= 60) {
    return { tone: "good", word: "Scenic" };
  }

  return road.scenic >= 40
    ? { tone: "plain", word: "Pretty" }
    : { tone: "plain", word: "Plain views" };
};

export const pavingShares = (road: Road) => {
  const miles = [0, 0, 0, 0];

  for (const [length, grade] of road.paving) {
    miles[grade] = (miles[grade] ?? 0) + length;
  }

  return miles;
};

export const pavementVerdict = (road: Road): Verdict => {
  const { 1: smooth = 0, 2: fair = 0, 3: rough = 0 } = pavingShares(road);
  const known = smooth + fair + rough;

  if (road.smooth === null || known === 0) {
    return { tone: "unknown", word: "Pavement unknown" };
  }

  if (rough >= known * 0.5) {
    return { tone: "bad", word: "Rough pavement" };
  }

  if (smooth >= known * 0.85) {
    return { tone: "good", word: "Smooth" };
  }

  if (rough >= known * 0.15) {
    return { tone: "bad", word: "Rough patches" };
  }

  return smooth >= known * 0.6
    ? { tone: "good", word: "Mostly smooth" }
    : { tone: "plain", word: "Fair pavement" };
};

export const trafficVerdict = (road: Road): Verdict => {
  if (road.quiet >= 75) {
    return { tone: "good", word: "Quiet" };
  }

  return road.quiet >= 35
    ? { tone: "plain", word: "Some traffic" }
    : { tone: "bad", word: "Busy" };
};

export const tagsOf = (road: Road) => {
  const twisty = twistyVerdict(road);
  const scenic = scenicVerdict(road);
  const traffic = trafficVerdict(road);

  return [
    road.riders >= 3 ? { tone: "good" as const, word: "Rider favorite" } : null,
    twisty.word === "Sweeping" ? null : twisty,
    scenic.word === "Plain views" ? null : scenic,
    pavementVerdict(road),
    traffic.word === "Some traffic" ? null : traffic,
  ].filter((tag) => tag !== null);
};

export const pavingFrom = (road: Road, start: Point) => {
  const forward = start === road.line[0];

  return forward ? road.paving : road.paving.toReversed();
};

export const pavingLines = (road: Road) => {
  let length = 0;
  let total = 0;

  for (let index = 1; index < road.line.length; index += 1) {
    length += distance(road.line[index - 1], road.line[index]);
  }

  for (const [miles] of road.paving) {
    total += miles;
  }

  const metersPerMile = total === 0 ? 0 : length / total;
  const pieces: { grade: Grade | 0; line: Point[] }[] = [];
  let [from] = road.line;
  let index = 1;

  for (const [miles, grade] of road.paving) {
    let left = miles * metersPerMile;
    const line: Point[] = [from];

    while (index < road.line.length) {
      const next = road.line[index];
      const step = distance(from, next);

      if (step > left) {
        const t = left / step;
        from = [
          from[0] + (next[0] - from[0]) * t,
          from[1] + (next[1] - from[1]) * t,
        ];
        line.push(from);
        break;
      }

      left -= step;
      line.push(next);
      from = next;
      index += 1;
    }

    pieces.push({ grade, line });
  }

  pieces.at(-1)?.line.push(...road.line.slice(index));

  return pieces.filter(({ line }) => line.length > 1);
};
