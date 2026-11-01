import { packLine, unpackLine } from "@/lib/geo";
import type { Point } from "@/lib/geo";

export type Grade = 1 | 2 | 3;

export interface PavementSource {
  kind: "measured" | "riders" | "mapped";
  name: string;
  from: number | null;
  to: number | null;
  miles: number;
}

export interface Report {
  topic: string;
  tone: string;
  text: string;
  year: number | null;
  site: string;
  url: string;
}

export interface Road {
  id: string;
  name: string;
  ref: string;
  town: string;
  miles: number;
  curvature: number;
  twisty: number;
  scenic: number;
  scenicStatus: string;
  coast: boolean;
  views: string[];
  viewCount: number;
  low: number | null;
  high: number | null;
  smooth: number | null;
  paving: [miles: number, grade: Grade | 0][];
  pavedBy: PavementSource[];
  paved: boolean | null;
  quiet: number;
  aadt: number;
  aadtMeasured: boolean;
  riders: number;
  reports: Report[];
  line: Point[];
}

export type Quality = "twisty" | "scenic" | "smooth" | "quiet";

export const QUALITIES: Quality[] = ["twisty", "scenic", "smooth", "quiet"];

export interface RoadIndex {
  build: string;
  cells: string[];
}

export type PackedRoad = Omit<Road, "line"> & { line: string };

export const packRoad = (road: Road): PackedRoad => ({
  ...road,
  line: packLine(road.line),
});

export const unpackRoad = (road: PackedRoad): Road => ({
  ...road,
  line: unpackLine(road.line),
});

export type DetailFile = [id: string, line: string][];

export const unpackDetail = (file: DetailFile) =>
  new Map(file.map(([id, line]): [string, Point[]] => [id, unpackLine(line)]));

export const detailed = (road: Road, detail: Map<string, Point[]>): Road => {
  const line = detail.get(road.id);

  return line === undefined ? road : { ...road, line };
};
