import { z } from 'zod';

export const PlanTypeSchema = z.enum(['HIP', 'SHP', 'OYTEP']);
export const ProjectStatusSchema = z.enum(['DRAFT', 'REVIEW', 'APPROVED', 'REJECTED', 'ARCHIVED']);

export const PlanningProjectSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().min(1),
  plan_type: PlanTypeSchema,
  code: z.string().min(3),
  serial_number: z.string().min(2),
  title: z.string().min(3),
  need_authority: z.string().min(2),
  justification: z.string().min(10),
  tactical_requirements: z.string().min(10),
  need_quantity: z.number().int().positive(),
  period_start: z.number().int(),
  period_end: z.number().int(),
  currency: z.enum(['TRY', 'USD', 'EUR']),
  estimated_amount: z.string().regex(/^\d+(?:\.\d{1,4})?$/),
  status: ProjectStatusSchema,
  created_by: z.string().min(1),
  approved_by: z.string().nullable(),
  is_synthetic: z.boolean(),
  version: z.number().int().positive(),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
});

export const ReadinessSchema = z.object({
  status: z.enum(['ready', 'not_ready']),
  service: z.string().min(1),
  checks: z.record(z.string(), z.object({ status: z.string(), detail: z.string().optional() })),
  timestamp: z.iso.datetime({ offset: true }),
});

export type PlanningProject = z.infer<typeof PlanningProjectSchema>;
export type Readiness = z.infer<typeof ReadinessSchema>;

