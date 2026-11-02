import { describe, disabled, disabledResponse, json, siteOrigin } from '@/lib/oi/service';

/**
 * OSIRIS OI — what the service offers: providers, depths, limits, endpoints.
 * GET /api/oi
 */
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (disabled()) return disabledResponse();
  return json(describe(siteOrigin(req)));
}
