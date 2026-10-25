import type { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";

import { readJson } from "@/lib/json";

const PAGE = 2000;

type Features<P> = FeatureCollection<Geometry | null, P>["features"];

const query = async <P extends GeoJsonProperties>(
  layer: string,
  where: string,
  fields: string,
  offset: number,
  attempt = 1
): Promise<Features<P>> => {
  const params = new URLSearchParams({
    f: "geojson",
    orderByFields: "objectid",
    outFields: fields,
    outSR: "4326",
    resultOffset: String(offset),
    resultRecordCount: String(PAGE),
    where,
  });

  const response = await fetch(`${layer}/query?${params}`);

  if (!response.ok) {
    if (attempt === 6) {
      throw new Error(`${layer} ${response.status}`);
    }

    await Bun.sleep(attempt * 3000);

    return await query<P>(layer, where, fields, offset, attempt + 1);
  }

  const page = await readJson<FeatureCollection<Geometry | null, P>>(response);

  return page.features;
};

export const fetchLayer = async (
  layer: string,
  where: string,
  fields: string,
  offset = 0
): Promise<Features<GeoJsonProperties>> => {
  const page = await query(layer, where, fields, offset);

  if (page.length < PAGE) {
    return page;
  }

  return [...page, ...(await fetchLayer(layer, where, fields, offset + PAGE))];
};

export const LAYERS = {
  pavement:
    "https://geo.dot.gov/server/rest/services/Hosted/California_2018_PR/FeatureServer/0",
  scenic:
    "https://services1.arcgis.com/8CpMUd3fdw6aXef7/arcgis/rest/services/Scenic_Highway_v2/FeatureServer/0",
  vistas:
    "https://caltrans-gis.dot.ca.gov/arcgis/rest/services/CHhighway/Vistas/FeatureServer/0",
};

const linesOf = (geometry: Geometry | null) => {
  if (geometry?.type === "LineString") {
    return [geometry.coordinates];
  }

  if (geometry?.type === "MultiLineString") {
    return geometry.coordinates;
  }

  return [];
};

interface PavementProperties {
  iri: number | null;
  aadt: number | null;
  surface_type: number | null;
}

export interface Pavement {
  iri: number | null;
  aadt: number | null;
  line: number[][];
  unpaved: boolean;
}

export const fetchPavement = async () => {
  const where =
    "iri IS NOT NULL OR aadt IS NOT NULL OR surface_type IS NOT NULL";

  const countUrl = `${LAYERS.pavement}/query?${new URLSearchParams({ f: "json", returnCountOnly: "true", where })}`;
  const counted = await fetch(countUrl);
  const { count } = await readJson<{ count: number }>(counted);

  const offsets = Array.from(
    { length: Math.ceil(count / PAGE) },
    (_, index) => index * PAGE
  );

  const sections: Pavement[] = [];

  const worker = async (): Promise<void> => {
    const offset = offsets.shift();

    if (offset === undefined) {
      return;
    }

    const page = await query<PavementProperties>(
      LAYERS.pavement,
      where,
      "iri,aadt,surface_type",
      offset
    );

    for (const feature of page) {
      for (const line of linesOf(feature.geometry)) {
        sections.push({
          aadt: feature.properties.aadt,
          iri: feature.properties.iri,
          line,
          unpaved: feature.properties.surface_type === 1,
        });
      }
    }

    await worker();
  };

  await Promise.all(Array.from({ length: 4 }, worker));

  return sections;
};
