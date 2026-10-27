"use client";

import { appleMaps, googleMaps } from "@/lib/rank";
import type { Ranked } from "@/lib/rank";
import type { PavementSource, Report, Road } from "@/lib/road";
import {
  pavementVerdict,
  pavingFrom,
  pavingShares,
  scenicVerdict,
  trafficVerdict,
  twistyVerdict,
} from "@/lib/verdict";
import type { Tone } from "@/lib/verdict";

export const title = (road: Road) => road.name || road.ref;

const GRADE_FILL = ["bg-unknown", "bg-smooth", "bg-fair", "bg-rough"];

const TONE_FILL: Record<Tone, string> = {
  bad: "bg-rough",
  good: "bg-smooth",
  plain: "bg-fair",
  unknown: "bg-unknown",
};

export const Swatch = ({ tone }: { tone: Tone }) => (
  <span
    aria-hidden
    className={`inline-block size-3 shrink-0 border border-ink ${TONE_FILL[tone]}`}
  />
);

export const Strip = ({
  paving,
  tall,
}: {
  paving: Road["paving"];
  tall?: boolean;
}) => (
  <span
    aria-hidden
    className={`flex w-full overflow-hidden border-2 border-ink ${tall === true ? "h-6" : "h-3"}`}
  >
    {paving.map(([miles, grade], index) => (
      <span
        className={GRADE_FILL[grade]}
        key={`${index}-${miles}`}
        style={{ flexGrow: miles }}
      />
    ))}
  </span>
);

const awayText = ({ minutes, estimated }: Ranked) => {
  if (minutes < 2) {
    return "you're on it";
  }

  const rounded =
    minutes < 60
      ? `${Math.round(minutes)} min`
      : `${Math.floor(minutes / 60)} h ${Math.round(minutes % 60)} min`;

  return estimated ? `~${rounded}` : rounded;
};

const whereText = (road: Road) =>
  [road.name && road.ref, road.town && `near ${road.town}`, `${road.miles} mi`]
    .filter(Boolean)
    .join(" · ");

const closureText = ({ closures }: Ranked) =>
  closures[0]?.kind === "Full" ? "Closed now" : "Lane closure now";

const Directions = ({ ranked }: { ranked: Ranked }) => (
  <div className="grid grid-cols-2 gap-2">
    <a
      className="flex h-12 items-center justify-center border-2 border-ink bg-hi font-bold text-[#0a0a0a]"
      href={appleMaps(ranked)}
    >
      Apple Maps
    </a>
    <a
      className="flex h-12 items-center justify-center border-2 border-ink bg-paper font-bold"
      href={googleMaps(ranked)}
    >
      Google Maps
    </a>
  </div>
);

