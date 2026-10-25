import { cacheLife } from "next/cache";

import type { Closure } from "@/lib/closure";
import { readJson } from "@/lib/json";

const DISTRICTS = Array.from({ length: 12 }, (_, index) =>
  String(index + 1).padStart(2, "0")
);

const BLOCKING = new Set(["Full", "One-Way Traffic", "Alternating Lanes"]);

interface Feed {
  data: {
    lcs: {
      location: {
        begin: {
          beginRoute: string;
          beginLongitude: string;
          beginLatitude: string;
        };
        end: { endLongitude: string; endLatitude: string };
      };
      closure: {
        typeOfClosure: string;
        typeOfWork: string;
        closureTimestamp: {
          closureStartEpoch: string;
          closureEndEpoch: string;
          isClosureEndIndefinite: string;
        };
        code1097: { isCode1097: string };
        code1098: { isCode1098: string };
        code1022: { isCode1022: string };
      };
    };
  }[];
}

const district = async (id: string) => {
  const response = await fetch(
    `https://cwwp2.dot.ca.gov/data/d${Number(id)}/lcs/lcsStatusD${id}.json`
  );

  if (!response.ok) {
    return [];
  }

  const feed = await readJson<Feed>(response);

  const now = Date.now() / 1000;

  return feed.data.flatMap(({ lcs: { location, closure } }): Closure[] => {
    const { closureTimestamp: time } = closure;
    const indefinite = time.isClosureEndIndefinite === "true";

    const inWindow =
      Number(time.closureStartEpoch) <= now &&
      (indefinite || now <= Number(time.closureEndEpoch));

    const inEffect =
      closure.code1097.isCode1097 === "true" &&
      closure.code1098.isCode1098 !== "true";

    if (
      !BLOCKING.has(closure.typeOfClosure) ||
      closure.code1022.isCode1022 === "true" ||
      !(inEffect || inWindow)
    ) {
      return [];
    }

    return [
      {
        from: [
          Number(location.begin.beginLongitude),
          Number(location.begin.beginLatitude),
        ],
        kind: closure.typeOfClosure,
        route: location.begin.beginRoute,
        to: [
          Number(location.end.endLongitude),
          Number(location.end.endLatitude),
        ],
        until: indefinite ? null : Number(time.closureEndEpoch),
        work: closure.typeOfWork,
      },
    ];
  });
};

const closures = async () => {
  "use cache";
  cacheLife("minutes");

  const all = await Promise.all(
    DISTRICTS.map(async (id) => await district(id))
  );

  return all.flat();
};

export const GET = async () => Response.json(await closures());
