import type { Point } from "@/lib/geo";

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
  smooth: number | null;
  iri: number | null;
  paved: boolean | null;
  quiet: number;
  aadt: number;
  aadtMeasured: boolean;
  line: Point[];
}

export type Quality = "twisty" | "scenic" | "smooth" | "quiet";

export const QUALITIES: Quality[] = ["twisty", "scenic", "smooth", "quiet"];

export interface RoadIndex {
  build: string;
  cells: string[];
}
