import { describe, expect, it } from 'vitest';

import { structuredError } from './error-response';

describe('structuredError', () => {
  it('returns the shared error envelope and correlation id', async () => {
    const response = structuredError({
      code: 'TEST_ERROR',
      message: 'Synthetic error',
      correlationId: 'synthetic-correlation',
      status: 422,
    });
    expect(response.status).toBe(422);
    expect(response.headers.get('x-correlation-id')).toBe('synthetic-correlation');
    expect(await response.json()).toEqual({
      error: {
        code: 'TEST_ERROR',
        message: 'Synthetic error',
        correlation_id: 'synthetic-correlation',
        details: [],
      },
    });
  });
});

