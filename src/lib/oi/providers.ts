/**
 * The model providers OI can run on, with the visitor's own key.
 *
 * Each provider is a fixed origin. There is deliberately no "custom base URL":
 * the server makes these requests, and a caller-chosen URL would turn the
 * engine into a relay into anything the server can reach.
 *
 * Keys are used for the request in hand and never stored, logged or echoed.
 * Every message that leaves this module has been through `scrub`.
 */
import { createDemoChat } from './demo';

export type ProviderId =
  | 'openai' | 'anthropic' | 'google' | 'openrouter' | 'groq' | 'deepseek' | 'xai' | 'mistral' | 'qwen' | 'demo';

type Wire = 'openai' | 'anthropic' | 'google' | 'demo';

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  /** Where a visitor gets a key. */
  keyUrl: string;
  /** What a key looks like, for the placeholder. */
  keyHint: string;
  defaultModel: string;
  /** Shown before the key is checked, and used when a provider cannot list its models. */
  suggested: string[];
  /** Calls in flight at once for one run. Free tiers are tight on some. */
  concurrency: number;
  /** False only for the scripted demo. */
  needsKey: boolean;
}

interface ProviderDef extends ProviderInfo {
  wire: Wire;
  base: string;
}

const DEFS: ProviderDef[] = ([
  {
    id: 'openai', name: 'OpenAI', wire: 'openai', base: 'https://api.openai.com/v1',
    keyUrl: 'https://platform.openai.com/api-keys', keyHint: 'sk-…',
    defaultModel: 'gpt-5-mini', suggested: ['gpt-5-mini', 'gpt-5', 'gpt-4.1-mini', 'gpt-4o-mini'], concurrency: 5,
  },
  {
    id: 'anthropic', name: 'Anthropic', wire: 'anthropic', base: 'https://api.anthropic.com/v1',
    keyUrl: 'https://console.anthropic.com/settings/keys', keyHint: 'sk-ant-…',
    defaultModel: 'claude-haiku-4-5-20251001',
    suggested: ['claude-haiku-4-5-20251001', 'claude-sonnet-5-5', 'claude-opus-5-5'], concurrency: 4,
  },
  {
    id: 'google', name: 'Google Gemini', wire: 'google', base: 'https://generativelanguage.googleapis.com/v1beta',
    keyUrl: 'https://aistudio.google.com/apikey', keyHint: 'AIza…',
    defaultModel: 'gemini-2.5-flash', suggested: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite'], concurrency: 4,
  },
  {
    id: 'openrouter', name: 'OpenRouter', wire: 'openai', base: 'https://openrouter.ai/api/v1',
    keyUrl: 'https://openrouter.ai/keys', keyHint: 'sk-or-…',
    defaultModel: 'google/gemini-2.5-flash',
    suggested: ['google/gemini-2.5-flash', 'anthropic/claude-haiku-4.5', 'openai/gpt-5-mini', 'deepseek/deepseek-chat'], concurrency: 4,
  },
  {
    id: 'groq', name: 'Groq', wire: 'openai', base: 'https://api.groq.com/openai/v1',
    keyUrl: 'https://console.groq.com/keys', keyHint: 'gsk_…',
    defaultModel: 'llama-3.3-70b-versatile', suggested: ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b'], concurrency: 2,
  },
  {
    id: 'deepseek', name: 'DeepSeek', wire: 'openai', base: 'https://api.deepseek.com',
    keyUrl: 'https://platform.deepseek.com/api_keys', keyHint: 'sk-…',
    defaultModel: 'deepseek-chat', suggested: ['deepseek-chat', 'deepseek-reasoner'], concurrency: 4,
  },
  {
    id: 'xai', name: 'xAI Grok', wire: 'openai', base: 'https://api.x.ai/v1',
    keyUrl: 'https://console.x.ai', keyHint: 'xai-…',
    defaultModel: 'grok-3-mini', suggested: ['grok-3-mini', 'grok-4'], concurrency: 4,
  },
  {
    id: 'mistral', name: 'Mistral', wire: 'openai', base: 'https://api.mistral.ai/v1',
    keyUrl: 'https://console.mistral.ai/api-keys', keyHint: '32 characters',
    defaultModel: 'mistral-small-latest', suggested: ['mistral-small-latest', 'mistral-medium-latest', 'mistral-large-latest'], concurrency: 3,
  },
  {
    // Alibaba Cloud's international endpoint: the Qwen models MiroFish recommends.
    id: 'qwen', name: 'Qwen (Alibaba Cloud)', wire: 'openai', base: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    keyUrl: 'https://modelstudio.console.alibabacloud.com/', keyHint: 'sk-…',
    defaultModel: 'qwen-plus', suggested: ['qwen-plus', 'qwen-max', 'qwen-turbo'], concurrency: 4,
  },
  {
    // Scripted answers for development and tests: the whole pipeline, no key, no cost. Never offered in production.
    id: 'demo', name: 'Demo (scripted, dev only)', wire: 'demo', base: '',
    keyUrl: '', keyHint: 'no key needed', defaultModel: 'scripted', suggested: ['scripted'], concurrency: 4,
  },
] as Omit<ProviderDef, 'needsKey'>[])
  .filter(d => d.id !== 'demo' || process.env.NODE_ENV !== 'production')
  .map(d => ({ ...d, needsKey: d.id !== 'demo' }));

