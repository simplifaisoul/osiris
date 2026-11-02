import { NextRequest, NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  POLYBOLOS SDK — Ingestion Endpoint                             ║
 * ║  Secure webhook for external platform data push                 ║
 * ║                                                                 ║
 * ║  POST /api/sdk/ingest → Accepts Polybolos-format entities       ║
 * ║  from external systems (e.g., Anduril Lattice) and merges       ║
 * ║  them into the Common Operating Picture.                        ║
 * ║                                                                 ║
 * ║  GET  /api/sdk/ingest → Returns current SDK entity count        ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

// Share the entity store with the stream endpoint
const globalForSDK = globalThis as unknown as {
  sdkEntityStore: Map<string, any>;
  sdkLastUpdate: number;
  sdkIngestLog: Array<{ source: string; count: number; timestamp: string }>;
};

if (!globalForSDK.sdkEntityStore) {
  globalForSDK.sdkEntityStore = new Map();
  globalForSDK.sdkLastUpdate = Date.now();
}
if (!globalForSDK.sdkIngestLog) {
  globalForSDK.sdkIngestLog = [];
}

// Fail-closed: require SDK_INGEST_KEY env var, disable endpoint when unset
const SDK_KEY = process.env.SDK_INGEST_KEY;

/** Largest request body accepted, in bytes. */
export const MAX_BODY_BYTES = 2_000_000;
/** Most entities held at once; new ids beyond this are refused, updates still land. */
export const MAX_STORED_ENTITIES = 20_000;

const digest = (s: string) => createHash('sha256').update(s).digest();

/** Compares in constant time, so response timing does not reveal the key a character at a time. */
function keyMatches(given: unknown): boolean {
  return typeof given === 'string' && !!SDK_KEY && timingSafeEqual(digest(given), digest(SDK_KEY));
}

const reply = (status: number, accepted: number, rejected: number, errors: string[]) =>
  NextResponse.json({ accepted, rejected, errors, timestamp: new Date().toISOString() }, { status });

const isCoord = (v: unknown, limit: number) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= limit;

/** One entity as an external platform pushes it; nothing in it is trusted yet. */
interface PushedEntity {
  id?: string | number;
  name?: string;
  domain?: string;
  entityType?: string;
  position?: { lat?: unknown; lng?: unknown; alt?: number; heading?: number; speed?: number };
  threat?: string;
  classification?: string;
  confidence?: number;
  timestamp?: string;
  properties?: Record<string, unknown>;
  display?: Record<string, unknown>;
}

type StoredEntity = ReturnType<typeof toStored>;

/** The stored form of one pushed entity, or why it was refused. */
function normalize(source: string, input: unknown): { ok: true; value: StoredEntity } | { ok: false; error: string } {
  const entity = input && typeof input === 'object' ? (input as PushedEntity) : null;
  // 0 is a real latitude and longitude, so the check is for a number, not for truthiness.
  if (!entity || !entity.id || !isCoord(entity.position?.lat, 90) || !isCoord(entity.position?.lng, 180)) {
    return { ok: false, error: `Entity missing required fields (id, position.lat, position.lng): ${entity?.id || 'unknown'}` };
  }
  return { ok: true, value: toStored(source, entity as Located) };
}

type Located = PushedEntity & { id: string | number; position: { lat: number; lng: number } };

function toStored(source: string, entity: Located) {
  return {
    id: `ext-${source}-${entity.id}`,
    name: entity.name || `ENTITY-${entity.id}`,
    domain: entity.domain || 'LAND',
    entityType: entity.entityType || 'TRACK',
    position: {
      lat: entity.position.lat,
      lng: entity.position.lng,
      alt: entity.position.alt,
      heading: entity.position.heading,
      speed: entity.position.speed,
    },
    threat: entity.threat || 'NONE',
    classification: entity.classification || 'UNCLASSIFIED',
    source: {
      provider: source,
      feed: 'ingest-api',
      originalId: entity.id,
      confidence: entity.confidence || 0.8,
    },
    timestamp: entity.timestamp || new Date().toISOString(),
    properties: entity.properties || {},
    display: entity.display || {
      color: '#D4AF37',
      icon: 'dot-gold',
      layerType: 'circle',
      glow: false,
      scale: 1.0,
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) {
      return reply(413, 0, 0, [`Payload larger than ${MAX_BODY_BYTES} bytes`]);
    }
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return reply(413, 0, 0, [`Payload larger than ${MAX_BODY_BYTES} bytes`]);
    }
    let body: { source?: unknown; apiKey?: unknown; entities?: unknown } | null;
    try {
      body = JSON.parse(raw);
    } catch {
      return reply(400, 0, 0, ['Body is not valid JSON']);
    }

    // Validate structure
    if (!body || !body.source || !body.apiKey || !Array.isArray(body.entities)) {
      return NextResponse.json({
        accepted: 0,
        rejected: 0,
        errors: ['Invalid payload structure. Required: { source, apiKey, entities[] }'],
        timestamp: new Date().toISOString(),
      }, { status: 400 });
    }

    // Validate API key (fail-closed: endpoint disabled when SDK_INGEST_KEY is unset)
    if (!SDK_KEY) {
      return reply(503, 0, 0, ['Ingest endpoint disabled — SDK_INGEST_KEY not configured']);
    }
    if (!keyMatches(body.apiKey)) {
      return reply(401, 0, 0, ['Invalid API key']);
    }

    let rejected = 0;
    const errors: string[] = [];
    const valid: StoredEntity[] = [];

    // Check the whole batch before storing any of it, so what the response
    // reports as accepted is exactly what reached the store.
    const store = globalForSDK.sdkEntityStore;
    let room = MAX_STORED_ENTITIES - store.size;
    for (const entity of body.entities) {
      const result = normalize(String(body.source), entity);
      if (!result.ok) {
        rejected++;
        errors.push(result.error);
      } else if (!store.has(result.value.id) && room <= 0) {
        rejected++;
        errors.push(`Entity store is full (${MAX_STORED_ENTITIES}); new entity refused: ${entity.id}`);
      } else {
        if (!store.has(result.value.id)) room--;
        valid.push(result.value);
      }
    }
    for (const entity of valid) store.set(entity.id, entity);
    const accepted = valid.length;

    // Update timestamp to trigger SSE push
    globalForSDK.sdkLastUpdate = Date.now();

    // Log ingestion
    globalForSDK.sdkIngestLog.push({
      source: String(body.source),
      count: accepted,
      timestamp: new Date().toISOString(),
    });
    // Keep log to last 100 entries
    if (globalForSDK.sdkIngestLog.length > 100) {
      globalForSDK.sdkIngestLog = globalForSDK.sdkIngestLog.slice(-100);
    }

    return reply(200, accepted, rejected, errors.slice(0, 10)); // Limit error list
  } catch (e) {
    // The store is written in one pass, after the whole batch is checked and
    // with nothing left that can throw, so an error here stored nothing.
    console.error('[OSIRIS] SDK ingest error:', e);
    return reply(500, 0, 0, ['Server error']);
  }
}

export async function GET() {
  return NextResponse.json({
    sdk: 'polybolos',
    version: '1.0.0',
    entityCount: globalForSDK.sdkEntityStore.size,
    recentIngestions: globalForSDK.sdkIngestLog.slice(-10),
    timestamp: new Date().toISOString(),
  });
}
