import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { ReadinessSchema } from '../../../../packages/contracts/src/planning';
import { fetchValidated } from '@/lib/foundation/api-client';
import { structuredError } from '@/lib/foundation/error-response';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const correlationId = request.headers.get('x-correlation-id') ?? randomUUID();
  const baseUrl = process.env.FOUNDATION_API_URL;
  if (!baseUrl) {
    return structuredError({
      code: 'FOUNDATION_NOT_CONFIGURED',
      message: 'Foundation API is not configured',
      correlationId,
      status: 503,
    });
  }
  try {
    const readiness = await fetchValidated(new URL('/ready', baseUrl), ReadinessSchema, {
      signal: AbortSignal.timeout(3_000),
      headers: { 'X-Correlation-Id': correlationId },
    });
    return NextResponse.json(readiness, {
      status: readiness.status === 'ready' ? 200 : 503,
      headers: { 'Cache-Control': 'no-store', 'X-Correlation-Id': correlationId },
    });
  } catch {
    return structuredError({
      code: 'FOUNDATION_UNAVAILABLE',
      message: 'Foundation API readiness check failed',
      correlationId,
      status: 503,
    });
  }
}