const BY_ID = new Map(DEFS.map(d => [d.id, d]));

const publicInfo = (d: ProviderDef): ProviderInfo => ({
  id: d.id, name: d.name, keyUrl: d.keyUrl, keyHint: d.keyHint, defaultModel: d.defaultModel,
  suggested: d.suggested, concurrency: d.concurrency, needsKey: d.needsKey,
});

/** Public descriptions, without the wire details. */
export const PROVIDERS: ProviderInfo[] = DEFS.map(publicInfo);

export function isProviderId(v: unknown): v is ProviderId {
  return typeof v === 'string' && BY_ID.has(v as ProviderId);
}

export function providerInfo(id: ProviderId): ProviderInfo {
  return publicInfo(BY_ID.get(id)!);
}

/** A key we are willing to forward: printable, no whitespace, a sane length. */
export function isPlausibleKey(key: unknown): key is string {
  return typeof key === 'string' && key.length >= 8 && key.length <= 400 && /^[\x21-\x7e]+$/.test(key);
}

/** A model id we are willing to put in a request (and, for Gemini, a path). */
export function isPlausibleModel(model: unknown): model is string {
  return typeof model === 'string' && model.length >= 1 && model.length <= 120 && /^[A-Za-z0-9._:/@+-]+$/.test(model)
    && !model.includes('..');
}

/* ───────────────────────────── Errors ───────────────────────────── */

export type ProviderErrorCode = 'auth' | 'quota' | 'rate' | 'model' | 'bad_request' | 'upstream' | 'timeout' | 'network' | 'empty';

export class ProviderError extends Error {
  constructor(
    public code: ProviderErrorCode,
    message: string,
    public status = 0,
    public retryAfterMs = 0,
  ) {
    super(message);
    this.name = 'ProviderError';
  }

  /** Worth one more try: the provider was busy or slow, not refusing. */
  get transient(): boolean {
    return this.code === 'rate' || this.code === 'upstream' || this.code === 'timeout' || this.code === 'network';
  }
}

const KEYLIKE = /\b(?:sk-[A-Za-z0-9_-]{8,}|sk-ant-[A-Za-z0-9_-]{8,}|sk-or-[A-Za-z0-9_-]{8,}|AIza[0-9A-Za-z_-]{20,}|gsk_[A-Za-z0-9]{12,}|xai-[A-Za-z0-9]{12,})/g;

/** Removes the key, and anything shaped like one, from text bound for a log or a response. */
export function scrub(text: string, key?: string): string {
  let out = text;
  if (key && key.length >= 6) out = out.split(key).join('[key]');
  return out.replace(KEYLIKE, '[key]');
}

