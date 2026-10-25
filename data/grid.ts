import type { Point } from "@/lib/geo";

export class Grid<T> {
  private readonly cells = new Map<string, T[]>();
  private readonly size: number;

  constructor(size: number) {
    this.size = size;
  }

  add(item: T, points: Point[]) {
    const xs = points.map(([lon]) => Math.floor(lon / this.size));
    const ys = points.map(([, lat]) => Math.floor(lat / this.size));

    for (let x = Math.min(...xs); x <= Math.max(...xs); x += 1) {
      for (let y = Math.min(...ys); y <= Math.max(...ys); y += 1) {
        const items = this.cells.get(`${x}:${y}`);

        if (items) {
          items.push(item);
        } else {
          this.cells.set(`${x}:${y}`, [item]);
        }
      }
    }
  }

  near([lon, lat]: Point) {
    const x = Math.floor(lon / this.size);
    const y = Math.floor(lat / this.size);
    const found: T[] = [];

    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        found.push(...(this.cells.get(`${x + dx}:${y + dy}`) ?? []));
      }
    }

    return found;
  }
}
