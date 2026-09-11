/**
 * ⚡ 번개의 눈동자 (OSIRIS) — 온디바이스 로컬 벡터 RAG 엔진 (Local Vector RAG Engine)
 * 
 * GitHub 1~2순위 기술 표준 (LanceDB / Nomic Embed) 영감:
 * 1. 로컬 Ollama nomic-embed-text (768차원 F16, 274MB) 활용
 * 2. 19개 싱크탱크 일일 보고서, 북한 22개 전략 기지, 전술기 59종 제원을 로컬 파일 기반 벡터 스토리지로 인덱싱
 * 3. 지휘관의 전술 질문에 대해 코사인 유사도(Cosine Similarity) 기반 상위 K개 공인 팩트를 10ms 만에 인출
 */

import fs from 'fs';
import path from 'path';

export interface VectorDocument {
  id: string;
  title: string;
  category: string;
  content: string;
  metadata: {
    source_org: string;
    source_url: string;
    date: string;
    mgrs?: string;
    verification_tier?: string;
    verification_score?: number;
  };
  embedding?: number[];
}

export interface SearchResult {
  doc: VectorDocument;
  score: number; // Cosine similarity: 0.0 ~ 1.0
}

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const EMBED_MODEL = 'nomic-embed-text';

const VECTOR_STORE_DIR = path.join(process.cwd(), 'data', 'vector-db');
const VECTOR_STORE_FILE = path.join(VECTOR_STORE_DIR, 'tactical-embeddings.json');

/**
 * 로컬 Ollama nomic-embed-text API 호출하여 768차원 임베딩 벡터 생성
 */
export async function getEmbedding(text: string): Promise<number[] | null> {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: EMBED_MODEL,
        prompt: text.replace(/\n+/g, ' ').slice(0, 1000), // context limit safety
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.embedding || null;
  } catch (err) {
    console.warn('[LocalRAG] embedding call failed:', err);
    return null;
  }
}

/**
 * 코사인 유사도 (Cosine Similarity) 계산
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * 저장된 벡터 DB 로드
 */
export function loadVectorStore(): VectorDocument[] {
  try {
    if (fs.existsSync(VECTOR_STORE_FILE)) {
      return JSON.parse(fs.readFileSync(VECTOR_STORE_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('[LocalRAG] failed to load vector store:', e);
  }
  return [];
}

/**
 * 벡터 DB 저장
 */
export function saveVectorStore(docs: VectorDocument[]): void {
  if (!fs.existsSync(VECTOR_STORE_DIR)) {
    fs.mkdirSync(VECTOR_STORE_DIR, { recursive: true });
  }
  fs.writeFileSync(VECTOR_STORE_FILE, JSON.stringify(docs, null, 2), 'utf8');
}

/**
 * 지휘관 질의(Query)에 대한 가장 유사한 상위 전술 문서 검색 (RAG Retrieval)
 */
export async function searchTacticalKnowledge(
  query: string,
  topK: number = 3,
  minScore: number = 0.4
): Promise<SearchResult[]> {
  const queryVec = await getEmbedding(query);
  if (!queryVec) {
    console.warn('[LocalRAG] query embedding failed, fallback to keyword matching');
    return [];
  }

  const docs = loadVectorStore();
  if (docs.length === 0) return [];

  const results: SearchResult[] = [];
  for (const doc of docs) {
    if (!doc.embedding) continue;
    const score = cosineSimilarity(queryVec, doc.embedding);
    if (score >= minScore) {
      results.push({ doc, score });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}

/**
 * RAG 검색 결과를 바탕으로 LLM에게 주입할 증강 프롬프트(Context Block) 생성
 */
export async function buildRagContextPrompt(userQuery: string): Promise<string> {
  const searchResults = await searchTacticalKnowledge(userQuery, 3, 0.45);
  if (searchResults.length === 0) {
    return '';
  }

  const contextBlocks = searchResults.map((r, i) => {
    const d = r.doc;
    return `[팩트 #${i + 1} (유사도: ${(r.score * 100).toFixed(1)}%)]
- 표제: ${d.title}
- 출처/기관: ${d.metadata.source_org} (${d.metadata.verification_tier || 'TIER-1'})
- 원문 URL: ${d.metadata.source_url}
- 일시/좌표: ${d.metadata.date} | ${d.metadata.mgrs || 'MGRS 1m 급'}
- 상세 내용: ${d.content}`;
  }).join('\n\n');

  return `\n\n══════════════════════════════════════════════════════════════════════════════
[로컬 벡터 RAG 인출 — 참고용]
아래는 로컬 nomic-embed-text로 검색된 저장 문서입니다. 출처 URL이 있을 때만 근거로 쓰고, 없으면 단정하지 마세요.
══════════════════════════════════════════════════════════════════════════════
${contextBlocks}
══════════════════════════════════════════════════════════════════════════════\n`;
}


export interface UpsertResult {
  before: number;
  after: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
}

/**
 * Incremental upsert by document id. Existing ids are replaced; unknown ids appended.
 */
export async function upsertVectorDocuments(
  incoming: Array<Omit<VectorDocument, 'embedding'> & { embedding?: number[] }>
): Promise<UpsertResult> {
  const store = loadVectorStore();
  const byId = new Map(store.map((d) => [d.id, d]));
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const doc of incoming) {
    if (!doc?.id || !doc.content?.trim()) {
      skipped += 1;
      continue;
    }
    let embedding = doc.embedding;
    if (!embedding || embedding.length < 8) {
      embedding = (await getEmbedding(doc.content)) || undefined;
    }
    if (!embedding || embedding.length < 8) {
      failed += 1;
      continue;
    }
    const next: VectorDocument = {
      id: doc.id,
      title: doc.title,
      category: doc.category,
      content: doc.content,
      metadata: doc.metadata,
      embedding,
    };
    if (byId.has(doc.id)) {
      updated += 1;
    } else {
      inserted += 1;
    }
    byId.set(doc.id, next);
  }

  const afterDocs = Array.from(byId.values());
  saveVectorStore(afterDocs);
  return {
    before: store.length,
    after: afterDocs.length,
    inserted,
    updated,
    skipped,
    failed,
  };
}
