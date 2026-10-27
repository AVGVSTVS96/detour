"use client";

import type { ReactNode } from "react";

import { appleMaps, googleMaps } from "@/lib/rank";
import type { Ranked } from "@/lib/rank";
import type { PavementSource, Report, Road } from "@/lib/road";
import {
  GRADE_NAMES,
  pavementVerdict,
  pavingFrom,
  pavingShares,
  scenicVerdict,
  tagsOf,
  trafficVerdict,
  twistyVerdict,
} from "@/lib/verdict";
import type { Tone, Verdict } from "@/lib/verdict";

const title = (road: Road) => road.name || road.ref;

const subtitle = (road: Road) =>
  [road.name && road.ref, road.town && `near ${road.town}`, `${road.miles} mi`]
    .filter(Boolean)
    .join(" · ");

const awayText = ({ minutes, estimated }: Ranked) => {
  if (minutes < 2) {
    return "here";
  }

  const rounded =
    minutes < 60
      ? `${Math.round(minutes)} min`
      : `${Math.floor(minutes / 60)} h ${Math.round(minutes % 60)}`;

  return `${estimated ? "~" : ""}${rounded}`;
};

const TONES: Record<Tone, string> = {
  bad: "font-bold text-warn",
  good: "",
  plain: "",
  unknown: "text-mute",
};

const GRADE_COLORS = ["bg-unknown", "bg-smooth", "bg-fair", "bg-warn"];

const ClosureBadge = ({ ranked }: { ranked: Ranked }) =>
  ranked.closures.length > 0 && (
    <span className="mt-1 inline-block bg-warn px-1.5 text-xs font-bold text-white">
      {ranked.closures[0]?.kind === "Full"
        ? "Closed now"
        : "Traffic control now"}
    </span>
  );

