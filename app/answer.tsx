import type { ReactNode } from "react";

import { GRADE_FILL } from "@/app/paint";
import type { Closure } from "@/lib/closure";
import type { Point } from "@/lib/geo";
import {
  clock,
  driveMinutes,
  heading,
  pavementOf,
  pavementText,
  roughMiles,
  title,
  traits,
} from "@/lib/glance";
import type { OnRoad, Paving } from "@/lib/on-road";
import type { Ranked } from "@/lib/rank";
import type { Road } from "@/lib/road";
import { GRADE_NAMES, pavingFrom } from "@/lib/verdict";

const tenths = (miles: number) => Math.round(miles * 10) / 10;

const nameSize = (name: string) => {
  if (name.length <= 20) {
    return "text-[1.875rem]";
  }

  return name.length <= 26 ? "text-[1.5rem]" : "text-[1.375rem]";
};

const Strip = ({ paving, from }: { paving: Paving; from: ReactNode }) => (
  <div aria-hidden="true" className="flex h-6 items-center gap-1.5">
    {from}
    <div className="flex h-full flex-1 border-[3px] border-ink">
      {paving.map(([miles, grade], index) => (
        <div
          className={`${GRADE_FILL[grade] ?? ""} h-full`}
          key={`${index}${grade}`}
          style={{ flexGrow: miles }}
        />
      ))}
    </div>
  </div>
);

const START = <span className="size-4 shrink-0 border-[3px] border-ink" />;

const YOU = (
  <span className="size-5 shrink-0 rounded-full border-[3px] border-ink bg-hi" />
);

const sourceText = (road: Road) =>
  road.pavedBy
    .map(({ name, from, to }) => {
      const years =
        from === to || to === null ? `${from ?? ""}` : `${from ?? ""}–${to}`;

      return `${name} ${years}`.trim();
    })
    .join(", ");

const untilText = (until: number | null) =>
  until === null
    ? "until further notice"
    : `until ${new Date(until * 1000).toLocaleString([], { hour: "numeric", minute: "2-digit", weekday: "short" })}`;

const aheadText = (ahead: Paving) => {
  const [next, then] = ahead.filter(([miles]) => miles >= 0.05);

  if (next === undefined) {
    return "End of the road";
  }

  const first = `${GRADE_NAMES[next[1]]} for ${tenths(next[0])} mi`;

  return then === undefined
    ? `${first} to the end`
    : `${first}, then ${GRADE_NAMES[then[1]].toLowerCase()}`;
};

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

const Card = ({
  road,
  closures,
  stats,
  paving,
  from,
  pavement,
  children,
}: {
  road: Road;
  closures: Closure[];
  stats: ReactNode;
  paving: Paving;
  from: ReactNode;
  pavement: ReactNode;
  children?: ReactNode;
}) => {
  const about = [...traits(road), road.town && `near ${road.town}`]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2
          className={`line-clamp-2 leading-[1.1] font-black tracking-tight ${nameSize(title(road))}`}
        >
          {title(road)}
        </h2>
        <p className="mt-1 truncate text-lg text-mute">{about || " "}</p>
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
      <div className="grid grid-cols-2 gap-3">{stats}</div>
      <div className="flex flex-col gap-1.5">
        <Strip from={from} paving={paving} />
        <p className="truncate text-lg font-bold">{pavement}</p>
        {children}
      </div>
    </div>
  );
};

export const Answer = ({
  ranked,
  from,
  detail,
}: {
  ranked: Ranked;
  from: Point;
  detail: boolean;
}) => {
  const { road, minutes, estimated, closures } = ranked;
  const rough = tenths(roughMiles(road));

  return (
    <Card
      closures={closures}
      from={START}
      paving={pavingFrom(road, ranked.start)}
      pavement={
        <>
          {pavementText(pavementOf(road))}
          {rough > 0 && (
            <span className="font-semibold text-mute"> · {rough} mi rough</span>
          )}
        </>
      }
      road={road}
      stats={
        <>
          <Stat
            label={`${estimated ? "about, " : ""}to the start, ${heading(from, ranked.start)}`}
            value={minutes < 2 ? "Here" : clock(minutes)}
          />
          <Stat
            label={`${road.miles} mi of road`}
            value={clock(driveMinutes(road))}
          />
        </>
      }
    >
      {detail && road.pavedBy.length > 0 && (
        <p className="text-base text-mute">From {sourceText(road)}</p>
      )}
      {detail &&
        road.reports.slice(0, 1).map((quote) => (
          <p className="line-clamp-3 text-base" key={quote.url}>
            “{quote.text}”{" "}
            <a
              className="inline-flex min-h-11 items-center font-semibold text-mute underline underline-offset-2"
              href={quote.url}
            >
              {quote.site}
              {quote.year === null ? "" : `, ${quote.year}`}
            </a>
          </p>
        ))}
    </Card>
  );
};

export const OnRoadAnswer = ({
  on,
  closures,
}: {
  on: OnRoad;
  closures: Closure[];
}) => {
  const share = on.road.miles === 0 ? 0 : on.left / on.road.miles;

  return (
    <Card
      closures={closures}
      from={YOU}
      paving={on.ahead}
      pavement={aheadText(on.ahead)}
      road={on.road}
      stats={
        <>
          <Stat label="left on this road" value={`${tenths(on.left)} mi`} />
          <Stat
            label="to its end"
            value={clock(driveMinutes(on.road) * share)}
          />
        </>
      }
    />
  );
};
