import { z } from 'zod';

export const StructuredErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    correlation_id: z.string().min(1),
    details: z.array(z.record(z.string(), z.unknown())).default([]),
  }),
});

export type StructuredError = z.infer<typeof StructuredErrorSchema>;

