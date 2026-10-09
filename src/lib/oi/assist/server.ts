/**
 * OSIRIS OI Assist: the server's half of a step.
 *
 * The page sends the conversation and what is on screen; this checks both,
 * puts them to the reader's model on the reader's key, and returns the step
 * the model chose. Nothing is kept: the conversation lives in the page.
 *
 * When the last step looked through a camera, a model that reads pictures is
 * shown the frame too, alongside the counts the page sent back.
 */
import { canSeeImages, createChat, providerInfo, ProviderError, type ChatFn, type ChatRequest } from '../providers';
import type { Credentials } from '../service';
import { parseStep, sanitizeContext, sanitizeMessages, systemPrompt, userPrompt, type AssistMessage, type Step } from './protocol';

export type Stepped =
  | { ok: true; step: Step; usage: { input: number; output: number } }
  | { ok: false; status: number; error: string };

const cameraIdOf = (data: unknown): string | null => {
  const cam = data && typeof data === 'object' ? (data as Record<string, unknown>).camera : null;
  const id = cam && typeof cam === 'object' ? (cam as Record<string, unknown>).id : null;
  return typeof id === 'string' && id ? id : null;
};

/** The frames of the cameras the last step looked through: at most two, with a note saying which is which. */
async function framesFor(last: AssistMessage): Promise<{ images: NonNullable<ChatRequest['images']>; note: string }> {
  const ids = last.role === 'tool'
    ? last.results.filter(r => r.tool === 'camera' && r.ok).map(r => cameraIdOf(r.data)).filter((id): id is string => Boolean(id)).slice(-2)
    : [];
  if (!ids.length) return { images: [], note: '' };
  const { frameForModel } = await import('../../vision/attach');
  const frames = (await Promise.all(ids.map(frameForModel))).filter(f => f !== null);
  if (!frames.length) return { images: [], note: '' };
  const one = frames.length === 1;
  return {
    images: frames.map(f => f.image),
    note: `\n\nATTACHED: ${one ? 'the frame' : 'the frames'} from the camera tool, in order: ${frames.map((f, i) => `${i + 1}. ${f.name}, ${f.at.slice(11, 16)} UTC`).join('; ')}. Read ${one ? 'it' : 'them'} for what counts cannot say (weather, the road, queues, incidents, crowds); where you see more or less than the counts, say so.`,
  };
}

export async function assistStep(body: Record<string, unknown>, creds: Credentials, signal?: AbortSignal, chat?: ChatFn): Promise<Stepped> {
  const messages = sanitizeMessages(body.messages);
  const last = messages[messages.length - 1];
  if (!last || last.role === 'assistant') return { ok: false, status: 400, error: 'Send the conversation, ending with your message or the results of the last actions.' };
  if (!creds.provider) return { ok: false, status: 400, error: 'Choose a provider (X-OI-Provider).' };
  const info = providerInfo(creds.provider);
  if (!creds.key && info.needsKey) return { ok: false, status: 401, error: `OI Assist runs on your own ${info.name} key (X-OI-Key or Authorization: Bearer).` };
  const context = sanitizeContext(body.context);
  const model = creds.model || info.defaultModel;
  try {
    const call = chat ?? createChat(creds.provider, creds.key ?? '', model);
    const seen = canSeeImages(creds.provider, model) ? await framesFor(last) : { images: [], note: '' };
    const out = await call({
      system: systemPrompt(), user: userPrompt(messages, context) + seen.note, json: true, maxTokens: 1400, temperature: 0.3, timeoutMs: 45_000, signal,
      ...(seen.images.length ? { images: seen.images } : {}),
    });
    return { ok: true, step: parseStep(out.text), usage: { input: out.input, output: out.output } };
  } catch (err) {
    if (err instanceof ProviderError) {
      const status = err.code === 'auth' ? 401 : err.code === 'quota' ? 402 : err.code === 'rate' ? 429 : err.code === 'model' || err.code === 'bad_request' ? 400 : 502;
      return { ok: false, status, error: err.message };
    }
    if (signal?.aborted) return { ok: false, status: 499, error: 'Cancelled.' };
    return { ok: false, status: 500, error: 'OI could not answer just then.' };
  }
}
