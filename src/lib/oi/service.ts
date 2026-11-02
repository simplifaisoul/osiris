/**
 * OI as a service: request parsing and the operations the REST API
 * and the MCP server both expose, so the two cannot drift apart.
 *
 * Keys arrive in headers only (X-OI-Key, or Authorization: Bearer), never
 * in a URL or a tool argument, where they would end up in logs and transcripts.
 */
import { NextResponse } from 'next/server';
import { getClientIp, isRateLimited } from '@/lib/ssrf-guard';
import { DEPTHS, askRun, estimateCalls } from './engine';
import {
  PROVIDERS, ProviderError, createChat, isPlausibleKey, isPlausibleModel, isProviderId, providerInfo, type ChatFn, type ProviderId,
} from './providers';
import { LIMITS, startRun, type Run, type StartDeps } from './runs';
import { SEED_MAX, type SeedScope } from './depths';
import { oneOf, text } from './parse';
import type { Depth } from './types';

export const OI_VERSION = '1.0.0';

export const CREDIT = 'Method after MiroFish (github.com/666ghj/MiroFish), rebuilt natively for OSIRIS.';

export function disabled(): boolean {
  return process.env.OI_DISABLED === '1';
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

export function fail(status: number, error: string, extra: Record<string, unknown> = {}) {
  return json({ error, ...extra }, status);
}

export function disabledResponse() {
  return fail(503, 'OI is switched off on this server.');
}

const HOST = /^[a-z0-9.-]+(?::\d{1,5})?$/i;

/** This site's public origin, for watch links. */
export function siteOrigin(req: Request): string {
  const configured = process.env.OI_PUBLIC_ORIGIN;
  if (configured && /^https?:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(configured)) return configured;
  const host = (req.headers.get('x-forwarded-host') || req.headers.get('host') || '').split(',')[0].trim();
  if (!HOST.test(host)) return 'https://osirisai.live';
  const local = /^(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(host);
  const proto = req.headers.get('x-forwarded-proto')?.split(',')[0].trim() || (local ? 'http' : 'https');
  return `${proto === 'http' ? 'http' : 'https'}://${host}`;
}

/** A JSON body, capped in size. Null when it is missing, too big or not an object. */
export async function readBody(req: Request, max = 64_000): Promise<Record<string, unknown> | null> {
  const declared = Number(req.headers.get('content-length') || 0);
  if (declared > max) return null;
  const raw = await req.text().catch(() => '');
  if (raw.length > max) return null;
  if (!raw.trim()) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

export interface Credentials {
  provider?: ProviderId;
  key?: string;
  model?: string;
}

/** Provider, key and model from the headers, the provider and model also from the body. */
export function credentials(req: Request, body: Record<string, unknown> = {}): Credentials | { error: string } {
  const h = (n: string) => req.headers.get(n)?.trim() || '';
  const auth = h('authorization');
  const key = h('x-oi-key') || (/^bearer\s+/i.test(auth) ? auth.replace(/^bearer\s+/i, '').trim() : '');
  const providerRaw = h('x-oi-provider') || (typeof body.provider === 'string' ? body.provider : '');
  const modelRaw = h('x-oi-model') || (typeof body.model === 'string' ? body.model : '');
  if (providerRaw && !isProviderId(providerRaw.toLowerCase())) {
    return { error: `Unknown provider. Use one of: ${PROVIDERS.map(p => p.id).join(', ')}.` };
  }
  if (key && !isPlausibleKey(key)) return { error: 'That does not look like an API key.' };
  if (modelRaw && !isPlausibleModel(modelRaw)) return { error: 'That does not look like a model id.' };
  return {
    provider: providerRaw ? (providerRaw.toLowerCase() as ProviderId) : undefined,
    key: key || undefined,
    model: modelRaw || undefined,
  };
}

/** Free text for a seed: newlines kept, control characters out, capped. */
export function seedText(v: unknown, max = SEED_MAX): string {
  if (typeof v !== 'string') return '';
  return v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

export interface PredictArgs {
  question?: unknown;
  seed?: unknown;
  seed_scope?: unknown;
  depth?: unknown;
  use_feeds?: unknown;
}

export type Started = { ok: true; run: Run } | { ok: false; status: number; error: string };

/** Validates a prediction request and starts the run. */
export function startPrediction(args: PredictArgs, creds: Credentials, ip: string, deps: StartDeps = {}): Started {
  const question = text(args.question, 500);
  if (question.length < 8) return { ok: false, status: 400, error: 'Ask a question of at least a few words (8–500 characters).' };
  if (!creds.provider) return { ok: false, status: 400, error: 'Choose a provider (X-OI-Provider).' };
  const info = providerInfo(creds.provider);
  if (!creds.key && info.needsKey) return { ok: false, status: 401, error: `An API key for ${info.name} is required (X-OI-Key or Authorization: Bearer).` };
  const depth = oneOf(args.depth, ['quick', 'standard', 'deep'] as const, 'standard') as Depth;
  return startRun({
    question,
    seed: seedText(args.seed),
    seedScope: oneOf(args.seed_scope, ['brief', 'panel'] as const, 'brief') as SeedScope,
    depth,
    useFeeds: args.use_feeds !== false && args.use_feeds !== 'false',
    provider: creds.provider,
    model: creds.model || info.defaultModel,
    key: creds.key ?? '',
    ip,
  }, deps);
}

export type Asked = { ok: true; reply: string; target: string } | { ok: false; status: number; error: string };

/** One question to the report agent or an actor that played, on the caller's key. */
export async function askPrediction(run: Run, targetRaw: unknown, messageRaw: unknown, creds: Credentials, signal?: AbortSignal, chat?: ChatFn): Promise<Asked> {
  const message = text(messageRaw, 1000);
  if (message.length < 2) return { ok: false, status: 400, error: 'Ask something.' };
  const target = typeof targetRaw === 'string' && targetRaw.trim() ? targetRaw.trim().toLowerCase().slice(0, 40) : 'report';
  const provider = creds.provider ?? (isProviderId(run.state.provider) ? run.state.provider : undefined);
  if (!provider) return { ok: false, status: 400, error: 'Choose a provider (X-OI-Provider).' };
  if (!creds.key && providerInfo(provider).needsKey) return { ok: false, status: 401, error: 'Asking uses your own key again (X-OI-Key or Authorization: Bearer).' };
  const model = creds.model || (provider === run.state.provider ? run.state.model : providerInfo(provider).defaultModel);
  try {
    const { reply } = await askRun(run.state, target, message, chat ?? createChat(provider, creds.key ?? '', model), signal);
    return { ok: true, reply, target };
  } catch (err) {
    if (err instanceof ProviderError) {
      const status = err.code === 'auth' ? 401 : err.code === 'quota' ? 402 : err.code === 'rate' ? 429 : err.code === 'model' ? 400 : 502;
      return { ok: false, status, error: err.message };
    }
    return { ok: false, status: 400, error: err instanceof Error ? err.message : 'Could not ask.' };
  }
}

/** True when this caller has made more than `limit` calls of `bucket` in the window. */
export function limited(req: Request, bucket: string, limit: number, windowMs = 60_000): boolean {
  return isRateLimited(`oi:${bucket}:${getClientIp(req)}`, limit, windowMs);
}

/** What the service offers, for GET /api/oi and the MCP providers tool. */
export function describe(origin: string) {
  return {
    name: 'OSIRIS OI',
    version: OI_VERSION,
    about: 'A prediction engine on live OSIRIS intelligence: the actors who decide a question, simulated against each other in parallel worlds. Bring your own model key.',
    credit: CREDIT,
    providers: PROVIDERS.map(p => ({ id: p.id, name: p.name, default_model: p.defaultModel, suggested_models: p.suggested, key_url: p.keyUrl })),
    depths: (Object.keys(DEPTHS) as Depth[]).map(d => ({ id: d, ...DEPTHS[d], model_calls: estimateCalls(d) })),
    limits: {
      runs_at_once_per_address: LIMITS.perIpActive,
      runs_per_10_minutes_per_address: LIMITS.perIpStarts,
      run_kept_for_hours: LIMITS.ttlMs / 3_600_000,
    },
    auth: 'Send X-OI-Provider and X-OI-Key (or Authorization: Bearer <key>), optionally X-OI-Model. Keys are used for your run and never stored.',
    endpoints: {
      start: `POST ${origin}/api/oi/runs`,
      run: `GET ${origin}/api/oi/runs/{id}?wait=30`,
      events: `GET ${origin}/api/oi/runs/{id}/events (Server-Sent Events)`,
      ask: `POST ${origin}/api/oi/runs/{id}/ask`,
      inject: `POST ${origin}/api/oi/runs/{id}/inject (X-OI-Run-Token)`,
      cancel: `DELETE ${origin}/api/oi/runs/{id} (X-OI-Run-Token)`,
      models: `POST ${origin}/api/oi/models`,
      mcp: `${origin}/api/mcp`,
      docs: `${origin}/docs`,
    },
  };
}
