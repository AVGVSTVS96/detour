export type Point = [number, number];

const EARTH = 6_371_000;
const RADIANS = Math.PI / 180;

export const METERS_PER_MILE = 1609.344;

export const distance = ([lon1, lat1]: Point, [lon2, lat2]: Point) => {
  const dLat = (lat2 - lat1) * RADIANS;
  const dLon = (lon2 - lon1) * RADIANS;

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * RADIANS) *
      Math.cos(lat2 * RADIANS) *
      Math.sin(dLon / 2) ** 2;

  return 2 * EARTH * Math.asin(Math.sqrt(h));
};

export const project = (origin: Point) => {
  const kx = EARTH * RADIANS * Math.cos(origin[1] * RADIANS);
  const ky = EARTH * RADIANS;

  return ([lon, lat]: Point): Point => [
    (lon - origin[0]) * kx,
    (lat - origin[1]) * ky,
  ];
};

export const segmentDistance = (point: Point, start: Point, end: Point) => {
  const toMeters = project(point);
  const [ax, ay] = toMeters(start);
  const [bx, by] = toMeters(end);
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;

  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared));

  return Math.hypot(ax + t * dx, ay + t * dy);
};

export const lineDistance = (point: Point, line: Point[]) => {
  let nearest = Number.POSITIVE_INFINITY;

  for (let index = 1; index < line.length; index += 1) {
    nearest = Math.min(
      nearest,
      segmentDistance(point, line[index - 1], line[index])
    );
  }

  return nearest;
};

export const CELL_DEGREES = 0.5;

export const cellOf = ([lon, lat]: Point) =>
  `${Math.floor(lon / CELL_DEGREES)}_${Math.floor(lat / CELL_DEGREES)}`;

export const cellsIn = ([west, south]: Point, [east, north]: Point) => {
  const cells: string[] = [];

  for (
    let x = Math.floor(west / CELL_DEGREES);
    x <= Math.floor(east / CELL_DEGREES);
    x += 1
  ) {
    for (
      let y = Math.floor(south / CELL_DEGREES);
      y <= Math.floor(north / CELL_DEGREES);
      y += 1
    ) {
      cells.push(`${x}_${y}`);
    }
  }

  return cells;
};

export const cellsAround = ([lon, lat]: Point, meters: number) => {
  const dLat = meters / (EARTH * RADIANS);
  const dLon = dLat / Math.cos(lat * RADIANS);

  return cellsIn([lon - dLon, lat - dLat], [lon + dLon, lat + dLat]);
};

export const halfway = (line: Point[]): Point => {
  let left = 0;

  for (let index = 1; index < line.length; index += 1) {
    left += distance(line[index - 1], line[index]) / 2;
  }

  for (let index = 1; index < line.length; index += 1) {
    const from = line[index - 1];
    const to = line[index];
    const step = distance(from, to);

    if (step >= left) {
      const t = step === 0 ? 0 : left / step;

      return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
    }

    left -= step;
  }

  return line[0];
};
