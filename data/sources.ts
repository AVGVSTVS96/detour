import type { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";

import { readJson } from "@/lib/json";

type Features<P> = FeatureCollection<Geometry | null, P>["features"];

interface LayerInfo {
  objectIdField?: string;
  maxRecordCount?: number;
  fields?: { name: string; type: string }[];
}

const retried = async (url: string, attempt = 1): Promise<Response> => {
  const response = await fetch(url).catch(() => null);

  if (response?.ok === true) {
    return response;
  }

  if (attempt === 6) {
    throw new Error(`${url} ${response?.status ?? "unreachable"}`);
  }

  await Bun.sleep(attempt * 3000);

  return await retried(url, attempt + 1);
};

const layerInfo = async (layer: string) => {
  const info = await readJson<LayerInfo>(await retried(`${layer}?f=json`));

  return {
    oid:
      info.objectIdField ??
      info.fields?.find(({ type }) => type === "esriFieldTypeOID")?.name ??
      "objectid",
    page: Math.min(2000, info.maxRecordCount ?? 1000),
  };
};

export const fetchLayer = async <P extends GeoJsonProperties>(
  layer: string,
  where: string,
  fields: string
) => {
  const { oid, page } = await layerInfo(layer);

  const { count } = await readJson<{ count: number }>(
    await retried(
      `${layer}/query?${new URLSearchParams({ f: "json", returnCountOnly: "true", where })}`
    )
  );

  const offsets = Array.from(
    { length: Math.ceil(count / page) },
    (_, index) => index * page
  );

  const features: Features<P> = [];

  const worker = async (): Promise<void> => {
    const offset = offsets.shift();

    if (offset === undefined) {
      return;
    }

    const params = new URLSearchParams({
      f: "geojson",
      orderByFields: oid,
      outFields: fields,
      outSR: "4326",
      resultOffset: String(offset),
      resultRecordCount: String(page),
      where,
    });

    const collection = await readJson<FeatureCollection<Geometry | null, P>>(
      await retried(`${layer}/query?${params}`)
    );

    features.push(...collection.features);
    await worker();
  };

  await Promise.all(Array.from({ length: 4 }, worker));

  return features;
};

export const LAYERS = {
  pavement:
    "https://geo.dot.gov/server/rest/services/Hosted/California_2018_PR/FeatureServer/0",
  scenic:
    "https://services1.arcgis.com/8CpMUd3fdw6aXef7/arcgis/rest/services/Scenic_Highway_v2/FeatureServer/0",
  vistas:
    "https://caltrans-gis.dot.ca.gov/arcgis/rest/services/CHhighway/Vistas/FeatureServer/0",
};

export const linesOf = (geometry: Geometry | null) => {
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
  const features = await fetchLayer<PavementProperties>(
    LAYERS.pavement,
    "iri IS NOT NULL OR aadt IS NOT NULL OR surface_type IS NOT NULL",
    "iri,aadt,surface_type"
  );

  return features.flatMap((feature): Pavement[] =>
    linesOf(feature.geometry).map((line) => ({
      aadt: feature.properties.aadt,
      iri: feature.properties.iri,
      line,
      unpaved: feature.properties.surface_type === 1,
    }))
  );
};
