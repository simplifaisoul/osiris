import type { LatticeEntity } from './ontology';
import { failClosedClassLabel, resolveOntologyClassLabel } from './ontology';

export type LatticeFeatureProperties = {
  id: string;
  name: string;
  source: "LATTICE";
  lat: number;
  lon: number;
  heading: number;
  speed: number;
  platformType: string;
  specificType: string;
  ontologyTemplate: string;
  ontologyLabel: string;
  failClosedClass: string | null;
  disposition: string;
  environment: string;
  provenanceDataType: string;
  provenanceIntegration: string;
};

export type LatticeFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: LatticeFeatureProperties;
};

export type LatticeFeatureCollection = {
  type: "FeatureCollection";
  features: LatticeFeature[];
  total_entities: number;
  connected: boolean;
  error: string | null;
};

export function disconnectedCollection(error: string): LatticeFeatureCollection {
  return {
    type: "FeatureCollection",
    features: [],
    total_entities: 0,
    connected: false,
    error,
  };
}

export function entityToFeature(entity: LatticeEntity): LatticeFeature | null {
  const id = entity.entityId?.trim() ?? "";
  const pos = entity.location?.position ?? {};
  const lat = pos.latitudeDegrees;
  const lon = pos.longitudeDegrees;
  if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  const ontology = entity.ontology;
  const name = entity.aliases?.name?.trim() || id;
  const vel = entity.location?.velocity ?? {};

  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [lon, lat] },
    properties: {
      id,
      name,
      source: "LATTICE",
      lat,
      lon,
      heading: vel.headingDegrees ?? 0,
      speed: vel.speedMps ?? 0,
      platformType: ontology?.platformType?.trim() ?? "",
      specificType: ontology?.specificType?.trim() ?? "",
      ontologyTemplate: ontology?.template?.trim() ?? "",
      ontologyLabel: resolveOntologyClassLabel(ontology),
      failClosedClass: failClosedClassLabel(ontology),
      disposition: entity.milView?.disposition?.trim() ?? "",
      environment: entity.milView?.environment?.trim() ?? "",
      provenanceDataType: entity.provenance?.dataType?.trim() ?? "",
      provenanceIntegration: entity.provenance?.integrationName?.trim() ?? "",
    },
  };
}

export function entitiesToFeatureCollection(entities: LatticeEntity[]): LatticeFeatureCollection {
  const byId = new Map<string, LatticeFeature>();
  for (const entity of entities) {
    const feature = entityToFeature(entity);
    if (!feature) continue;
    if (feature.properties.id) byId.set(feature.properties.id, feature);
  }
  const features = [...byId.values()];
  return {
    type: "FeatureCollection",
    features,
    total_entities: features.length,
    connected: true,
    error: null,
  };
}
