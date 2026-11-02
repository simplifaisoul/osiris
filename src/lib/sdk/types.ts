/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  POLYBOLOS SDK — Core Type System                               ║
 * ║  Standardized Entity Model for Multi-Domain Intelligence        ║
 * ║                                                                 ║
 * ║  Built on OSIRIS by Souleimen Mrad                              ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

// ── Domain Classification ──────────────────────────────────────────

export enum Domain {
  AIR       = 'AIR',
  SEA       = 'SEA',
  LAND      = 'LAND',
  SPACE     = 'SPACE',
  CYBER     = 'CYBER',
  EW        = 'EW',        // Electronic Warfare (GPS jamming, SIGINT)
  SUBSURFACE = 'SUBSURFACE',
}

export enum EntityType {
  TRACK       = 'TRACK',       // Moving entity (aircraft, ship, satellite)
  FACILITY    = 'FACILITY',    // Static installation (port, base, reactor)
  EVENT       = 'EVENT',       // Temporal occurrence (earthquake, fire, conflict)
  SENSOR      = 'SENSOR',      // Data collection point (CCTV, radiation monitor)
  SIGNAL      = 'SIGNAL',      // Electronic emission (GPS jam, radar)
  INTEL       = 'INTEL',       // Intelligence product (news, GDELT, CVE)
}

export enum ThreatLevel {
  NONE      = 'NONE',
  LOW       = 'LOW',
  ELEVATED  = 'ELEVATED',
  HIGH      = 'HIGH',
  CRITICAL  = 'CRITICAL',
}

export enum Classification {
  UNCLASSIFIED = 'UNCLASSIFIED',
  FOUO         = 'FOUO',
  CONFIDENTIAL = 'CONFIDENTIAL',
  SECRET       = 'SECRET',
}

// ── Core Entity Interface ──────────────────────────────────────────

export interface PolybolosEntity {
  /** Globally unique entity identifier */
  id: string;
  /** Human-readable name or callsign */
  name: string;
  /** Primary domain classification */
  domain: Domain;
  /** Entity type classification */
  entityType: EntityType;
  /** Geographic position (WGS84) */
  position: {
    lat: number;
    lng: number;
    alt?: number;        // meters above sea level
    heading?: number;    // degrees true
    speed?: number;      // knots
  };
  /** Threat assessment */
  threat: ThreatLevel;
  /** Data classification */
  classification: Classification;
  /** Source attribution */
  source: EntitySource;
  /** ISO 8601 timestamp of last observation */
  timestamp: string;
  /** Extended properties (domain-specific) */
  properties: Record<string, unknown>;
  /** Visual rendering hints */
  display: EntityDisplay;
}

export interface EntitySource {
  /** Source system identifier */
  provider: string;
  /** Feed or sensor name */
  feed: string;
  /** Original provider entity ID */
  originalId?: string;
  /** Confidence score 0.0–1.0 */
  confidence: number;
}

export interface EntityDisplay {
  /** Primary color (hex) */
  color: string;
  /** Icon identifier */
  icon: string;
  /** MapLibre layer type hint */
  layerType: 'circle' | 'symbol' | 'line';
  /** Glow/pulse effect */
  glow?: boolean;
  /** Size multiplier */
  scale?: number;
}

// ── Lattice Integration Types ──────────────────────────────────────

export interface LatticeConfig {
  /** Lattice endpoint URL */
  endpoint: string;
  /** Authentication token */
  token: string;
  /** Subscription filter */
  entityFilter?: LatticeEntityFilter;
  /** Connection status callback */
  onStatusChange?: (status: LatticeConnectionStatus) => void;
}

export interface LatticeEntityFilter {
  domains?: Domain[];
  entityTypes?: EntityType[];
  boundingBox?: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
}

export type LatticeConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'authenticated'
  | 'streaming'
  | 'error';

// ── SDK Client Types ───────────────────────────────────────────────

export interface PolybolosClientConfig {
  /** Base URL for OSIRIS API endpoints */
  osirisBaseUrl: string;
  /** Optional Lattice configuration */
  lattice?: LatticeConfig;
  /** Entity update callback */
  onEntityUpdate?: (entities: PolybolosEntity[]) => void;
  /** Connection status callback */
  onStatusChange?: (status: SDKStatus) => void;
}

export interface SDKStatus {
  connected: boolean;
  feedCount: number;
  entityCount: number;
  latticeStatus: LatticeConnectionStatus;
  lastUpdate: string;
  uptime: number;
}

// ── Stream Event Types ─────────────────────────────────────────────

export type StreamEventType =
  | 'entity_update'
  | 'entity_remove'
  | 'status'
  | 'heartbeat'
  | 'alert';

export interface StreamEvent {
  type: StreamEventType;
  timestamp: string;
  payload: PolybolosEntity[] | SDKStatus | { id: string }[];
  /** entity_update: how many entities the server holds, which can exceed `payload`. */
  total?: number;
  /** entity_update: true when `payload` is not every entity held. */
  truncated?: boolean;
}

// ── Ingestion Types (External Push) ────────────────────────────────

export interface IngestPayload {
  /** Source system identifier */
  source: string;
  /** Authentication key */
  apiKey: string;
  /** Entities to ingest */
  entities: Partial<PolybolosEntity>[];
}

export interface IngestResult {
  accepted: number;
  rejected: number;
  errors: string[];
  timestamp: string;
}
