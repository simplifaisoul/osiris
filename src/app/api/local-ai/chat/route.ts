import { NextRequest } from 'next/server';
import { withThinkingOsMessages } from '@/lib/local-thinking-os';

const OLLAMA = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
const PREFERRED_MODEL = process.env.LOCAL_AI_MODEL ?? 'qwen3:14b-osiris';
const HARD_TIMEOUT_MS = Number(process.env.LOCAL_AI_CHAT_TIMEOUT_MS ?? 120_000);
const SOON_MS = Number(process.env.LOCAL_AI_TIMEOUT_SOON_MS ?? 45_000);
const RAG_TIMEOUT_MS = Number(process.env.LOCAL_AI_RAG_TIMEOUT_MS ?? 2500);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function resolveModel(preferred?: string): Promise<string | null> {
  if (preferred && preferred.trim()) return preferred.trim();
  try {
    const ps = await fetch(`${OLLAMA}/api/ps`, { signal: AbortSignal.timeout(4000) });
    if (ps.ok) {
      const j = await ps.json();
      const names = (j?.models ?? []).map((m: { name?: string }) => m?.name).filter(Boolean);
      if (names.includes(PREFERRED_MODEL)) return PREFERRED_MODEL;
      if (names[0]) return names[0];
    }
  } catch {}
  try {
    const tags = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(4000) });
    if (tags.ok) {
      const j = await tags.json();
      const names = (j?.models ?? []).map((m: { name?: string }) => m?.name).filter(Boolean);
      if (names.includes(PREFERRED_MODEL)) return PREFERRED_MODEL;
      if (names[0]) return names[0];
    }
  } catch {}
  return PREFERRED_MODEL;
}

function sseEncode(obj: Record<string, unknown>, encoder: TextEncoder) {
  return encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);
}

type ChatRag = {
  context: string;
  ragSuccess: boolean;
  assertiveAllowed: boolean;
  citations: Array<{ id: string; title: string; url: string; score?: number }>;
};

