import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { ConnectorStatusListSchema } from '../../../../packages/contracts/src/connectors';
import { fetchValidated } from '@/lib/foundation/api-client';
import { structuredError } from '@/lib/foundation/error-response';

export const dynamic = 'force-dynamic';

/**
 * Surfaces connector health from the ingestion service. When the ingestion
 * service is not configured, the panel receives a structured 503 rather than a
 * fabricated "all live" state — connectors without a backend are not pretended
 * to be running.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId = request.headers.get('x-correlation-id') ?? randomUUID();
  const baseUrl = process.env.INGESTION_API_URL;
  if (!baseUrl) {
    return structuredError({
      code: 'INGESTION_NOT_CONFIGURED',
      message: 'Ingestion service URL is not configured',
      correlationId,
      status: 503,
    });
  }
  try {
    const connectors = await fetchValidated(
      new URL('/connectors', baseUrl),
      ConnectorStatusListSchema,
      {
        signal: AbortSignal.timeout(3_000),
        headers: { 'X-Correlation-Id': correlationId },
      },
    );
    return NextResponse.json(
      { connectors },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store', 'X-Correlation-Id': correlationId },
      },
    );
  } catch {
    return structuredError({
      code: 'INGESTION_UNAVAILABLE',
      message: 'Ingestion service connector query failed',
      correlationId,
      status: 503,
    });
  }
}
