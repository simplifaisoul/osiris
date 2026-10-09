import { canSeeImages, createChat, providerInfo, ProviderError } from '@/lib/oi/providers';
import { credentials, disabled, disabledResponse, fail, json, limited, readBody } from '@/lib/oi/service';
import { extractJson } from '@/lib/oi/parse';
import { IDENTIFY_SYSTEM, MAX_CROPS, identifyPrompt, parseIdentities } from '@/lib/vision/identify';

/**
 * OSIRIS OI — name the vehicles in a camera frame, on the reader's own key.
 *
 * POST /api/oi/identify
 *   headers  X-OI-Provider, X-OI-Key (or Authorization: Bearer), X-OI-Model (optional)
 *   body     { camera?: string, crops: [{ n, image: base64 JPEG }] }   at most 6 crops
 *   returns  { vehicles: [{ n, make, model, body, colour, confidence }], usage }
 *
 * The crops are cut by the page from the frame it analysed, so the answer is
 * about exactly the vehicles the reader is looking at. Only a model that reads
 * pictures is asked: a text-only one would have nothing to go on but guesses.
 * Number plates are never read. Nothing is kept.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** A crop is a small JPEG: 160 KB of base64 is well over what one vehicle needs. */
const MAX_IMAGE_CHARS = 160_000;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export async function POST(req: Request) {
  if (disabled()) return disabledResponse();
  if (limited(req, 'identify', 12)) return fail(429, 'Too many identifications in a minute. Wait a moment.');
  const body = await readBody(req, MAX_CROPS * MAX_IMAGE_CHARS + 4_000);
  if (!body) return fail(400, 'Send a JSON body: { "crops": [{ "n": 1, "image": "<base64 JPEG>" }] }.');
  const creds = credentials(req, body);
  if ('error' in creds) return fail(400, creds.error);
  if (!creds.provider) return fail(400, 'Choose a provider (X-OI-Provider).');
  const info = providerInfo(creds.provider);
  if (!creds.key && info.needsKey) return fail(401, `Identifying vehicles runs on your own ${info.name} key.`);
  const model = creds.model || info.defaultModel;
  if (info.needsKey && !canSeeImages(creds.provider, model)) {
    return fail(400, `${model} cannot read pictures. Choose a vision model in OI (Claude, GPT-4o or newer, Gemini, Pixtral…) to identify vehicles.`);
  }

  const crops = (Array.isArray(body.crops) ? body.crops : [])
    .slice(0, MAX_CROPS)
    .map(c => (c && typeof c === 'object' ? (c as Record<string, unknown>).image : null))
    .filter((img): img is string => typeof img === 'string' && img.length <= MAX_IMAGE_CHARS && BASE64.test(img));
  if (!crops.length) return fail(400, 'Send at least one crop: a base64 JPEG of a vehicle.');
  const camera = typeof body.camera === 'string' ? body.camera : undefined;

  try {
    const chat = createChat(creds.provider, creds.key ?? '', model);
    const out = await chat({
      system: IDENTIFY_SYSTEM, user: identifyPrompt(crops.length, camera), json: true, maxTokens: 900, temperature: 0.1, timeoutMs: 45_000,
      images: crops.map(data => ({ mime: 'image/jpeg', data })), signal: req.signal,
    });
    let raw: unknown = null;
    try { raw = extractJson(out.text); } catch { /* an answer that is not JSON identifies nothing */ }
    return json({ vehicles: parseIdentities(raw, crops.length), usage: { input: out.input, output: out.output } });
  } catch (err) {
    if (err instanceof ProviderError) {
      const status = err.code === 'auth' ? 401 : err.code === 'quota' ? 402 : err.code === 'rate' ? 429 : err.code === 'model' || err.code === 'bad_request' ? 400 : 502;
      return fail(status, err.message);
    }
    if (req.signal.aborted) return fail(499, 'Cancelled.');
    return fail(500, 'The vehicles could not be identified just then.');
  }
}