function classify(status: number, body: string, provider: string, key: string, retryAfter: string | null): ProviderError {
  const detail = scrub(extractMessage(body), key).slice(0, 240);
  const said = detail ? `: ${detail}` : '';
  const retryAfterMs = Math.min(12_000, Math.max(0, Number(retryAfter) * 1000 || 0));
  if (status === 401 || status === 403) return new ProviderError('auth', `${provider} rejected the key${said}`, status);
  if (status === 402) return new ProviderError('quota', `${provider} says the account is out of credit${said}`, status);
  if (status === 429) {
    const quota = /quota|insufficient|billing|credit|exceeded your/i.test(detail);
    return quota
      ? new ProviderError('quota', `${provider} quota exhausted${said}`, status)
      : new ProviderError('rate', `${provider} rate limit${said}`, status, retryAfterMs);
  }
  if (status === 404) return new ProviderError('model', `${provider} does not know that model${said}`, status);
  if (status === 400 || status === 422) {
    // Some providers answer a bad key with 400.
    if (/api[ _-]?key|unauthori[sz]ed|invalid.*key|authentication/i.test(detail)) {
      return new ProviderError('auth', `${provider} rejected the key${said}`, status);
    }
    // A request field the model will not take: the caller can drop it and try again.
    if (/temperature|max_tokens|max_completion_tokens|response_format|responseMimeType/i.test(detail)) {
      return new ProviderError('bad_request', `${provider} refused the request${said}`, status);
    }
    if (/reasoning_effort/i.test(detail)) return new ProviderError('bad_request', `${provider} refused the request${said}`, status);
    if (/model/i.test(detail) && /not (?:found|exist|supported)|unknown|invalid/i.test(detail)) {
      return new ProviderError('model', `${provider} does not know that model${said}`, status);
    }
    return new ProviderError('bad_request', `${provider} refused the request${said}`, status);
  }
  return new ProviderError('upstream', `${provider} error ${status}${said}`, status, retryAfterMs);
}

