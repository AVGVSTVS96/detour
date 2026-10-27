import type { MultiLineString } from "geojson";

import { cached } from "@/data/cache";
import { smoothFromIri, smoothFromPci } from "@/data/pavement";
import { fetchLayer, linesOf } from "@/data/sources";
import { readJson } from "@/lib/json";

export interface Survey {
  name: string;
  line: number[][];
  smooth: number;
  year: number | null;
}

type Value = string | number | null;

interface ArcSurvey {
  key: string;
  name: string;
  url: string;
  value: string;
  measure: "iri" | "pci";
  date?: string;
  year?: number;
}

const ARCGIS: ArcSurvey[] = [
  {
    date: "iri_vd",
    key: "fhwa-2025",
    measure: "iri",
    name: "FHWA",
    url: "https://geo.dot.gov/server/rest/services/Hosted/HPMS_FULL_CA_2025/FeatureServer/0",
    value: "iri",
  },
  {
    key: "la-city",
    measure: "pci",
    name: "City of LA",
    url: "https://services1.arcgis.com/PTh9WC0Sf2WS7AAq/ArcGIS/rest/services/StreetsLAMap_20240812_LM/FeatureServer/18",
    value: "PCI",
    year: 2024,
  },
  {
    date: "PCI_DATE",
    key: "la-county",
    measure: "pci",
    name: "LA County",
    url: "https://dpw.gis.lacounty.gov/dpw/rest/services/LA_County_PCI_eGIS_PIW/MapServer/0",
    value: "PCI",
  },
  {
    key: "santa-barbara-county",
    measure: "pci",
    name: "Santa Barbara County",
    url: "https://services.arcgis.com/KkJhFbLnXVqahKz2/arcgis/rest/services/Maintained_Roads7/FeatureServer/0",
    value: "Current_PCI",
    year: 2025,
  },
  {
    date: "PCI_InspDate",
    key: "sonoma-county",
    measure: "pci",
    name: "Sonoma County",
    url: "https://socogis.sonomacounty.ca.gov/map/rest/services/TPWPublic/Streets_Pavement_Condtions/FeatureServer/0",
    value: "PCI_Current",
  },
  {
    date: "PCI_Inspection_Date",
    key: "slo-county",
    measure: "pci",
    name: "SLO County",
    url: "https://gis.slocounty.ca.gov/arcgis/rest/services/PWD/PW_PUB_SERVICE/MapServer/67",
    value: "PCI",
  },
  {
    key: "san-diego-county",
    measure: "pci",
    name: "San Diego County",
    url: "https://gis-public.sandiegocounty.gov/arcgis/rest/services/DPW/LEAMS_Assets/MapServer/1",
    value: "PAVEMENT_CONDITION_INDEX",
  },
  {
    date: "pcidate",
    key: "santa-cruz-county",
    measure: "pci",
    name: "Santa Cruz County",
    url: "https://services1.arcgis.com/jJfZghspGKh8J9Jm/arcgis/rest/services/Pavement_Condition_Index/FeatureServer/12",
    value: "pci",
  },
];

const MTC = "https://data.bayareametro.gov/resource/s7d2-ex4k.json";

const SAN_DIEGO =
  "https://seshat.datasd.org/gis_streets_repair_segs/sd_paving_segs_datasd.geojson";

const MTC_PCI = new Map([
  ["Excellent", 95],
  ["Very Good", 85],
  ["Good", 75],
  ["Fair", 65],
  ["At Risk", 55],
  ["Poor", 40],
  ["Failed", 15],
]);

const yearOf = (value: Value | undefined) => {
  if (value === null || value === undefined) {
    return null;
  }

  const year = new Date(value).getUTCFullYear();

  return Number.isFinite(year) && year > 1990 ? year : null;
};

const fetchArcSurvey = async (survey: ArcSurvey) => {
  const fields = [survey.value, survey.date].filter(Boolean).join(",");

  const features = await fetchLayer<Record<string, Value>>(
    survey.url,
    `${survey.value} IS NOT NULL AND ${survey.value} >= 0`,
    fields
  );

  return features.flatMap((feature): Survey[] => {
    const value = Number(feature.properties[survey.value]);

    const smooth =
      survey.measure === "iri" ? smoothFromIri(value) : smoothFromPci(value);

    const year =
      survey.date === undefined
        ? (survey.year ?? null)
        : yearOf(feature.properties[survey.date]);

    return Number.isFinite(value)
      ? linesOf(feature.geometry).map((line) => ({
          line,
          name: survey.name,
          smooth: Math.round(smooth),
          year,
        }))
      : [];
  });
};

interface MtcRow {
  pci_info?: string;
  pci_date?: string;
  geometry?: MultiLineString;
}

const fetchMtc = async (offset = 0): Promise<Survey[]> => {
  const params = new URLSearchParams({
    $limit: "50000",
    $offset: String(offset),
    $order: ":id",
    $select: "pci_info,pci_date,geometry",
  });

  const rows = await readJson<MtcRow[]>(await fetch(`${MTC}?${params}`));

  const surveys = rows.flatMap((row): Survey[] => {
    const pci = MTC_PCI.get(row.pci_info ?? "");

    return pci === undefined || row.geometry === undefined
      ? []
      : row.geometry.coordinates.map((line) => ({
          line,
          name: "MTC (Bay Area)",
          smooth: Math.round(smoothFromPci(pci)),
          year: yearOf(row.pci_date),
        }));
  });

  return rows.length < 50_000
    ? surveys
    : [...surveys, ...(await fetchMtc(offset + 50_000))];
};

interface SanDiegoFeature {
  properties: { pci23: number | null };
  geometry: { type: "LineString"; coordinates: number[][] } | null;
}

const fetchSanDiego = async () => {
  const { features } = await readJson<{ features: SanDiegoFeature[] }>(
    await fetch(SAN_DIEGO)
  );

  return features.flatMap(({ properties, geometry }): Survey[] =>
    properties.pci23 === null || geometry === null
      ? []
      : [
          {
            line: geometry.coordinates,
            name: "City of San Diego",
            smooth: Math.round(smoothFromPci(properties.pci23)),
            year: 2023,
          },
        ]
  );
};

export const loadSurveys = async () => {
  const lists = await Promise.all([
    ...ARCGIS.map(
      async (survey) =>
        await cached(
          `survey-${survey.key}`,
          async () => await fetchArcSurvey(survey)
        )
    ),
    cached("survey-mtc", async () => await fetchMtc()),
    cached("survey-san-diego", fetchSanDiego),
  ]);

  return lists.flat();
};
