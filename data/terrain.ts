import { CACHE } from "@/data/cache";
import { run } from "@/data/osm";
import type { Point } from "@/lib/geo";
import { readJson } from "@/lib/json";

const CELL = 0.01;

interface Raster {
  zoom: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const loadElevation = async () => {
  if (!(await Bun.file(`${CACHE}/elevation.i16`).exists())) {
    await run([
      "uv",
      "run",
      "--script",
      `${import.meta.dir}/elevation.py`,
      `${CACHE}/elevation.i16`,
    ]);
  }

  const raster = await readJson<Raster>(
    Bun.file(`${CACHE}/elevation.i16.json`)
  );

  const heights = new Int16Array(
    await Bun.file(`${CACHE}/elevation.i16`).arrayBuffer()
  );

  const size = 2 ** raster.zoom * 256;

  const heightAt = (point: Point) => {
    const [lon, lat] = point;
    const radians = (lat * Math.PI) / 180;
    const x = Math.floor(((lon + 180) / 360) * size) - raster.x;

    const y =
      Math.floor(
        ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) /
          2) *
          size
      ) - raster.y;

    if (x < 0 || y < 0 || x >= raster.width || y >= raster.height) {
      return null;
    }

    return heights[y * raster.width + x] ?? null;
  };

  return heightAt;
};

export const loadBuiltUp = async () => {
  const cells = await readJson<[number, number, number][]>(
    Bun.file(`${CACHE}/density.json`)
  );

  const meters = new Map<string, number>();

  for (const [x, y, total] of cells) {
    meters.set(`${x}:${y}`, total);
  }

  return ([lon, lat]: Point) => {
    const x = Math.floor(lon / CELL);
    const y = Math.floor(lat / CELL);
    let total = 0;

    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        total += meters.get(`${x + dx}:${y + dy}`) ?? 0;
      }
    }

    const squareKm = 9 * 1.112 * 1.112 * Math.cos((lat * Math.PI) / 180);

    return total / 1000 / squareKm;
  };
};
