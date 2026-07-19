import { z } from 'zod';

export const ConnectorStateSchema = z.enum([
  'CONFIGURATION_REQUIRED',
  'DISABLED',
  'IDLE',
  'ACTIVE',
  'DEGRADED',
  'RATE_LIMITED',
  'CIRCUIT_OPEN',
  'FAILED',
]);

export const ConnectorStatusSchema = z.object({
  connector_id: z.string().min(1),
  domain: z.string().min(1),
  state: ConnectorStateSchema,
  licence_or_usage_basis: z.string().min(1),
  last_success_at: z.iso.datetime({ offset: true }).nullable(),
  consecutive_failures: z.number().int().nonnegative(),
  records_ingested: z.number().int().nonnegative(),
  records_deduplicated: z.number().int().nonnegative(),
  last_error: z.string().nullable(),
  missing_configuration: z.array(z.string()),
  generated_at: z.iso.datetime({ offset: true }),
});

export const ConnectorStatusListSchema = z.array(ConnectorStatusSchema);

export type ConnectorState = z.infer<typeof ConnectorStateSchema>;
export type ConnectorStatus = z.infer<typeof ConnectorStatusSchema>;
