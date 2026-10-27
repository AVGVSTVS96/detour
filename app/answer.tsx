import type { Point } from "@/lib/geo";
import {
  clock,
  driveMinutes,
  GRADE_WORDS,
  gradeOf,
  heading,
  title,
  traits,
} from "@/lib/glance";
import type { Grade } from "@/lib/glance";
import type { Ranked } from "@/lib/rank";
import type { Road } from "@/lib/road";

const FILL: Record<Grade, string> = {
  fair: "bg-fair",
  rough: "bg-rough",
  smooth: "bg-smooth",
  unknown: "bg-unknown",
};

const pieces = (road: Road): [number, Grade][] => [
  [road.miles, gradeOf(road.smooth)],
];

export const Strip = ({ road }: { road: Road }) => (
  <div className="flex h-5 border-[3px] border-ink" aria-hidden="true">
    {pieces(road).map(([miles, grade], index) => (
      <div
        className={`${FILL[grade]} h-full border-ink not-first:border-l-2`}
        key={`${index}${grade}`}
        style={{ flexGrow: miles }}
      />
    ))}
  </div>
);

export const smoothText = (smooth: number | null) => {
  const grade = gradeOf(smooth);

  return smooth === null
    ? GRADE_WORDS[grade]
    : `${GRADE_WORDS[grade]} ${smooth}/100`;
};

const untilText = (until: number | null) =>
  until === null
    ? "until further notice"
    : `until ${new Date(until * 1000).toLocaleString([], { hour: "numeric", minute: "2-digit", weekday: "short" })}`;

const Stat = ({ value, label }: { value: string; label: string }) => (
  <div className="min-w-0">
    <div className="text-[2.25rem] leading-none font-black tracking-tight tabular-nums">
      {value}
    </div>
    <div className="mt-1 truncate text-base font-semibold text-mute">
      {label}
    </div>
  </div>
);

export const Answer = ({ ranked, from }: { ranked: Ranked; from: Point }) => {
  const { road, minutes, estimated, closures } = ranked;
  const away = minutes < 2 ? "Here" : clock(minutes);

  const where = [road.town && `near ${road.town}`, road.name && road.ref]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="line-clamp-2 text-[1.875rem] leading-[1.1] font-black tracking-tight">
          {title(road)}
        </h2>
        <p className="mt-1 truncate text-lg text-mute">{where || " "}</p>
      </div>
      {closures.slice(0, 1).map((closure) => (
        <p
          className="bg-closed px-3 py-2 text-base font-bold text-white"
          key={closure.route}
        >
          {closure.kind === "Full" ? "Closed" : closure.kind} on {closure.route}{" "}
          {untilText(closure.until)}
        </p>
      ))}
      <div className="grid grid-cols-2 gap-3">
        <Stat
          label={`${estimated ? "about, " : ""}to the start, ${heading(from, ranked.start)}`}
          value={away}
        />
        <Stat
          label={`${road.miles} mi of road`}
          value={clock(driveMinutes(road))}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Strip road={road} />
        <p className="text-lg font-bold">
          {smoothText(road.smooth)}
          <span className="font-semibold text-mute">
            {traits(road).map((trait) => ` · ${trait}`)}
          </span>
        </p>
      </div>
    </div>
  );
};
