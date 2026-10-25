"use client";

import { appleMaps, googleMaps } from "@/lib/rank";
import type { Ranked } from "@/lib/rank";
import type { Road } from "@/lib/road";

const title = (road: Road) => road.name || road.ref;

const subtitle = (road: Road) =>
  [road.name && road.ref, road.town && `near ${road.town}`]
    .filter(Boolean)
    .join(" · ");

const awayText = ({ minutes, estimated }: Ranked) => {
  if (minutes < 2) {
    return "you're on it";
  }

  const rounded =
    minutes < 60
      ? `${Math.round(minutes)} min`
      : `${Math.floor(minutes / 60)} h ${Math.round(minutes % 60)} min`;

  return `${estimated ? "about " : ""}${rounded} away`;
};

const Bar = ({ label, value }: { label: string; value: number | null }) => (
  <div className="min-w-0 flex-1">
    <div className="flex justify-between text-[11px] font-semibold tracking-wide uppercase">
      <span>{label}</span>
      <span className="text-mute tabular-nums">{value ?? "?"}</span>
    </div>
    <div className="mt-0.5 h-1.5 border border-ink">
      <div className="h-full bg-ink" style={{ width: `${value ?? 0}%` }} />
    </div>
  </div>
);

const Bars = ({ road }: { road: Road }) => (
  <div className="flex gap-3">
    <Bar label="Twisty" value={road.twisty} />
    <Bar label="Scenic" value={road.scenic} />
    <Bar label="Smooth" value={road.smooth} />
    <Bar label="Quiet" value={road.quiet} />
  </div>
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
  const { road, closures } = ranked;

  return (
    <li className="border-b-2 border-ink">
      <button
        className="flex w-full gap-3 p-3 text-left active:bg-hi/40"
        onClick={() => {
          onSelect(road.id);
        }}
        type="button"
      >
        <span className="w-6 shrink-0 text-lg font-black tabular-nums">
          {index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-bold">
            {title(road)}
          </span>
          <span className="block truncate text-sm text-mute">
            {[subtitle(road), `${road.miles} mi long`, awayText(ranked)]
              .filter(Boolean)
              .join(" · ")}
          </span>
          {closures.length > 0 && (
            <span className="mt-1 inline-block bg-warn px-1.5 text-xs font-bold text-white">
              {closures[0]?.kind === "Full"
                ? "Closed now"
                : "Traffic control now"}
            </span>
          )}
          <span className="mt-2 block">
            <Bars road={road} />
          </span>
        </span>
      </button>
    </li>
  );
};

const Fact = ({ label, value }: { label: string; value: string }) => (
  <div className="border-b border-ink/20 py-2">
    <div className="text-xs font-semibold tracking-wide text-mute uppercase">
      {label}
    </div>
    <div>{value}</div>
  </div>
);

const grade = (iri: number) => {
  if (iri < 95) {
    return "Good";
  }

  return iri < 170 ? "Fair" : "Rough";
};

const pavementText = (road: Road) => {
  const surface =
    road.paved === null
      ? " Surface not confirmed paved; could be partly dirt."
      : "";

  if (road.iri === null) {
    return `No roughness measurement yet.${surface}`;
  }

  return `${grade(road.iri)}: roughness ${road.iri} in/mi, where under 95 is good.${surface}`;
};

const curvesText = (road: Road) => {
  if (road.curvature === 0) {
    return "Mostly straight or gentle sweepers";
  }

  return `${Math.round(road.curvature / road.miles).toLocaleString()} curve points per mile (300+ is fun, 1,000+ is very twisty)`;
};

const scenicText = (road: Road) => {
  const parts = [
    road.scenicStatus &&
      `Caltrans scenic highway (${road.scenicStatus.toLowerCase()})`,
    road.coast && "runs along the coast",
    road.viewCount > 0 &&
      `${road.viewCount} viewpoint${road.viewCount === 1 ? "" : "s"} on the way`,
  ].filter(Boolean);

  return parts.length === 0
    ? "No scenic signals in our data yet"
    : parts.join(", ");
};

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

  return (
    <section className="min-h-0 flex-1 overflow-y-auto p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
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
        {[subtitle(road), `${road.miles} mi long`, awayText(ranked)]
          .filter(Boolean)
          .join(" · ")}
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
      <p className="mt-1 text-xs text-mute">
        Takes you to the near end, then along the whole road.
      </p>
      <div className="mt-4">
        <Bars road={road} />
      </div>
      <div className="mt-3">
        <Fact label="Curves" value={curvesText(road)} />
        <Fact label="Scenic" value={scenicText(road)} />
        {road.views.length > 0 && (
          <Fact label="Viewpoints" value={road.views.join(", ")} />
        )}
        <Fact label="Pavement" value={pavementText(road)} />
        <Fact
          label="Traffic"
          value={`${road.aadtMeasured ? "" : "about "}${road.aadt.toLocaleString()} cars a day${road.aadtMeasured ? "" : " (guessed from road type)"}`}
        />
      </div>
      <p className="mt-4 text-xs text-mute">
        Live closures cover state highways only. Road data © OpenStreetMap
        contributors, Caltrans, FHWA HPMS. Check conditions before you go.
      </p>
    </section>
  );
};
