import type { Point } from "@/lib/geo";

export interface Closure {
  route: string;
  kind: string;
  work: string;
  from: Point;
  to: Point;
  until: number | null;
}