export const RoadRow = ({
  ranked,
  index,
  onSelect,
}: {
  ranked: Ranked;
  index: number;
  onSelect: (id: string) => void;
}) => {
  const { road } = ranked;

  return (
    <li className="border-b-2 border-ink">
      <button
        className="flex w-full gap-3 p-3 text-left active:bg-hi/40"
        onClick={() => {
          onSelect(road.id);
        }}
        type="button"
      >
        <span className="w-6 shrink-0 text-lg leading-6 font-black tabular-nums">
          {index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className="truncate text-base leading-6 font-bold">
              {title(road)}
            </span>
            <span className="shrink-0 font-bold tabular-nums">
              {awayText(ranked)}
            </span>
          </span>
          <span className="block truncate text-sm text-mute">
            {subtitle(road)}
          </span>
          <ClosureBadge ranked={ranked} />
          <span className="mt-1 block text-sm">
            {tagsOf(road).map((tag, at) => (
              <span key={tag.word}>
                {at > 0 && <span className="text-mute"> · </span>}
                <span className={`whitespace-nowrap ${TONES[tag.tone]}`}>
                  {tag.word}
                </span>
              </span>
            ))}
          </span>
        </span>
      </button>
    </li>
  );
};

const Section = ({
  label,
  verdict,
  children,
}: {
  label: string;
  verdict: Verdict;
  children: ReactNode;
}) => (
  <section className="border-t-2 border-ink py-3">
    <h3 className="flex items-baseline justify-between gap-3">
      <span className="text-xs font-bold tracking-wide uppercase">{label}</span>
      <span className={`font-bold ${TONES[verdict.tone]}`}>{verdict.word}</span>
    </h3>
    <div className="mt-2 space-y-2 text-sm">{children}</div>
  </section>
);

const Meter = ({ value }: { value: number }) => (
  <div className="h-2 border-2 border-ink">
    <div className="h-full bg-ink" style={{ width: `${value}%` }} />
  </div>
);

const yearsText = ({ from, to }: PavementSource) => {
  if (from === null || to === null) {
    return "";
  }

  return from === to ? ` ${to}` : ` ${from}–${to}`;
};

const sourceText = (source: PavementSource) => {
  const years = yearsText(source);

  if (source.kind === "measured") {
    return `Surveyed by ${source.name}${years}, ${source.miles} mi`;
  }

  return source.kind === "riders"
    ? `Rider reports${years}, ${source.miles} mi`
    : `OpenStreetMap mappers, ${source.miles} mi`;
};

const Quote = ({ report }: { report: Report }) => (
  <figure className="border-l-4 border-ink pl-2">
    <blockquote>“{report.text}”</blockquote>
    <figcaption className="text-xs text-mute">
      <a className="underline underline-offset-2" href={report.url}>
        {report.site}
      </a>
      {report.year !== null && `, ${report.year}`}
    </figcaption>
  </figure>
);

const PavementStrip = ({ ranked }: { ranked: Ranked }) => {
  const { road } = ranked;
  const runs = pavingFrom(road, ranked.start);
  const shares = pavingShares(road);

  return (
    <div>
      <div className="flex h-4 border-2 border-ink">
        {runs.map(([miles, grade], index) => (
          <div
            className={GRADE_COLORS[grade]}
            key={`${grade}:${runs.slice(0, index).reduce((sum, [before]) => sum + before, 0)}`}
            style={{ flexGrow: miles }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-mute tabular-nums">
        <span>near end</span>
        <span>{road.miles} mi</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 text-xs">
        {[1, 2, 3, 0].flatMap((grade) =>
          (shares[grade] ?? 0) > 0
            ? [
                <span className="flex items-center gap-1" key={grade}>
                  <span
                    className={`size-2.5 border border-ink ${GRADE_COLORS[grade]}`}
                  />
                  {GRADE_NAMES[grade]}{" "}
                  {Math.round((shares[grade] ?? 0) * 10) / 10} mi
                </span>,
              ]
            : []
        )}
      </div>
    </div>
  );
};

const curvesText = (road: Road) =>
  road.curvature === 0
    ? "Mostly straight or long sweepers."
    : `${Math.round(road.curvature / road.miles).toLocaleString()} curve points per mile. 300 is fun, 1,000 is very twisty.`;

const sceneryText = (road: Road) =>
  [
    road.low !== null &&
      road.high !== null &&
      `Elevation ${road.low.toLocaleString()} to ${road.high.toLocaleString()} ft`,
    road.scenicStatus &&
      `Caltrans scenic highway (${road.scenicStatus.toLowerCase()})`,
    road.coast && "Runs along the coast",
    road.viewCount > 0 &&
      `${road.viewCount} viewpoint${road.viewCount === 1 ? "" : "s"} on the way${road.views.length > 0 ? `: ${road.views.join(", ")}` : ""}`,
  ]
    .filter(Boolean)
    .join(". ");

const untilText = (until: number | null) =>
  until === null
    ? "until further notice"
    : `until ${new Date(until * 1000).toLocaleString([], { hour: "numeric", minute: "2-digit", weekday: "short" })}`;

export const RoadDetail = ({
  ranked,
  onBack,
}: {
  ranked: Ranked;
  onBack: () => void;
}) => {
  const { road, closures } = ranked;

  const pavementReports = road.reports.filter(
    ({ topic }) => topic === "pavement"
  );

  const otherReports = road.reports.filter(({ topic }) => topic !== "pavement");
  const [unknown = 0] = pavingShares(road);

  return (
    <section className="min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
      <button
        className="text-sm font-semibold underline underline-offset-2"
        onClick={onBack}
        type="button"
      >
        All roads
      </button>
      <h2 className="mt-2 text-2xl leading-tight font-black tracking-tight">
        {title(road)}
      </h2>
      <p className="text-mute">
        {subtitle(road)} · {awayText(ranked)}
        {ranked.minutes >= 2 && " away"}
      </p>
      {closures.map((closure) => (
        <p
          className="mt-2 bg-warn p-2 text-sm font-bold text-white"
          key={`${closure.from.join(",")}${closure.kind}`}
        >
          {closure.kind === "Full" ? "Closed" : closure.kind} on {closure.route}
          , {closure.work.toLowerCase()}, {untilText(closure.until)}
        </p>
      ))}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <a
          className="border-2 border-ink bg-hi py-3 text-center font-bold text-[#0a0a0a]"
          href={appleMaps(ranked)}
        >
          Apple Maps
        </a>
        <a
          className="border-2 border-ink bg-paper py-3 text-center font-bold"
          href={googleMaps(ranked)}
        >
          Google Maps
        </a>
      </div>
      <p className="mt-1 mb-3 text-xs text-mute">
        Takes you to the near end, then along the whole road.
      </p>
      <Section label="Pavement" verdict={pavementVerdict(road)}>
        <PavementStrip ranked={ranked} />
        {road.pavedBy.map((source) => (
          <p key={`${source.kind}${source.name}`}>{sourceText(source)}</p>
        ))}
        {unknown >= 0.1 && (
          <p className="text-mute">
            No pavement data on {Math.round(unknown * 10) / 10} mi.
          </p>
        )}
        {road.paved === null && (
          <p className="text-mute">Not confirmed paved the whole way.</p>
        )}
        {pavementReports.map((report) => (
          <Quote key={report.url + report.text} report={report} />
        ))}
      </Section>
      <Section label="Curves" verdict={twistyVerdict(road)}>
        <Meter value={road.twisty} />
        <p>{curvesText(road)}</p>
      </Section>
      <Section label="Scenery" verdict={scenicVerdict(road)}>
        <Meter value={road.scenic} />
        {sceneryText(road) && <p>{sceneryText(road)}.</p>}
      </Section>
      <Section label="Traffic" verdict={trafficVerdict(road)}>
        <Meter value={road.quiet} />
        <p>
          {road.aadtMeasured ? "" : "About "}
          {road.aadt.toLocaleString()} cars a day
          {road.aadtMeasured ? ", counted" : ", guessed from the road type"}.
        </p>
      </Section>
      {otherReports.length > 0 && (
        <Section
          label="Riders say"
          verdict={{
            tone: "plain",
            word: `${road.riders} source${road.riders === 1 ? "" : "s"}`,
          }}
        >
          {otherReports.map((report) => (
            <Quote key={report.url + report.text} report={report} />
          ))}
        </Section>
      )}
      <p className="mt-2 border-t-2 border-ink pt-3 text-xs text-mute">
        Live closures cover state highways only. Road data © OpenStreetMap
        contributors, Caltrans, FHWA, city and county pavement surveys, AWS
        Terrain Tiles; rider quotes link to their sources. Check conditions
        before you go.
      </p>
    </section>
  );
};