function extractMessage(body: string): string {
  try {
    const j = JSON.parse(body);
    const m = j?.error?.message ?? j?.error ?? j?.message ?? j?.detail;
    if (typeof m === 'string') return m;
    if (m && typeof m === 'object') return JSON.stringify(m).slice(0, 240);
  } catch { /* not JSON */ }
  return body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/* ───────────────────────────── Requests ───────────────────────────── */

export interface ChatRequest {
  system: string;
  user: string;
  /** Ask for a JSON object, where the provider can enforce it. */
  json: boolean;
  maxTokens: number;
  temperature?: number;
  signal?: AbortSignal;
  /** Per-call ceiling. */
  timeoutMs?: number;
  /** Pictures for the model to look at with the prompt, base64 without the data: prefix. Dropped by a model that cannot read them. */
  images?: { mime: string; data: string }[];
}

export interface ChatResult {
  text: string;
  input: number;
  output: number;
}

export type ChatFn = (req: ChatRequest) => Promise<ChatResult>;

type FetchLike = typeof fetch;

/**
 * Optional request fields a model may refuse. Reasoning models reject
 * `temperature`; some OpenAI-compatible hosts reject `response_format`; OpenAI's
 * newer models want `max_completion_tokens`. On a 400 naming one of these, the
 * call is repeated without it rather than failing the run.
 */
interface Relax { temperature: boolean; json: boolean; completionTokens: boolean; effort: boolean; images: boolean }

function relaxFor(message: string, r: Relax, sentImages = false): Relax | null {
  // A text-only model refusing a picture: ask again with words alone. Checked first, since such errors often mention the content's type or mime too.
  if (sentImages && !r.images && /image|vision|multimodal|multi-modal|image_url|inline_?data|content.{0,30}(array|list|type|part)|does not support|not supported|unsupported/i.test(message)) return { ...r, images: true };
  if (!r.effort && /reasoning_effort|reasoning effort/i.test(message)) return { ...r, effort: true };
  if (!r.temperature && /temperature/i.test(message)) return { ...r, temperature: true };
  if (!r.completionTokens && /max_tokens|max_completion_tokens/i.test(message)) return { ...r, completionTokens: true };
  if (!r.json && /response_format|json|responseMimeType|mime/i.test(message)) return { ...r, json: true };
  return null;
}

/** OpenAI's reasoning families take no temperature and count tokens as completion tokens. */
function openaiReasoning(model: string): boolean {
  return /^(?:o\d|gpt-5)/i.test(model.replace(/^openai\//, ''));
}

/**
 * Whether a model is likely to read pictures, so a camera's frame is worth
 * sending. A guess from the name: a model that turns out not to is asked again
 * with words alone (see relaxFor), so a wrong guess costs one refused call.
 */
export function canSeeImages(provider: ProviderId, model: string): boolean {
  const m = model.toLowerCase();
  switch (provider) {
    case 'anthropic': case 'google': return true;
    case 'openai': return /gpt-4o|gpt-4\.1|gpt-4-turbo|gpt-5|^o[134]/.test(m);
    case 'openrouter': return /gemini|claude|gpt-4o|gpt-4\.1|gpt-5|llama-4|pixtral|qwen.*vl|grok-4|vision|\/o[34]/.test(m);
    case 'groq': return /llama-4|vision/.test(m);
    case 'xai': return /grok-4|vision/.test(m);
    case 'mistral': return /pixtral|mistral-(small|medium)|magistral/.test(m);
    case 'qwen': return /vl|omni|qvq/.test(m);
    default: return false;
  }
}

function buildRequest(def: ProviderDef, key: string, model: string, req: ChatRequest, r: Relax): { url: string; init: RequestInit } {
  const images = !r.images && req.images?.length ? req.images : [];
  if (def.wire === 'anthropic') {
    return {
      url: `${def.base}/messages`,
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model,
          max_tokens: req.maxTokens,
          system: req.system,
          messages: [{
            role: 'user',
            content: images.length
              ? [...images.map(i => ({ type: 'image', source: { type: 'base64', media_type: i.mime, data: i.data } })), { type: 'text', text: req.user }]
              : req.user,
          }],
          ...(req.temperature !== undefined && !r.temperature ? { temperature: req.temperature } : {}),
        }),
      },
    };
  }
  if (def.wire === 'google') {
    return {
      url: `${def.base}/models/${encodeURIComponent(model)}:generateContent`,
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: req.system }] },
          contents: [{ role: 'user', parts: [...images.map(i => ({ inlineData: { mimeType: i.mime, data: i.data } })), { text: req.user }] }],
          generationConfig: {
            // Thinking models spend from the same budget; leave them room to answer.
            maxOutputTokens: Math.max(req.maxTokens, 8192),
            ...(req.temperature !== undefined && !r.temperature ? { temperature: req.temperature } : {}),
            ...(req.json && !r.json ? { responseMimeType: 'application/json' } : {}),
          },
        }),
      },
    };
  }
  const reasoning = def.id === 'openai' && openaiReasoning(model);
  const completion = r.completionTokens || def.id === 'openai';
  const headers: Record<string, string> = { 'content-type': 'application/json', authorization: `Bearer ${key}` };
  if (def.id === 'openrouter') {
    headers['HTTP-Referer'] = 'https://osirisai.live';
    headers['X-Title'] = 'OSIRIS OI';
  }
  return {
    url: `${def.base}/chat/completions`,
    init: {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: req.system },
          {
            role: 'user',
            content: images.length
              ? [{ type: 'text', text: req.user }, ...images.map(i => ({ type: 'image_url', image_url: { url: `data:${i.mime};base64,${i.data}` } }))]
              : req.user,
          },
        ],
        // Reasoning models spend completion tokens thinking before they answer.
        ...(completion ? { max_completion_tokens: reasoning ? Math.max(req.maxTokens, 8000) : req.maxTokens } : { max_tokens: req.maxTokens }),
        ...(req.temperature !== undefined && !r.temperature && !reasoning ? { temperature: req.temperature } : {}),
        // A panel turn needs a considered answer, not a long deliberation: low effort keeps a run to minutes.
        ...(reasoning && !r.effort ? { reasoning_effort: 'low' } : {}),
        ...(req.json && !r.json ? { response_format: { type: 'json_object' } } : {}),
      }),
    },
  };
}