export const Card = ({
  ranked,
  rank,
  onOpen,
}: {
  ranked: Ranked;
  rank: number;
  onOpen: () => void;
}) => {
  const { road, start, closures } = ranked;
  const pavement = pavementVerdict(road);

  return (
    <article className="flex w-[calc(100vw-44px)] max-w-md shrink-0 snap-center flex-col gap-2 border-2 border-ink bg-paper p-3">
      <button
        className="flex min-h-11 w-full items-start gap-2 text-left"
        onClick={onOpen}
        type="button"
      >
        <span className="flex size-7 shrink-0 items-center justify-center bg-ink font-black text-paper tabular-nums">
          {rank}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="line-clamp-2 text-xl leading-6 font-black tracking-tight">
              {title(road)}
            </span>
            <span className="shrink-0 text-xl leading-7 font-black tabular-nums">
              {awayText(ranked)}
            </span>
          </span>
          <span className="block truncate text-mute">{whereText(road)}</span>
        </span>
      </button>
      <Strip paving={pavingFrom(road, start)} />
      <p className="flex flex-wrap items-center gap-x-1.5 leading-6">
        {closures.length > 0 && (
          <span className="inline-flex items-center gap-1.5 font-bold">
            <Swatch tone="bad" />
            {closureText(ranked)} ·
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 font-bold">
          <Swatch tone={pavement.tone} />
          {pavement.word} ·
        </span>
        <span>{twistyVerdict(road).word} ·</span>
        <span>{scenicVerdict(road).word}</span>
      </p>
      <div className="mt-auto">
        <Directions ranked={ranked} />
      </div>
    </article>
  );
};

const years = ({ from, to }: PavementSource) => {
  if (from === null) {
    return "";
  }

  return from === to || to === null ? ` ${from}` : ` ${from}–${to}`;
};

const sourcesText = (road: Road) =>
  road.pavedBy
    .map(
      (source) =>
        `${source.kind === "riders" ? "rider reports" : source.name}${years(source)}, ${source.miles} mi`
    )
    .join(" · ");

const mi = (miles: number) =>
  miles >= 10 ? Math.round(miles) : Math.round(miles * 10) / 10;

const Pavement = ({ ranked }: { ranked: Ranked }) => {
  const { road, start } = ranked;
  const verdict = pavementVerdict(road);
  const [unknown = 0, smooth = 0, fair = 0, rough = 0] = pavingShares(road);

  const parts = [
    { grade: 1, miles: smooth, word: "smooth" },
    { grade: 2, miles: fair, word: "fair" },
    { grade: 3, miles: rough, word: "rough" },
    { grade: 0, miles: unknown, word: "no data" },
  ].filter(({ miles }) => miles >= 0.05);

  return (
    <section className="flex flex-col gap-2 border-t-2 border-ink pt-3">
      <h3 className="flex items-center justify-between gap-2">
        <span className="font-bold tracking-wide uppercase">Pavement</span>
        <span className="inline-flex items-center gap-2 text-xl font-black">
          <Swatch tone={verdict.tone} />
          {verdict.word}
        </span>
      </h3>
      <Strip paving={pavingFrom(road, start)} tall />
      <p className="flex justify-between tabular-nums">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-3.5 border-[3px] border-paper bg-ink outline-2 outline-ink"
          />
          Near end
        </span>
        <span>Far end, {road.miles} mi</span>
      </p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {parts.map(({ grade, miles, word }) => (
          <li className="inline-flex items-center gap-1.5" key={word}>
            <span
              aria-hidden
              className={`inline-block size-3 border border-ink ${GRADE_FILL[grade]}`}
            />
            {mi(miles)} mi {word}
          </li>
        ))}
      </ul>
      {road.pavedBy.length > 0 && (
        <p className="text-mute">From {sourcesText(road)}</p>
      )}
    </section>
  );
};

const Bar = ({ label, value }: { label: string; value: number | null }) => (
  <li className="grid grid-cols-[4.5rem_1fr_2rem] items-center gap-2">
    <span>{label}</span>
    <span className="h-3 border-2 border-ink">
      <span
        className="block h-full bg-ink"
        style={{ width: `${value ?? 0}%` }}
      />
    </span>
    <span className="text-right font-bold tabular-nums">{value ?? "?"}</span>
  </li>
);

const Fact = ({ label, value }: { label: string; value: string }) => (
  <div className="grid grid-cols-[5.5rem_1fr] gap-2 border-t border-ink/30 py-2">
    <dt className="font-bold">{label}</dt>
    <dd>{value}</dd>
  </div>
);

const curvesText = (road: Road) => {
  const { word } = twistyVerdict(road);

  return road.curvature === 0
    ? word
    : `${word}, ${Math.round(road.curvature / road.miles).toLocaleString()} curve points a mile`;
};

const climbText = (road: Road) =>
  road.low === null || road.high === null
    ? null
    : `${road.low.toLocaleString()} to ${road.high.toLocaleString()} ft`;

const viewsText = (road: Road) => {
  const parts = [
    scenicVerdict(road).word,
    road.scenicStatus && `Caltrans scenic highway`,
    road.views.length > 0 && road.views.slice(0, 4).join(", "),
  ];

  return parts.filter(Boolean).join(" · ");
};

const trafficText = (road: Road) =>
  `${trafficVerdict(road).word}, ${road.aadtMeasured ? "" : "about "}${road.aadt.toLocaleString()} cars a day`;

const untilText = (until: number | null) =>
  until === null
    ? "until further notice"
    : `until ${new Date(until * 1000).toLocaleString([], { hour: "numeric", minute: "2-digit", weekday: "short" })}`;

const TOPIC_ORDER = ["closure", "pavement", "safety", "twistiness", "scenery"];

const TOPIC_WORD = new Map([
  ["closure", "closure"],
  ["pavement", "pavement"],
  ["safety", "safety"],
  ["scenery", "views"],
  ["twistiness", "curves"],
]);

const byTopic = (a: Report, b: Report) =>
  TOPIC_ORDER.indexOf(a.topic) - TOPIC_ORDER.indexOf(b.topic) ||
  (b.year ?? 0) - (a.year ?? 0);

const Reports = ({ road }: { road: Road }) =>
  road.reports.length > 0 && (
    <section className="border-t-2 border-ink pt-3">
      <h3 className="font-bold tracking-wide uppercase">
        Riders say ({road.reports.length})
      </h3>
      <ul className="mt-1">
        {road.reports
          .toSorted(byTopic)
          .slice(0, 8)
          .map((report) => (
            <li
              className="border-t border-ink/30"
              key={report.url + report.text}
            >
              <a
                className="flex flex-col gap-0.5 py-2"
                href={report.url}
                rel="noreferrer"
                target="_blank"
              >
                <span>“{report.text}”</span>
                <span className="text-mute underline underline-offset-2">
                  {[report.year, report.site, TOPIC_WORD.get(report.topic)]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </a>
            </li>
          ))}
      </ul>
    </section>
  );

export const Story = ({
  ranked,
  onBack,
}: {
  ranked: Ranked;
  onBack: () => void;
}) => {
  const { road, closures } = ranked;
  const climb = climbText(road);

  return (
    <article className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-start gap-2 border-b-2 border-ink p-3 pb-2">
        <button
          aria-label="Back to drives"
          className="flex size-11 shrink-0 items-center justify-center border-2 border-ink bg-paper text-2xl font-black"
          onClick={onBack}
          type="button"
        >
          ←
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl leading-7 font-black tracking-tight">
            {title(road)}
          </h2>
          <p className="text-mute">
            {whereText(road)} · {awayText(ranked)} away
          </p>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3 pb-[max(16px,env(safe-area-inset-bottom))]">
        {closures.map((closure) => (
          <p
            className="border-2 border-l-[12px] border-ink border-l-rough p-2 font-bold"
            key={`${closure.from.join(",")}${closure.kind}`}
          >
            {closure.kind === "Full" ? "Closed" : closure.kind} on{" "}
            {closure.route}, {closure.work.toLowerCase()},{" "}
            {untilText(closure.until)}
          </p>
        ))}
        <Directions ranked={ranked} />
        <Pavement ranked={ranked} />
        <ul className="flex flex-col gap-1.5 border-t-2 border-ink pt-3">
          <Bar label="Twisty" value={road.twisty} />
          <Bar label="Scenic" value={road.scenic} />
          <Bar label="Smooth" value={road.smooth} />
          <Bar label="Quiet" value={road.quiet} />
        </ul>
        <dl>
          <Fact label="Curves" value={curvesText(road)} />
          {climb !== null && <Fact label="Climb" value={climb} />}
          <Fact label="Views" value={viewsText(road)} />
          <Fact label="Traffic" value={trafficText(road)} />
        </dl>
        <Reports road={road} />
        <p className="text-mute">
          Live closures cover state highways only. Data from OpenStreetMap,
          Caltrans, FHWA, county and city pavement surveys, and rider reports.
        </p>
      </div>
    </article>
  );
};
