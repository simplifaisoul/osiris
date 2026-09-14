export interface GeoCandidate {
  label: string;
  country: string;
  latitude: number;
  longitude: number;
  confidence: number;
}

export interface GeoResult {
  primary: GeoCandidate & { reasoning: string };
  candidates: GeoCandidate[];
  clues: string[];
}

export interface GeolocationProvider {
  id: string;
  name: string;
  isConfigured: () => boolean;
  geolocate: (imageBase64: string, context: string, mode: 'fast' | 'precise') => Promise<GeoResult>;
}