/* What each wire answers with, as far as this module reads it. Every field is optional: providers drift. */
interface AnthropicReply { content?: { type?: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } }
interface GeminiReply {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}
interface OpenAIReply {
  choices?: { message?: { content?: string | (string | { text?: string })[] | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}
interface ModelListing {
  data?: { id?: string; name?: string; display_name?: string }[];
  models?: { name?: string; displayName?: string; supportedGenerationMethods?: string[] }[];
}

function readResponse(def: ProviderDef, body: unknown): ChatResult {
  if (def.wire === 'anthropic') {
    const j = body as AnthropicReply;
    const text = Array.isArray(j?.content) ? j.content.filter(c => c?.type === 'text').map(c => String(c.text ?? '')).join('') : '';
    return { text, input: num(j?.usage?.input_tokens), output: num(j?.usage?.output_tokens) };
  }
  if (def.wire === 'google') {
    const j = body as GeminiReply;
    const cand = j?.candidates?.[0];
    const parts = Array.isArray(cand?.content?.parts) ? cand.content.parts : [];
    const text = parts.filter(p => !p?.thought).map(p => String(p?.text ?? '')).join('');
    if (!text && (cand?.finishReason === 'SAFETY' || j?.promptFeedback?.blockReason)) {
      throw new ProviderError('bad_request', 'Gemini declined to answer (safety filter)');
    }
    return { text, input: num(j?.usageMetadata?.promptTokenCount), output: num(j?.usageMetadata?.candidatesTokenCount) };
  }
  const j = body as OpenAIReply;
  const content = j?.choices?.[0]?.message?.content;
  const text = typeof content === 'string'
    ? content
    : Array.isArray(content) ? content.map(c => (typeof c === 'string' ? c : String(c?.text ?? ''))).join('') : '';
  return { text, input: num(j?.usage?.prompt_tokens), output: num(j?.usage?.completion_tokens) };
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) return reject(signal.reason);
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason); }, { once: true });
});

async function send(def: ProviderDef, key: string, url: string, init: RequestInit, req: ChatRequest, f: FetchLike): Promise<unknown> {
  const timeout = AbortSignal.timeout(req.timeoutMs ?? 90_000);
  const signal = req.signal ? AbortSignal.any([req.signal, timeout]) : timeout;
  let res: Response;
  try {
    res = await f(url, { ...init, signal, cache: 'no-store' });
  } catch (err) {
    if (req.signal?.aborted) throw req.signal.reason ?? err;
    if (timeout.aborted) throw new ProviderError('timeout', `${def.name} did not answer in time`);
    throw new ProviderError('network', `Could not reach ${def.name}`);
  }
  const body = await res.text().catch(() => '');
  if (!res.ok) throw classify(res.status, body, def.name, key, res.headers.get('retry-after'));
  try {
    return JSON.parse(body);
  } catch {
    throw new ProviderError('upstream', `${def.name} sent a reply that was not JSON`);
  }
}

/**
 * A chat function bound to one provider, key and model. It retries once on a
 * busy or slow provider, and adapts to the request fields a model refuses.
 */
export function createChat(provider: ProviderId, key: string, model: string, f: FetchLike = fetch): ChatFn {
  const def = BY_ID.get(provider);
  if (!def) throw new ProviderError('bad_request', 'Unknown provider');
  if (def.wire === 'demo') return createDemoChat([300, 1400]);
  let relax: Relax = { temperature: false, json: false, completionTokens: false, effort: false, images: false };

  return async function chat(req: ChatRequest): Promise<ChatResult> {
    let retried = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      const { url, init } = buildRequest(def, key, model, req, relax);
      try {
        const out = readResponse(def, await send(def, key, url, init, req, f));
        if (!out.text.trim()) throw new ProviderError('empty', `${def.name} returned an empty answer`);
        return out;
      } catch (err) {
        if (!(err instanceof ProviderError)) throw err;
        if (err.code === 'bad_request') {
          const next = relaxFor(err.message, relax, Boolean(req.images?.length));
          if (next) { relax = next; continue; }
        }
        if ((err.transient || err.code === 'empty') && !retried) {
          retried = true;
          await sleep(err.retryAfterMs || 1500 + Math.random() * 2000, req.signal);
          continue;
        }
        throw err;
      }
    }
    throw new ProviderError('bad_request', `${def.name} refused every form of the request`);
  };
}

