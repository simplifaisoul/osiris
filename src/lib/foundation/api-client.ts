import { z } from 'zod';

export async function fetchValidated<T>(
  input: string | URL,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: { Accept: 'application/json', ...init?.headers },
    cache: 'no-store',
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    throw new Error(`Foundation API returned ${response.status}`);
  }
  return schema.parse(body);
}

