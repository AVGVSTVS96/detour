"use client";

import { useEffect, useRef, useState } from "react";

import type { Point } from "@/lib/geo";
import { gradeOf } from "@/lib/glance";
import type { Grade } from "@/lib/glance";
import type { Ranked } from "@/lib/rank";

const STROKE: Record<Grade, string> = {
  fair: "stroke-fair",
  rough: "stroke-rough",
  smooth: "stroke-smooth",
  unknown: "stroke-mute",
};

const PAD = 28;

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
  picks,
  shown,
  size,
}: {
  origin: Point;
  picks: Ranked[];
  shown: Ranked;
  size: [number, number];
}) => {
  const toXY = projector([origin, ...shown.road.line], size);
  const [youX, youY] = toXY(origin);
  const [startX, startY] = toXY(shown.start);
  const line = pathOf(shown.road.line, toXY);

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
      <polyline
        className={`fill-none ${STROKE[gradeOf(shown.road.smooth)]}`}
        points={line}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={8}
      />
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
    </svg>
  );
};

export const Sketch = ({
  origin,
  picks,
  shown,
}: {
  origin: Point | null;
  picks: Ranked[];
  shown: Ranked | null;
}) => {
  const [ref, size] = useSize();
  const ready = size !== null && origin !== null && shown !== null;

  return (
    <div className="size-full" ref={ref}>
      {ready && (
        <Drawing origin={origin} picks={picks} shown={shown} size={size} />
      )}
    </div>
  );
};
