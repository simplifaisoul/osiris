/**
 * OSIRIS — Cyber & BGP Routing Telemetry Classifier
 */

export interface BGPOutage {
  id: string;
  asn: number;
  name: string;
  country: string;
  country_code: string;
  lat: number;
  lng: number;
  outage_severity: 'critical' | 'major' | 'minor';
  prefixes_affected: number;
  status: 'active' | 'mitigated';
  reason: string;
  timestamp: string;
}

export interface GreyNoiseReputation {
  ip: string;
  noise: boolean;
  riot: boolean;
  classification: 'malicious' | 'benign' | 'unknown';
  name?: string;
  link?: string;
  last_seen?: string;
  message?: string;
}
