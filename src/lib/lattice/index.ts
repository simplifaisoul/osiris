import { configFromEnv, type LatticeConfig } from './config';
import { fetchAccessToken, streamEntities } from './latticeClient';
import {
  disconnectedCollection,
  entitiesToFeatureCollection,
  type LatticeFeatureCollection,
} from './toGeoJSON';

export type SnapshotOptions = {
  config?: LatticeConfig | null;
  enabled?: boolean;
};

/**
 * Token, short entity stream, GeoJSON. Empty collection if disabled or unconfigured.
 */
export async function snapshotLattice(options: SnapshotOptions = {}): Promise<LatticeFeatureCollection> {
  const config = options.config === undefined ? configFromEnv() : options.config;
  const enabled = options.enabled ?? config?.enabled ?? false;
  if (!enabled) return disconnectedCollection("Lattice disconnected");
  if (!config) return disconnectedCollection("Lattice not configured");

  try {
    const token = await fetchAccessToken(config);
    const entities = await streamEntities(config, token);
    return entitiesToFeatureCollection(entities);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lattice fetch failed";
    return { ...disconnectedCollection(message), connected: false };
  }
}

export { configFromEnv, latticeBaseUrl, isConfigured } from './config';
export type { LatticeConfig } from './config';
export {
  failClosedClassLabel,
  isGenericPlatformType,
  isUnknownClassLabel,
  resolveOntologyClassLabel,
} from './ontology';
export type { LatticeEntity, LatticeMilView, LatticeOntology, LatticeProvenance } from './ontology';
export { fetchAccessToken, getEntity, parseNdjsonEntities, putEntity, streamEntities } from './latticeClient';
export {
  disconnectedCollection,
  entitiesToFeatureCollection,
  entityToFeature,
} from './toGeoJSON';
export type { LatticeFeature, LatticeFeatureCollection, LatticeFeatureProperties } from './toGeoJSON';
