import { NextResponse } from 'next/server';

/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  POLYBOLOS SDK — SSE Stream Endpoint                            ║
 * ║  Server-Sent Events for real-time entity streaming              ║
 * ║                                                                 ║
 * ║  GET /api/sdk/stream → Opens an SSE connection that pushes      ║
 * ║  normalized Polybolos entities to the client in real-time.       ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

// In-memory entity store shared across the SDK endpoints
const globalForSDK = globalThis as unknown as {
  sdkEntityStore: Map<string, any>;
  sdkLastUpdate: number;
};

if (!globalForSDK.sdkEntityStore) {
  globalForSDK.sdkEntityStore = new Map();
  globalForSDK.sdkLastUpdate = Date.now();
}

export const dynamic = 'force-dynamic';

/** Most entities sent in one update; the event says when there are more. */
export const MAX_ENTITIES_PER_EVENT = 500;

export async function GET() {
  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let entityPush: ReturnType<typeof setInterval> | undefined;
  const stop = () => {
    clearInterval(heartbeat);
    clearInterval(entityPush);
  };

  const stream = new ReadableStream({
    // The client went away: stop now rather than when a later write fails.
    cancel: stop,
    start(controller) {
      // Send initial status
      const statusEvent = {
        type: 'status',
        timestamp: new Date().toISOString(),
        payload: {
          connected: true,
          entityCount: globalForSDK.sdkEntityStore.size,
          feedCount: 9,
          latticeStatus: 'disconnected',
          lastUpdate: new Date().toISOString(),
          uptime: Date.now() - globalForSDK.sdkLastUpdate,
        },
      };
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(statusEvent)}\n\n`));

      // Send heartbeat every 15 seconds
      heartbeat = setInterval(() => {
        try {
          const hb = {
            type: 'heartbeat',
            timestamp: new Date().toISOString(),
            payload: { entityCount: globalForSDK.sdkEntityStore.size },
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(hb)}\n\n`));
        } catch {
          stop();
        }
      }, 15000);

      // Send entity updates every 5 seconds if data has changed
      let lastSentVersion = 0;
      entityPush = setInterval(() => {
        try {
          if (globalForSDK.sdkLastUpdate > lastSentVersion) {
            lastSentVersion = globalForSDK.sdkLastUpdate;
            const total = globalForSDK.sdkEntityStore.size;
            const entities = Array.from(globalForSDK.sdkEntityStore.values()).slice(0, MAX_ENTITIES_PER_EVENT);
            const event = {
              type: 'entity_update',
              timestamp: new Date().toISOString(),
              payload: entities,
              total,
              truncated: entities.length < total,
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          }
        } catch {
          stop();
        }
      }, 5000);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
