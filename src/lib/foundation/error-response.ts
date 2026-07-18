import { NextResponse } from 'next/server';

export interface ErrorContext {
  code: string;
  message: string;
  correlationId: string;
  status: number;
  details?: Array<Record<string, unknown>>;
}

export function structuredError(context: ErrorContext): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: context.code,
        message: context.message,
        correlation_id: context.correlationId,
        details: context.details ?? [],
      },
    },
    {
      status: context.status,
      headers: {
        'Cache-Control': 'no-store',
        'X-Correlation-Id': context.correlationId,
      },
    },
  );
}

