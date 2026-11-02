import { ProviderError, listModels, pickModel, providerInfo } from '@/lib/oi/providers';
import { credentials, disabled, disabledResponse, fail, json, limited, readBody } from '@/lib/oi/service';

/**
 * OSIRIS OI — the models a key can use. Doubles as the key check: a key
 * the provider rejects fails here, before a run spends anything.
 *
 * POST /api/oi/models   { provider }   with X-OI-Key
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: Request) {
  if (disabled()) return disabledResponse();
  if (limited(req, 'models', 20)) return fail(429, 'Too many key checks. Wait a minute.');
  const body = await readBody(req, 4_000);
  if (!body) return fail(400, 'Send a JSON body: { "provider": "…" }.');
  const creds = credentials(req, body);
  if ('error' in creds) return fail(400, creds.error);
  if (!creds.provider) return fail(400, 'Choose a provider.');
  if (!creds.key && providerInfo(creds.provider).needsKey) return fail(401, 'Send the key in X-OI-Key.');

  try {
    const { models, listed } = await listModels(creds.provider, creds.key ?? '');
    return json({ provider: creds.provider, ok: true, listed, models, default: pickModel(creds.provider, models) });
  } catch (err) {
    if (err instanceof ProviderError) {
      const status = err.code === 'auth' ? 401 : err.code === 'quota' ? 402 : err.code === 'rate' ? 429 : 502;
      return fail(status, err.message, { provider: creds.provider, key_url: providerInfo(creds.provider).keyUrl });
    }
    return fail(502, 'Could not reach the provider.');
  }
}