/* ───────────────────────────── Models ───────────────────────────── */

export interface ModelEntry {
  id: string;
  name: string;
}

/** Ids that are not chat models: embeddings, speech, images, moderation. */
const NOT_CHAT = /embed|whisper|tts|audio|realtime|transcribe|dall-e|image|moderation|guard|rerank|davinci|babbage|search|computer-use|-instruct$|veo|imagen|aqa|learnlm|gemma-?3n/i;
/** OpenAI models served only by its Responses API, which OI does not use: the pro, codex and deep-research models, and video. */
const OPENAI_RESPONSES_ONLY = /-pro(?:-|$)|codex|deep-research|^sora/i;

/**
 * The models this key can use, from the provider itself. A rejected key fails
 * here, which is why the panel calls this to check a key before a run.
 */
export async function listModels(provider: ProviderId, key: string, f: FetchLike = fetch): Promise<{ models: ModelEntry[]; listed: boolean }> {
  const def = BY_ID.get(provider);
  if (!def) throw new ProviderError('bad_request', 'Unknown provider');
  if (def.wire === 'demo') return { models: [{ id: 'scripted', name: 'Scripted demo' }], listed: true };
  const get = async (url: string, headers: Record<string, string>): Promise<ModelListing> => {
    const req: ChatRequest = { system: '', user: '', json: false, maxTokens: 0, timeoutMs: 15_000 };
    return (await send(def, key, url, { method: 'GET', headers }, req, f)) as ModelListing;
  };

  let models: ModelEntry[] = [];
  try {
    if (def.wire === 'anthropic') {
      const j = await get(`${def.base}/models?limit=100`, { 'x-api-key': key, 'anthropic-version': '2023-06-01' });
      models = (j?.data ?? []).map(m => ({ id: String(m.id), name: String(m.display_name || m.id) }));
    } else if (def.wire === 'google') {
      const j = await get(`${def.base}/models?pageSize=200`, { 'x-goog-api-key': key });
      models = (j?.models ?? [])
        .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
        .map(m => ({ id: String(m.name).replace(/^models\//, ''), name: String(m.displayName || m.name) }));
    } else if (def.id === 'openrouter') {
      // OpenRouter lists models without a key, so check the key on its own.
      await get(`${def.base}/key`, { authorization: `Bearer ${key}` });
      const j = await get(`${def.base}/models`, {});
      models = (j?.data ?? []).map(m => ({ id: String(m.id), name: String(m.name || m.id) }));
    } else {
      const j = await get(`${def.base}/models`, { authorization: `Bearer ${key}` });
      models = (j?.data ?? []).map(m => ({ id: String(m.id), name: String(m.id) }));
    }
  } catch (err) {
    // A provider without a listing endpoint: offer the known names. The key is checked on the first call.
    if (err instanceof ProviderError && (err.status === 404 || err.status === 405)) {
      return { models: def.suggested.map(id => ({ id, name: id })), listed: false };
    }
    throw err;
  }

  const seen = new Set<string>();
  const chat = models
    .filter(m => isPlausibleModel(m.id) && !NOT_CHAT.test(m.id) && !(def.id === 'openai' && OPENAI_RESPONSES_ONLY.test(m.id)) && !seen.has(m.id) && seen.add(m.id))
    .slice(0, 500);
  // Suggested models first, in their order, then the rest A–Z.
  const rank = (id: string) => { const i = def.suggested.indexOf(id); return i < 0 ? 1e3 : i; };
  chat.sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id));
  return { models: chat, listed: true };
}

/** The model to preselect: the provider default when the key can use it, else the first suggested one listed, else the first. */
export function pickModel(provider: ProviderId, models: ModelEntry[]): string {
  const def = BY_ID.get(provider)!;
  const ids = new Set(models.map(m => m.id));
  if (ids.has(def.defaultModel)) return def.defaultModel;
  return def.suggested.find(id => ids.has(id)) ?? models[0]?.id ?? def.defaultModel;
}
