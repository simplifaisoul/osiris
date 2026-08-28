/** Lattice ontology helpers. Not an engagement ICD. Do not invent combat class. */

export type LatticeOntology = {
  template?: string;
  platformType?: string;
  specificType?: string;
};

export type LatticeMilView = {
  disposition?: string;
  environment?: string;
};

export type LatticeProvenance = {
  dataType?: string;
  integrationName?: string;
};

export type LatticeEntity = {
  entityId?: string;
  aliases?: { name?: string };
  location?: {
    position?: {
      latitudeDegrees?: number;
      longitudeDegrees?: number;
      altitudeHaeMeters?: number;
    };
    velocity?: {
      speedMps?: number;
      headingDegrees?: number;
    };
  };
  milView?: LatticeMilView;
  ontology?: LatticeOntology;
  provenance?: LatticeProvenance;
  isLive?: boolean;
};

function normalizeKey(raw: string): string {
  let s = raw.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  s = s.replace(/^_+|_+$/g, "").replace(/_+/g, "_");
  return s;
}

const GENERIC_PLATFORM = new Set(["air_vehicle", "object_class_air_vehicle"]);
const UNKNOWN_KEYS = new Set([
  "unknown",
  "unknown_air_vehicle",
  "unknown_vehicle",
  "unknownairtrack",
  "unknown_air_track",
]);

export function isGenericPlatformType(platformType: string): boolean {
  return GENERIC_PLATFORM.has(normalizeKey(platformType));
}

export function isUnknownClassLabel(label: string): boolean {
  const key = normalizeKey(label);
  return key.length === 0 || UNKNOWN_KEYS.has(key);
}

/** platformType first; specificType only when platform is empty or generic. */
export function resolveOntologyClassLabel(ontology?: LatticeOntology): string {
  const platform = ontology?.platformType?.trim() ?? "";
  const specific = ontology?.specificType?.trim() ?? "";
  if (platform && !isGenericPlatformType(platform)) return platform;
  if (specific) return specific;
  return platform;
}

/**
 * Fail closed: empty or unknown labels return null.
 * Never substitute SMALL_UAS or any combat class.
 */
export function failClosedClassLabel(ontology?: LatticeOntology): string | null {
  const label = resolveOntologyClassLabel(ontology);
  if (!label || isUnknownClassLabel(label)) return null;
  return label;
}
