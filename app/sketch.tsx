"use client";

import { useEffect, useRef, useState } from "react";

import { GRADE_STROKE } from "@/app/paint";
import type { Point } from "@/lib/geo";
import type { Town } from "@/lib/glance";
import type { Ranked } from "@/lib/rank";
import { pavingLines } from "@/lib/verdict";

const PAD = 28;
const LABELS = 4;
const KINDS = ["city", "town", "village"];

interface Label {
  name: string;
  x: number;
  y: number;
  end: boolean;
}

const overlaps = (a: Label, b: Label) =>
  Math.abs(a.y - b.y) < 22 &&
  Math.abs(a.x - b.x) < (Math.max(a.name.length, b.name.length) + 2) * 9.5;

const labels = (
  towns: Town[],
  toXY: (point: Point) => Point,
  [width, height]: [number, number],
  avoid: Point[]
) => {
  const placed: Label[] = avoid.map(([x, y]) => ({
    end: false,
    name: "",
    x,
    y,
  }));

  const inside = towns
    .flatMap(([name, kind, lon, lat]) => {
      const [x, y] = toXY([lon, lat]);
      const room = name.length * 9.5 + 12;
      const shown = x > 8 && x < width - 8 && y > 24 && y < height - 8;

      return shown ? [{ end: x + room > width, kind, name, x, y }] : [];
    })
    .toSorted(
      (a, b) =>
        KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) ||
        Math.hypot(a.x - width / 2, a.y - height / 2) -
          Math.hypot(b.x - width / 2, b.y - height / 2)
    );

  for (const town of inside) {
    if (placed.length - avoid.length >= LABELS) {
      break;
    }

    if (!placed.some((label) => overlaps(label, town))) {
      placed.push(town);
    }
  }

  return placed.slice(avoid.length);
};

const useSize = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<[number, number] | null>(null);

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      for (const { contentRect } of entries) {
        setSize([contentRect.width, contentRect.height]);
      }
    });

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  return [ref, size] as const;
};

const projector = (points: Point[], [width, height]: [number, number]) => {
  const lons = points.map(([lon]) => lon);
  const lats = points.map(([, lat]) => lat);
  const north = Math.max(...lats);
  const west = Math.min(...lons);
  const squeeze = Math.cos(((north + Math.min(...lats)) / 2) * (Math.PI / 180));
  const spanX = Math.max((Math.max(...lons) - west) * squeeze, 1e-4);
  const spanY = Math.max(north - Math.min(...lats), 1e-4);
  const scale = Math.min((width - PAD * 2) / spanX, (height - PAD * 2) / spanY);
  const left = (width - spanX * scale) / 2;
  const top = (height - spanY * scale) / 2;

  return ([lon, lat]: Point): Point => [
    left + (lon - west) * squeeze * scale,
    top + (north - lat) * scale,
  ];
};

const pathOf = (line: Point[], toXY: (point: Point) => Point) =>
  line
    .map((point) => {
      const [x, y] = toXY(point);

      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

const Drawing = ({
  origin,
  place,
  picks,
  shown,
  size,
  towns,
}: {
  origin: Point;
  place: string | null;
  picks: Ranked[];
  shown: Ranked;
  size: [number, number];
  towns: Town[];
}) => {
  const toXY = projector([origin, ...shown.road.line], size);
  const [youX, youY] = toXY(origin);
  const [startX, startY] = toXY(shown.start);
  const line = pathOf(shown.road.line, toXY);

  const named = labels(
    towns.filter(([name]) => name !== place),
    toXY,
    size,
    [toXY(origin), toXY(shown.start)]
  );

  const placeEnd = youX > size[0] / 2;

  return (
    <svg
      aria-hidden="true"
      className="block"
      height={size[1]}
      viewBox={`0 0 ${size[0]} ${size[1]}`}
      width={size[0]}
    >
      {picks.flatMap(({ road }) =>
        road.id === shown.road.id
          ? []
          : [
              <polyline
                className="fill-none stroke-mute opacity-35"
                key={road.id}
                points={pathOf(road.line, toXY)}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
              />,
            ]
      )}
      {named.map(({ name, x, y, end }) => (
        <g className="fill-mute" key={name}>
          <rect height={6} width={6} x={x - 3} y={y - 3} />
          <text
            className="stroke-paper text-base font-semibold"
            paintOrder="stroke"
            strokeWidth={4}
            textAnchor={end ? "end" : "start"}
            x={end ? x - 8 : x + 8}
            y={y + 5}
          >
            {name}
          </text>
        </g>
      ))}
      <line
        className="stroke-ink"
        strokeDasharray="1 9"
        strokeLinecap="round"
        strokeWidth={4}
        x1={youX}
        x2={startX}
        y1={youY}
        y2={startY}
      />
      <polyline
        className="fill-none stroke-ink"
        points={line}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={14}
      />
      {pavingLines(shown.road).map((piece, index) => (
        <polyline
          className={`fill-none ${GRADE_STROKE[piece.grade] ?? ""}`}
          key={`${index}${piece.grade}`}
          points={pathOf(piece.line, toXY)}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={8}
        />
      ))}
      <rect
        className="fill-paper stroke-ink"
        height={16}
        strokeWidth={4}
        width={16}
        x={startX - 8}
        y={startY - 8}
      />
      <circle
        className="fill-hi stroke-ink"
        cx={youX}
        cy={youY}
        r={10}
        strokeWidth={4}
      />
      {place !== null && (
        <text
          className="fill-ink stroke-paper text-base font-bold"
          paintOrder="stroke"
          strokeWidth={4}
          textAnchor={placeEnd ? "end" : "start"}
          x={placeEnd ? youX - 16 : youX + 16}
          y={youY + 6}
        >
          {place}
        </text>
      )}
    </svg>
  );
};

export const Sketch = ({
  origin,
  place,
  picks,
  shown,
  towns,
}: {
  origin: Point | null;
  place: string | null;
  picks: Ranked[];
  shown: Ranked | null;
  towns: Town[];
}) => {
  const [ref, size] = useSize();
  const ready = size !== null && origin !== null && shown !== null;

  return (
    <div className="size-full" ref={ref}>
      {ready && (
        <Drawing
          origin={origin}
          place={place}
          picks={picks}
          shown={shown}
          size={size}
          towns={towns}
        />
      )}
    </div>
  );
};