async function softRag(lastUser: string): Promise<ChatRag> {
  const empty: ChatRag = { context: '', ragSuccess: false, assertiveAllowed: false, citations: [] };
  if (!lastUser) return empty;
  try {
    const { searchTacticalKnowledge, loadVectorStore } = await import('@/lib/local-rag-engine');
    const work = (async (): Promise<ChatRag> => {
      const RAG_SOFT = 0.42;
      const RAG_STRONG = 0.58;
      const hits = await searchTacticalKnowledge(lastUser, 5, RAG_SOFT);
      const needle = lastUser.trim().toLowerCase();
      // Prefer multi-char Korean/Latin tokens from the user query for grounding
      const STOP = new Set([
        '상태','요약','알려','말해','오늘','관련','정보','대해','무엇','어디','어떻게','확인','분석','브리핑','설명','해줘','해주세요','인가','인가?','좀','제발','단정','확정','적으로',
      ]);
      const tokens = needle
        .split(/[\s\-/_,.?!；：:，、]+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 2 && !STOP.has(s));
      const grounded = (title: string, content: string) => {
        const blob = `${title} ${content}`.toLowerCase();
        return tokens.some((tok) => {
          const isHangul = /[가-힣]/.test(tok);
          if (isHangul && tok.length >= 2 && blob.includes(tok)) return true;
          if (!isHangul && tok.length >= 4 && blob.includes(tok)) return true;
          return false;
        });
      };
      const isProtocolDoc = (doc: { id?: string; category?: string; metadata?: Record<string, unknown> }) => {
        const id = String(doc.id || '').toLowerCase();
        const cat = String(doc.category || '').toLowerCase();
        const tags = doc.metadata?.tags;
        const tagHit = Array.isArray(tags) && tags.some((x) => {
          const s = String(x).toLowerCase();
          return s.includes('thinking-os') || s.includes('protocol');
        });
        return (
          tagHit ||
          cat === 'thinking-os' ||
          cat.includes('protocol') ||
          id.startsWith('thinking-os') ||
          id.includes('protocol') ||
          id.includes('ui-field-contract') ||
          id.includes('inject-spec')
        );
      };
      // Protocol/contract docs never count as domain observation citations
      let strong = hits.filter(
        (h) => !isProtocolDoc(h.doc) && h.score >= RAG_STRONG && grounded(h.doc.title, h.doc.content),
      );
      if (strong.length === 0) {
        const store = loadVectorStore();
        strong = store
          .filter((doc) => !isProtocolDoc(doc) && grounded(doc.title, doc.content))
          .slice(0, 3)
          .map((doc) => ({ doc, score: 1 }));
      }
      const softCtx =
        hits.length > 0
          ? hits
              .slice(0, 3)
              .map(
                (h, i) =>
                  `[팩트 #${i + 1} score=${Math.round(h.score * 1000) / 1000}] ${h.doc.title}\n출처: ${h.doc.metadata?.source_url || '로컬스토어'}\n${h.doc.content.slice(0, 280)}`,
              )
              .join('\n\n')
          : '';
      if (strong.length === 0) {
        return { context: softCtx, ragSuccess: false, assertiveAllowed: false, citations: [] };
      }
      const citations = strong.slice(0, 3).map((h) => ({
        id: h.doc.id,
        title: h.doc.title,
        url: h.doc.metadata?.source_url || '',
        score: Math.round(h.score * 1000) / 1000,
      }));
      const context = strong
        .slice(0, 3)
        .map(
          (h, i) =>
            `[인용 #${i + 1}] ${h.doc.title}\n출처: ${h.doc.metadata?.source_url || '로컬스토어'}\n${h.doc.content.slice(0, 320)}`,
        )
        .join('\n\n');
      return { context, ragSuccess: true, assertiveAllowed: true, citations };
    })();
    return await Promise.race([
      work,
      new Promise<ChatRag>((resolve) => setTimeout(() => resolve(empty), RAG_TIMEOUT_MS)),
    ]);
  } catch {
    return empty;
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const messages = Array.isArray(body.messages)
    ? (body.messages as Array<{ role?: string; content?: string }>)
    : [];
  const temperature = typeof body.temperature === 'number' ? body.temperature : 0.7;
  const max_tokens = typeof body.max_tokens === 'number' ? body.max_tokens : 1000;

  const lastUser =
    [...messages].reverse().find((m) => m.role === 'user')?.content ||
    (typeof body.prompt === 'string' ? body.prompt : '') ||
    '';

  if (!lastUser && messages.length === 0) {
    return new Response(JSON.stringify({ error: 'messages or prompt required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const model = await resolveModel(typeof body.model === 'string' ? body.model : undefined);
  if (!model) {
    return new Response(JSON.stringify({ error: 'no model available' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const rag = await softRag(lastUser);
  const guard = rag.assertiveAllowed
    ? `[출처 가드]\n- assertiveAllowed=true. 아래 인용만 근거로 답하고, 답변 끝에 인용 제목을 명시하세요.\n\n[로컬 RAG 인용]\n${rag.context}`
    : `[출처 가드]\n- assertiveAllowed=false / ragSuccess=false.\n- 단정·확언·위협판정·수치 단언 금지.\n- 출처가 없으면 "관측/출처 없음"이라고만 말하고, 일반 설명·불확실성만 허용.\n- "확인됐다/실측/검증 완료" 같은 확언 표현 금지.\n${rag.context ? '\n[참고용 약한 검색(확언 근거 아님)]\n' + rag.context : ''}`;
  const domain = `[도메인]\n- 로컬 Ollama(${OLLAMA}) 모델 ${model}\n- 라벨/포트는 /api/local-ai/health 의 loadedModel·endpoints 기준\n${guard}`;

  let chatMessages = messages.length
    ? messages.map((m) => ({ role: m.role || 'user', content: m.content || '' }))
    : [{ role: 'user', content: lastUser }];

  if (chatMessages[0]?.role === 'system') {
    chatMessages[0] = { ...chatMessages[0], content: `${chatMessages[0].content}\n\n${domain}` };
  } else {
    chatMessages = [{ role: 'system', content: domain }, ...chatMessages];
  }
  chatMessages = withThinkingOsMessages(chatMessages);

  const started = Date.now();
  const encoder = new TextEncoder();
  let timeoutSoonSent = false;
  let firstToken = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => {
        controller.enqueue(sseEncode(obj, encoder));
      };
      send({ type: 'elapsed', elapsed: 0, model });
      send({
        type: 'rag',
        ragSuccess: rag.ragSuccess,
        assertiveAllowed: rag.assertiveAllowed,
        citations: rag.citations,
        elapsed: 0,
        model,
      });

      const tick = setInterval(() => {
        const elapsed = Date.now() - started;
        const payload: Record<string, unknown> = { type: 'elapsed', elapsed, model };
        if (!timeoutSoonSent && elapsed >= SOON_MS) {
          payload.timeoutSoon = true;
          timeoutSoonSent = true;
        }
        send(payload);
      }, 1000);

      const ctrl = new AbortController();
      const killer = setTimeout(() => ctrl.abort(), HARD_TIMEOUT_MS);

      try {
        let res = await fetch(`${OLLAMA}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: chatMessages,
            stream: true,
            think: false,
            options: { temperature, num_predict: max_tokens },
          }),
          signal: ctrl.signal,
        });
        let mode: 'chat' | 'generate' = 'chat';

        if (!res.ok || !res.body) {
          res = await fetch(`${OLLAMA}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model,
              prompt: lastUser,
              stream: true,
              think: false,
              options: { temperature, num_predict: max_tokens },
            }),
            signal: ctrl.signal,
          });
          mode = 'generate';
        }

        send({ type: 'upstream', mode, status: res.status, elapsed: Date.now() - started });
        if (!res.ok || !res.body) {
          send({
            type: 'error',
            message: `ollama ${mode} failed (${res.status})`,
            elapsed: Date.now() - started,
            timeoutSoon: true,
          });
          controller.close();
          return;
        }

        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.trim()) continue;
            let j: Record<string, unknown>;
            try {
              j = JSON.parse(line);
            } catch {
              continue;
            }
            const msg = j.message as { content?: string; thinking?: string } | undefined;
            const contentTok = msg?.content ?? (typeof j.response === 'string' ? j.response : '') ?? '';
            const thinkingTok = msg?.thinking ?? '';
            const token = contentTok || thinkingTok;
            const tokenKind = contentTok ? 'token' : 'thinking';
            if (token) {
              if (!firstToken) {
                firstToken = true;
                send({ type: 'first_token', elapsed: Date.now() - started, model, kind: tokenKind });
              }
              send({ type: tokenKind, token, elapsed: Date.now() - started });
            }
            if (j.done) send({ type: 'done', elapsed: Date.now() - started });
          }
        }
        send({
          type: 'end',
          elapsed: Date.now() - started,
          firstToken,
          model,
          ragSuccess: rag.ragSuccess,
          assertiveAllowed: rag.assertiveAllowed,
          citations: rag.citations,
        });
        controller.close();
      } catch (e: unknown) {
        const err = e as { name?: string; message?: string };
        send({
          type: 'error',
          message: err?.name === 'AbortError' ? 'timeout' : String(err?.message ?? e),
          elapsed: Date.now() - started,
          timeoutSoon: true,
        });
        controller.close();
      } finally {
        clearInterval(tick);
        clearTimeout(killer);
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
