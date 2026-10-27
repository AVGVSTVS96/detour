import { GRADE_FILL } from "@/app/paint";
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
import type { Ranked } from "@/lib/rank";
import { pavingFrom } from "@/lib/verdict";

const tenths = (miles: number) => Math.round(miles * 10) / 10;

const nameSize = (name: string) => {
  if (name.length <= 20) {
    return "text-[1.875rem]";
  }

  return name.length <= 26 ? "text-[1.5rem]" : "text-[1.375rem]";
};

export const Strip = ({ ranked }: { ranked: Ranked }) => (
  <div aria-hidden="true" className="flex h-6 border-[3px] border-ink">
    {pavingFrom(ranked.road, ranked.start).map(([miles, grade], index) => (
      <div
        className={`${GRADE_FILL[grade] ?? ""} h-full`}
        key={`${index}${grade}`}
        style={{ flexGrow: miles }}
      />
    ))}
  </div>
);

const sourceText = (ranked: Ranked) =>
  ranked.road.pavedBy
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
  const away = minutes < 2 ? "Here" : clock(minutes);
  const rough = tenths(roughMiles(road));

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
        <p className="mt-1 truncate text-lg text-mute">{about || "\u00A0"}</p>
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
        <Strip ranked={ranked} />
        <p className="truncate text-lg font-bold">
          {pavementText(pavementOf(road))}
          {rough > 0 && (
            <span className="font-semibold text-mute"> · {rough} mi rough</span>
          )}
        </p>
        {detail && road.pavedBy.length > 0 && (
          <p className="text-base text-mute">From {sourceText(ranked)}</p>
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
      </div>
    </div>
  );
};
