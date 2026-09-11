import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const OLLAMA = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
const PROXY_PUBLIC = process.env.LOCAL_AI_PUBLIC_BASE ?? null;
const PREFERRED_MODEL = process.env.LOCAL_AI_MODEL ?? 'qwen3:14b-osiris';
const EMBED_MODEL = process.env.LOCAL_AI_EMBED_MODEL ?? 'nomic-embed-text';
const INFER_TIMEOUT_MS = Number(process.env.LOCAL_AI_INFER_PROBE_MS ?? 8000);
const TAGS_TIMEOUT_MS = 2000;
const EMBED_TIMEOUT_MS = Number(process.env.LOCAL_AI_EMBED_PROBE_MS ?? 4000);
const RAG_STALE_MS = Number(process.env.LOCAL_AI_RAG_STALE_MS ?? 24 * 60 * 60 * 1000);
const VECTOR_STORE_FILE = path.join(process.cwd(), 'data', 'vector-db', 'tactical-embeddings.json');

function parseQuant(name: string): string | null {
  const m = name.match(/[Qq]\d+(?:_[A-Za-z0-9]+)?|[Ff]\d+(?:\.\d+)?|GGUF/i);
  return m ? m[0].toUpperCase() : null;
}

async function ollamaJson(path: string, init?: RequestInit, ms = 5000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(`${OLLAMA}${path}`, { ...init, cache: 'no-store', signal: ctrl.signal });
    if (!res.ok) throw new Error(`${path} ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function pickModel(models: Array<{ name?: string; size?: number }>, preferred: string) {
  if (!Array.isArray(models) || models.length === 0) return null;
  const hit = models.find((m) => m?.name === preferred) || models[0];
  return hit?.name ? hit : null;
}


type RagSource = 'live' | 'stale' | 'off';

function readRagStoreMeta(): { docCount: number; updatedAt: string | null; exists: boolean } {
  try {
    if (!fs.existsSync(VECTOR_STORE_FILE)) {
      return { docCount: 0, updatedAt: null, exists: false };
    }
    const st = fs.statSync(VECTOR_STORE_FILE);
    const raw = fs.readFileSync(VECTOR_STORE_FILE, 'utf8');
    const docs = JSON.parse(raw);
    const docCount = Array.isArray(docs) ? docs.length : 0;
    return { docCount, updatedAt: new Date(st.mtimeMs).toISOString(), exists: true };
  } catch {
    return { docCount: 0, updatedAt: null, exists: false };
  }
}

async function probeEmbedder(): Promise<{ ok: boolean; error: string | null }> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), EMBED_TIMEOUT_MS);
    try {
      const res = await fetch(`${OLLAMA}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: EMBED_MODEL, prompt: 'rag-health-probe' }),
        signal: ctrl.signal,
        cache: 'no-store',
      });
      if (!res.ok) return { ok: false, error: `embed_http_${res.status}` };
      const data = await res.json();
      const emb = data?.embedding;
      if (!Array.isArray(emb) || emb.length < 8) return { ok: false, error: 'embed_empty' };
      return { ok: true, error: null };
    } finally {
      clearTimeout(t);
    }
  } catch (e: unknown) {
    const err = e as { name?: string; message?: string };
    return { ok: false, error: err?.name === 'AbortError' ? 'embed_timeout' : (err?.message || 'embed_error') };
  }
}

export async function GET() {
  const checkedAt = new Date().toISOString();
  const headers = { 'Cache-Control': 'no-store' };
  let ollama: 'available' | 'down' | 'timeout' = 'down';
  let modelList = false;
  let inference = false;
  let loadedModel: { name: string; quant: string | null; size: number | null } | null = null;

  try {
    const tags = await ollamaJson('/api/tags', undefined, TAGS_TIMEOUT_MS);
    ollama = 'available';
    modelList = Array.isArray(tags?.models) && tags.models.length > 0;

    let name: string | null = null;
    let size: number | null = null;

    try {
      const ps = await ollamaJson('/api/ps', undefined, TAGS_TIMEOUT_MS);
      const m = pickModel(ps?.models ?? [], PREFERRED_MODEL);
      if (m?.name) {
        name = m.name;
        size = typeof m.size === 'number' ? m.size : (m as { size_vram?: number }).size_vram ?? null;
      }
    } catch {
      // ignore — fall through to tags
    }

    if (!name) {
      const m = pickModel(tags?.models ?? [], PREFERRED_MODEL);
      if (m?.name) {
        name = m.name;
        size = typeof m.size === 'number' ? m.size : null;
      }
    }

    if (name) {
      // Modelfile names often omit quant; keep null rather than invent Q5
      loadedModel = { name, quant: parseQuant(name), size };
      try {
        const gen = await ollamaJson(
          '/api/generate',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: name,
              prompt: 'ping',
              stream: false,
              options: { num_predict: 1 },
            }),
          },
          INFER_TIMEOUT_MS,
        );
        inference = gen?.response != null || gen?.done === true;
      } catch {
        inference = false;
      }
    }
  } catch (e: unknown) {
    const err = e as { name?: string };
    ollama = err?.name === 'AbortError' ? 'timeout' : 'down';
  }

  let listenPort = 11434;
  try {
    listenPort = Number(new URL(OLLAMA).port || (OLLAMA.startsWith('https') ? 443 : 80));
  } catch {
    listenPort = 11434;
  }

  const ok = ollama === 'available';
  // RAG honesty (spec ② step 1) — no fake rag=true
  const store = readRagStoreMeta();
  const embed = await probeEmbedder();
  const ageMs = store.updatedAt ? Date.now() - Date.parse(store.updatedAt) : Number.POSITIVE_INFINITY;
  let ragSource: RagSource = 'off';
  if (store.docCount >= 1) {
    ragSource = Number.isFinite(ageMs) && ageMs <= RAG_STALE_MS ? 'live' : 'stale';
  }
  // Acceptance: embedder down => rag=false even if docs exist
  const ragSuccess = embed.ok && store.docCount >= 1 && ragSource === 'live';
  const rag = {
    success: ragSuccess,
    docCount: store.docCount,
    updatedAt: store.updatedAt,
    source: ragSource,
    embedder: embed.ok ? 'ok' : 'down',
    embedModel: EMBED_MODEL,
    lastError: embed.error,
  };

  return NextResponse.json(
    {
      status: ok ? 'ok' : 'offline',
      primary: OLLAMA,
      checkedAt,
      checks: { ollama },
      verification: { modelList, inference, rag: ragSuccess, training: false },
      loadedModel,
      endpoints: { ollama: OLLAMA, proxy: PROXY_PUBLIC, listenPort },
      rag,
    },
    { status: ok ? 200 : 503, headers },
  );
}
