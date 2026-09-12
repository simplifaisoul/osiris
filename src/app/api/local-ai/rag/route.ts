import { NextResponse } from 'next/server';
import {
  searchTacticalKnowledge,
  loadVectorStore,
  upsertVectorDocuments,
  type VectorDocument,
} from '@/lib/local-rag-engine';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const FEED_BASE = process.env.LOCAL_AI_FEED_BASE ?? 'http://127.0.0.1:3000';
const KEYWORDS = /missile|strike|earthquake|satellite|invasion|artillery|nuclear|침투|미사일|지진|북한|발사|공습|드론/i;

type NormDoc = Omit<VectorDocument, 'embedding'>;

function shouldIndexNews(item: any): boolean {
  const risk = Number(item?.risk_score ?? 0);
  const text = `${item?.title || ''} ${item?.description || ''}`;
  if (risk >= 5) return true;
  if (KEYWORDS.test(text)) return true;
  return false;
}

function shouldIndexQuake(q: any): boolean {
  return Number(q?.magnitude ?? 0) >= 5;
}

function hashId(prefix: string, raw: string): string {
  // lightweight stable id without crypto dep issues
  let h = 0;
  for (let i = 0; i < raw.length; i++) h = (h * 31 + raw.charCodeAt(i)) >>> 0;
  return `${prefix}-${h.toString(16)}`;
}

async function fetchJson(path: string): Promise<any | null> {
  try {
    const res = await fetch(`${FEED_BASE}${path}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function normalizeFeeds(news: any, quakes: any, gdelt: any): NormDoc[] {
  const out: NormDoc[] = [];
  const newsItems: any[] = news?.news || [];
  for (const item of newsItems) {
    if (!shouldIndexNews(item)) continue;
    const id = String(item.id || hashId('news', item.link || item.title || ''));
    const content = `${item.title || ''}. ${item.description || ''}`.trim();
    if (!content) continue;
    out.push({
      id: `feed-news-${id}`,
      title: item.title || 'news',
      category: 'live_news',
      content,
      metadata: {
        source_org: item.source || 'news',
        source_url: item.link || '',
        date: item.published || new Date().toISOString(),
        verification_tier: 'LIVE-FEED',
        verification_score: Number(item.risk_score ?? 0),
      },
    });
  }

  const quakeItems: any[] = quakes?.earthquakes || [];
  for (const q of quakeItems) {
    if (!shouldIndexQuake(q)) continue;
    const id = String(q.id || hashId('quake', `${q.place}-${q.time}`));
    const content = `Earthquake M${q.magnitude} at ${q.place || 'unknown'}. depth=${q.depth}km tsunami=${q.tsunami}`;
    out.push({
      id: `feed-quake-${id}`,
      title: `M${q.magnitude} ${q.place || 'quake'}`,
      category: 'live_earthquake',
      content,
      metadata: {
        source_org: quakes?.source || 'USGS',
        source_url: q.url || '',
        date: q.time ? new Date(q.time).toISOString() : new Date().toISOString(),
        verification_tier: 'LIVE-FEED',
        verification_score: Math.round(Number(q.magnitude || 0) * 10),
      },
    });
  }

  const events: any[] = gdelt?.events || [];
  // cap gdelt to avoid huge cycles
  let gCount = 0;
  for (const ev of events) {
    if (gCount >= 15) break;
    const text = `${ev.name || ''} ${ev.html || ''} ${ev.type || ''}`;
    if (!KEYWORDS.test(text)) continue;
    const id = String(ev.id || hashId('gdelt', ev.url || ev.name || ''));
    out.push({
      id: `feed-gdelt-${id}`,
      title: ev.name || 'gdelt',
      category: 'live_gdelt',
      content: text.slice(0, 1200),
      metadata: {
        source_org: 'GDELT',
        source_url: ev.url || '',
        date: new Date().toISOString(),
        verification_tier: 'LIVE-FEED',
        verification_score: 1,
      },
    });
    gCount += 1;
  }
  return out;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q') || '';
    const topK = parseInt(searchParams.get('topK') || '3', 10);

    if (!query) {
      const allDocs = loadVectorStore();
      return NextResponse.json({
        ok: true,
        total_indexed_documents: allDocs.length,
        message: 'Query parameter ?q=... required for semantic search',
      });
    }

    const startTime = Date.now();
    const results = await searchTacticalKnowledge(query, topK, 0.4);
    const latencyMs = Date.now() - startTime;

    return NextResponse.json({
      ok: true,
      query,
      latency_ms: latencyMs,
      total_matches: results.length,
      results: results.map((r) => ({
        score: Math.round(r.score * 1000) / 10,
        id: r.doc.id,
        title: r.doc.title,
        category: r.doc.category,
        source_org: r.doc.metadata.source_org,
        source_url: r.doc.metadata.source_url,
        mgrs: r.doc.metadata.mgrs,
        content: r.doc.content,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
}

async function runIncrementalUpsert() {
  const [news, quakes, gdelt] = await Promise.all([
    fetchJson('/api/news'),
    fetchJson('/api/earthquakes'),
    fetchJson('/api/gdelt'),
  ]);
  const candidates = normalizeFeeds(news, quakes, gdelt);
  // Heartbeat keeps index mtime fresh when no eligible high-risk items
  if (candidates.length === 0) {
    candidates.push({
      id: `feed-heartbeat-${new Date().toISOString().slice(0, 13)}`,
      title: 'RAG incremental heartbeat',
      category: 'live_heartbeat',
      content: `OSIRIS live RAG heartbeat at ${new Date().toISOString()}. Feeds polled; no eligible high-risk items this cycle.`,
      metadata: {
        source_org: 'OSIRIS',
        source_url: '/api/local-ai/rag',
        date: new Date().toISOString(),
        verification_tier: 'LIVE-FEED',
        verification_score: 0,
      },
    });
  }
  const result = await upsertVectorDocuments(candidates);
  return { candidates: candidates.length, upsert: result, timestamp: new Date().toISOString() };
}

/** One incremental feed → RAG upsert cycle */
export async function POST() {
  try {
    const body = await runIncrementalUpsert();
    return NextResponse.json({ ok: true, ...body });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
}

/** Server-side feed poller hook (aligned ~news 30m). Deduped across HMR. */
const g = globalThis as unknown as { __osirisRagPoller?: NodeJS.Timeout };
const RAG_POLL_MS = Number(process.env.LOCAL_AI_RAG_POLL_MS ?? 30 * 60 * 1000);
if (!g.__osirisRagPoller) {
  g.__osirisRagPoller = setInterval(() => {
    runIncrementalUpsert()
      .then((r) => console.log('[RAG poller]', r.timestamp, 'inserted', r.upsert.inserted, 'updated', r.upsert.updated))
      .catch((e) => console.warn('[RAG poller] failed', e?.message || e));
  }, RAG_POLL_MS);
  // Soft unref if available so it does not keep process alive alone
  (g.__osirisRagPoller as any)?.unref?.();
}
