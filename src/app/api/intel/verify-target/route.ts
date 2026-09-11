import { NextRequest, NextResponse } from 'next/server';
import { searchTacticalKnowledge, loadVectorStore } from '@/lib/local-rag-engine';

// 인메모리 검증 캐시 (ICAO24 또는 Callsign 기준 60초 TTL)
interface CacheEntry {
  data: any;
  timestamp: number;
}
const verificationCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 1000;

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  try {
    const body = await req.json();
    const payload = (body.target_data || body) as any;
    const target_type = body.target_domain || body.target_type || payload.target_type || payload.domain || 'flight';
    const callsign = payload.callsign || body.callsign || '';
    const name = payload.name || body.name || '';
    const model = payload.model || body.model || '';
    const icao24 = payload.icao24 || body.icao24 || payload.id || body.target_id || '';
    const mmsi = payload.mmsi || body.mmsi || '';
    const country = payload.country || body.country || '';
    const coords = payload.coords || body.coords || [];
    const flag = payload.flag || body.flag || '';
    const risk_level = payload.risk_level || body.risk_level || '';

    const targetIdentifier = icao24 || mmsi || callsign || name || 'UNKNOWN_TARGET';
    const targetName = name || callsign || model || '전술 표적';
    const cacheKey = `${target_type}:${targetIdentifier}`.toUpperCase();
    const cached = verificationCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
      return NextResponse.json({
        ...cached.data,
        cached: true,
        inference_time_ms: Date.now() - startTime
      });
    }

    const tUpper = targetName.toUpperCase();
    let preliminaryIff: 'HOSTILE' | 'FRIENDLY' | 'CIVILIAN' | 'SUSPECT' = 'CIVILIAN';
    let domainSpecificRuleVerdict = '';

    // 1. 도메인별 규칙 기반 1차 식별 (Rule-Based Pre-filter)
    if (target_type === 'maritime') {
      const isSuspectVessel = tUpper.includes('SUSPECT') || tUpper.includes('ENAV-SUSPECT') || tUpper.includes('미송출') || tUpper.includes('공작선') || risk_level === 'CRITICAL';
      const isNavalWarship = tUpper.includes('해군') || tUpper.includes('함') || tUpper.includes('PKG') || tUpper.includes('FFG') || tUpper.includes('DDG') || body.type === 'military';
      const isUSNavy = tUpper.includes('USN') || tUpper.includes('USS') || tUpper.includes('미 해군');

      if (isSuspectVessel) {
        preliminaryIff = 'HOSTILE';
        domainSpecificRuleVerdict = `[해양 규칙추정] 서해 NLL AIS 미송출 및 무단 침투 의심선박 (${targetName}). 해상 경계 침범 CRITICAL 위협으로 HOSTILE 규정.`;
      } else if (isNavalWarship || isUSNavy) {
        preliminaryIff = 'FRIENDLY';
        domainSpecificRuleVerdict = `[해군 규칙추정] 대한민국 해군/연합 해군 전투함 (${targetName}). 작전 인가 완료된 FRIENDLY 우방 함정.`;
      } else {
        preliminaryIff = 'CIVILIAN';
        domainSpecificRuleVerdict = `[해운 규칙추정] 해수부 e-Nav/PORT-MIS 등록 정상 운항 민간 상선/어선 (${targetName}).`;
      }
    } else if (target_type === 'drone') {
      const isDPRKDrone = country === '북한' || tUpper.includes('북한') || tUpper.includes('방현') || tUpper.includes('샛별') || tUpper.includes('침투') || model.includes('방현');
      if (isDPRKDrone) {
        preliminaryIff = 'HOSTILE';
        domainSpecificRuleVerdict = `[C-UAS 규칙추정] 북한 무인기 (${targetName}) 군사분계선 무단 침범 비행. 즉각 대응 대상 HOSTILE 표적.`;
      } else {
        preliminaryIff = 'FRIENDLY';
        domainSpecificRuleVerdict = `[C-UAS 규칙추정] 아군 및 승인 공역 감시 무인기 (${targetName}). 비행 인가 FRIENDLY 표적.`;
      }
    } else {
      // 항공기 (Flight)
      const isDPRK = country === '북한' || tUpper.includes('북한') || tUpper.includes('조선인민군') || icao24.startsWith('720') || tUpper.includes('MI-24') || tUpper.includes('MIG');
      const isChina = country === '중국' || tUpper.includes('중국') || tUpper.includes('PLAAF') || icao24.startsWith('730');
      const isRussia = country === '러시아' || tUpper.includes('러시아') || tUpper.includes('VKS') || icao24.startsWith('740');
      const isROK = !isDPRK && (country === '대한민국' || tUpper.includes('대한민국 공군') || tUpper.includes('ROKAF') || icao24.startsWith('71002'));
      const isUS = !isDPRK && (country === '미국' || tUpper.includes('USAF') || tUpper.includes('USMC') || tUpper.includes('US NAVY'));

      if (isDPRK) {
        preliminaryIff = 'HOSTILE';
        domainSpecificRuleVerdict = `[공역 규칙추정] 북한 조선인민군 공군 소속 ${model || targetName}. 전방 기동 침투 경계 표적으로 HOSTILE 규정.`;
      } else if (isChina || isRussia) {
        preliminaryIff = 'SUSPECT';
        domainSpecificRuleVerdict = `[KADIZ 규칙추정] ${country || '중·러'} 군용기 (${targetName}). 방공식별구역 접근 SUSPECT 표적.`;
      } else if (isROK || isUS) {
        preliminaryIff = 'FRIENDLY';
        domainSpecificRuleVerdict = `[피아식별 규칙추정] 한미연합 공역 인가 및 Mode-5 인증 FRIENDLY 아군 전력 (${targetName}).`;
      } else {
        preliminaryIff = 'CIVILIAN';
        domainSpecificRuleVerdict = `[ICAO 규칙추정] ICAO 등록 표준 민간 여객기 (${targetName}). 정규 항로 비행 CIVILIAN 표적.`;
      }
    }

    // 2a. Local RAG retrieval — soft hits may enrich prompt; assertive only on strong citations
    let ragSuccess = false;
    let ragCitations: Array<{ id: string; title: string; url: string; score?: number }> = [];
    let ragContext = '';
    const RAG_SOFT = 0.42;
    const RAG_STRONG = 0.58; // below this = noise, not grounds for assertive UI
    try {
      const q = `${targetName} ${model || ''} ${country || flag || ''} ${target_type}`.trim();
      const hits = await searchTacticalKnowledge(q, 5, RAG_SOFT);
      // Grounding requires the full target name (or a long token >=4) in title/content.
      // Short fragments like "civ"/"test" must not unlock assertive claims.
      const needle = String(targetName || '').trim().toLowerCase();
      const nameTokens = needle
        .split(/[\s\-/_,.]+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 4);
      const grounded = (title: string, content: string) => {
        const blob = `${title} ${content}`.toLowerCase();
        if (needle.length >= 2 && blob.includes(needle)) return true;
        return nameTokens.some((tok) => blob.includes(tok));
      };
      // Vector strong: high score + lexical grounding (blocks unrelated NK noise)
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
      let strong = hits.filter(
        (h) => !isProtocolDoc(h.doc) && h.score >= RAG_STRONG && grounded(h.doc.title, h.doc.content),
      );
      // Lexical fallback: only exact full-name substring (embedding miss on KO names)
      if (strong.length === 0 && needle.length >= 2) {
        const store = loadVectorStore();
        strong = store
          .filter((doc) => {
            if (isProtocolDoc(doc)) return false;
            const blob = `${doc.title} ${doc.content}`.toLowerCase();
            return blob.includes(needle);
          })
          .slice(0, 3)
          .map((doc) => ({ doc, score: 1 }));
      }
      // Prompt may use soft hits; UI assertive gate uses grounded citations only
      if (hits.length > 0) {
        ragContext = hits
          .slice(0, 3)
          .map((h, i) => `[RAG#${i + 1} score=${(Math.round(h.score * 1000) / 1000)} ${h.doc.title}] ${h.doc.content.slice(0, 280)}`)
          .join('\n');
      }
      if (strong.length > 0) {
        ragSuccess = true;
        ragCitations = strong.slice(0, 3).map((h) => ({
          id: h.doc.id,
          title: h.doc.title,
          url: h.doc.metadata?.source_url || '',
          score: Math.round(h.score * 1000) / 1000,
        }));
      }
    } catch (e: any) {
      console.warn('[VerifyTarget] RAG retrieval failed:', e?.message || e);
      ragSuccess = false;
      ragCitations = [];
    }

    // 2. 로컬 Ollama Qwen3-14B-OSIRIS 온디바이스 실시간 추론
    const prompt = `[OSIRIS ${target_type.toUpperCase()} 전술 검증 질의]
표적명칭: ${targetName}
기종/선종: ${model || '미확인'}
식별번호: ${targetIdentifier}
주장소속: ${country || flag || '미상'}
좌표: ${coords.length === 2 ? `${coords[1]}N, ${coords[0]}E` : '미상'}
${ragSuccess && ragContext ? `\n[로컬 RAG 인출 팩트]\n${ragContext}\n` : ''}
규칙:
1. 피아식별: FRIENDLY(아군), HOSTILE(적성/위협), SUSPECT(주의), CIVILIAN(민간) 중 택일.
2. 2문장 이내의 수석 전술 작전관 판정 요약을 작성하라.
3. RAG 팩트가 있으면 근거로만 쓰고, 없으면 추측하지 마라.`;

    let aiVerdict = '';
    let usedModel = 'qwen3:14b-osiris';
    let aiSuccess = false;
    let source: 'ollama' | 'rule_fallback' = 'rule_fallback';
    let fallbackReason: string | null = null;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s — cold load 허용

      const ollamaRes = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'qwen3:14b-osiris',
          prompt: prompt,
          stream: false,
          think: false,
          options: {
            temperature: 0.1,
            num_ctx: 2048,
            num_predict: 128,
          }
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (ollamaRes.ok) {
        const data = await ollamaRes.json();
        aiVerdict = (data.response || '').trim();
        aiVerdict = aiVerdict.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        if (aiVerdict) {
          aiSuccess = true;
          source = 'ollama';
        } else {
          fallbackReason = 'empty_ollama_response';
        }
      } else {
        fallbackReason = `ollama_http_${ollamaRes.status}`;
      }
    } catch (e: any) {
      fallbackReason = e?.name === 'AbortError' ? 'ollama_timeout' : (e?.message || 'ollama_error');
      console.warn(`[VerifyTarget] Local AI inference fallback for ${targetIdentifier}:`, fallbackReason);
    }

    if (!aiSuccess || !aiVerdict) {
      aiVerdict = domainSpecificRuleVerdict;
      source = 'rule_fallback';
      usedModel = 'rule-engine';
    }

    // 최종 IFF 보정
    let finalIff = preliminaryIff;
    if (aiVerdict.includes('HOSTILE') || aiVerdict.includes('적성') || preliminaryIff === 'HOSTILE') finalIff = 'HOSTILE';
    else if (aiVerdict.includes('FRIENDLY') || aiVerdict.includes('아군')) finalIff = 'FRIENDLY';
    else if (aiVerdict.includes('SUSPECT') || aiVerdict.includes('주의')) finalIff = 'SUSPECT';

    const threatLevel = finalIff === 'HOSTILE' ? 'CRITICAL' : finalIff === 'SUSPECT' ? 'HIGH' : 'LOW';
    let confidence = source === 'ollama'
      ? (finalIff === 'HOSTILE' ? 88 : 82)
      : (finalIff === 'HOSTILE' ? 62 : 55);
    const judgmentSource = source === 'ollama' ? 'local_ai' : 'rule';
    // Anti-hallucination: without RAG citations, no assertive packaging / high confidence
    const assertiveAllowed = ragSuccess === true;
    let verdictOut = aiVerdict;
    if (!assertiveAllowed) {
      confidence = Math.min(confidence, 50);
      verdictOut = '관측/출처 없음 — 단정 판정 보류. 규칙·모델 출력은 참고용이며 확언으로 사용하지 마세요.';
    }
    const result = {
      status: 'success',
      verified: source === 'ollama' && assertiveAllowed,
      model: usedModel,
      source,
      judgmentSource, // design contract: local_ai | rule
      ai_success: aiSuccess,
      aiSuccess, // design contract camelCase
      fallback_reason: fallbackReason,
      rule_verdict: domainSpecificRuleVerdict,
      ragSuccess,
      assertiveAllowed,
      ...(ragSuccess ? { ragCitations } : {}),
      target_type,
      target: targetName,
      identifier: targetIdentifier,
      iff: assertiveAllowed ? finalIff : 'SUSPECT',
      iff_verdict: assertiveAllowed ? finalIff : 'SUSPECT',
      verdict: verdictOut,
      ai_verdict: assertiveAllowed ? aiVerdict : verdictOut,
      threat_level: assertiveAllowed ? threatLevel : 'LOW',
      confidence,
      confidence_score: confidence,
      inference_time_ms: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };

        if (cacheKey) {
      verificationCache.set(cacheKey, { data: result, timestamp: Date.now() });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({
      status: 'error',
      message: error.message,
      inference_time_ms: Date.now() - startTime
    }, { status: 500 });
  }
}
