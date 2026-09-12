/**
 * Judgment badge helpers — UI field contract (verify / socratic).
 * Canonical: aiSuccess (bool), judgmentSource local_ai|rule
 * Legacy: ai_success; source=ollama→local_ai; rule_fallback|rules_only→rule; ollama+rules→local_ai
 */

export type JudgmentSource = 'local_ai' | 'rule';

export interface JudgmentMeta {
  aiSuccess: boolean | undefined;
  judgmentSource: JudgmentSource | undefined;
  trustedLocalAi: boolean;
  badgeLabel: '로컬AI판정' | '규칙판정';
  helperCopy: string;
  amber: boolean;
  confidence: number | string | undefined;
}

export function normalizeJudgmentFields(res: any): JudgmentMeta {
  const aiSuccess =
    typeof res?.aiSuccess === 'boolean'
      ? res.aiSuccess
      : typeof res?.ai_success === 'boolean'
        ? res.ai_success
        : undefined;

  let judgmentSource: JudgmentSource | undefined =
    res?.judgmentSource === 'local_ai' || res?.judgmentSource === 'rule'
      ? res.judgmentSource
      : undefined;

  if (!judgmentSource && res?.source != null) {
    const s = String(res.source);
    if (s === 'ollama' || s === 'ollama+rules') judgmentSource = 'local_ai';
    else if (s === 'rule_fallback' || s === 'rules_only' || s === 'rule') judgmentSource = 'rule';
  }

  // Contract:
  // 1) local_ai && aiSuccess → 로컬AI판정 (trusted)
  // 2) rule OR !aiSuccess → 규칙판정 + amber
  // 3) unknown fallback → amber 규칙판정
  const trustedLocalAi = judgmentSource === 'local_ai' && aiSuccess === true;
  const amber = !trustedLocalAi;

  return {
    aiSuccess,
    judgmentSource,
    trustedLocalAi,
    badgeLabel: trustedLocalAi ? '로컬AI판정' : '규칙판정',
    helperCopy: trustedLocalAi ? '로컬 AI 응답 반영' : '규칙 엔진 추정 · AI 미응답',
    amber,
    confidence: res?.confidence ?? res?.confidence_score,
  };
}

export function judgmentBadgeStyle(amber: boolean): {
  color: string;
  background: string;
  border: string;
} {
  if (amber) {
    return {
      color: '#FFB300',
      background: 'rgba(255,179,0,0.18)',
      border: '1px solid rgba(255,179,0,0.45)',
    };
  }
  return {
    color: '#76FF03',
    background: 'rgba(118,255,3,0.15)',
    border: '1px solid rgba(118,255,3,0.35)',
  };
}

/* ─────────────────────────────────────────────────────────────
   Briefing / analyze / overview source badge
   Contract: gemini_cloud | legacy provider=gemini → 클라우드 Gemini (amber/muted)
             local_ai → 로컬AI판정 (green local-AI style)
   ───────────────────────────────────────────────────────────── */

export type BriefingSource = 'gemini_cloud' | 'local_ai';

export interface BriefingSourceMeta {
  briefingSource: BriefingSource | undefined;
  /** Exact badge copy, or null when no source to show */
  badgeLabel: '클라우드 Gemini' | '로컬AI판정' | null;
  /** true → amber/muted (cloud Gemini); false → green local-AI judgment style */
  amber: boolean;
  show: boolean;
}

export function normalizeBriefingSourceFields(res: any): BriefingSourceMeta {
  let briefingSource: BriefingSource | undefined =
    res?.briefingSource === 'gemini_cloud' || res?.briefingSource === 'local_ai'
      ? res.briefingSource
      : undefined;

  if (!briefingSource && res?.provider != null) {
    const p = String(res.provider);
    if (p === 'gemini') briefingSource = 'gemini_cloud';
    else if (p === 'local_ai') briefingSource = 'local_ai';
  }

  if (briefingSource === 'gemini_cloud') {
    return {
      briefingSource,
      badgeLabel: '클라우드 Gemini',
      amber: true,
      show: true,
    };
  }
  if (briefingSource === 'local_ai') {
    return {
      briefingSource,
      badgeLabel: '로컬AI판정',
      amber: false,
      show: true,
    };
  }
  return { briefingSource: undefined, badgeLabel: null, amber: true, show: false };
}

/** Reuse judgment amber/green palette; cloud Gemini stays amber (never green). */
export function briefingSourceBadgeStyle(amber: boolean): {
  color: string;
  background: string;
  border: string;
} {
  return judgmentBadgeStyle(amber);
}



/** Apply badge styles to a DOM element and set exact contract label. */
export function applyJudgmentBadgeEl(el: HTMLElement | null | undefined, res: any): JudgmentMeta {
  const j = normalizeJudgmentFields(res);
  if (!el) return j;
  const st = judgmentBadgeStyle(j.amber);
  el.style.color = st.color;
  el.style.background = st.background;
  el.style.border = st.border;
  el.style.padding = el.style.padding || '1px 4px';
  el.style.borderRadius = el.style.borderRadius || '2px';
  el.style.fontFamily = 'monospace';
  el.style.fontSize = el.style.fontSize || '8px';
  el.style.fontWeight = 'bold';
  el.textContent = j.badgeLabel;
  return j;
}

export interface RagCitation {
  id?: string;
  title?: string;
  url?: string;
}

export interface RagUiMeta {
  ragSuccess: boolean;
  citations: RagCitation[];
  showChips: boolean;
  mutedLabel: 'RAG 미연동·만료';
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeHttpUrl(url: unknown): string | undefined {
  if (url == null) return undefined;
  const raw = String(url).trim();
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.href;
  } catch {
    /* ignore */
  }
  return undefined;
}

/** RAG UI contract: chips only when ragSuccess && citations; else muted (never amber). */
export function normalizeRagFields(res: any): RagUiMeta {
  const ragSuccess = res?.ragSuccess === true;
  const raw = Array.isArray(res?.ragCitations) ? res.ragCitations : [];
  const citations: RagCitation[] = raw
    .filter((c: any) => c && (c.title || c.url || c.id))
    .slice(0, 3)
    .map((c: any) => ({
      id: c.id != null ? String(c.id) : undefined,
      title: c.title != null ? String(c.title) : undefined,
      url: safeHttpUrl(c.url),
    }));
  return {
    ragSuccess,
    citations,
    showChips: ragSuccess && citations.length > 0,
    mutedLabel: 'RAG 미연동·만료',
  };
}

const RAG_CHIP_STYLE =
  "display:inline-block;margin:1px 3px 1px 0;padding:1px 5px;border-radius:3px;font-size:7.5px;font-family:monospace;color:#90CAF9;background:rgba(144,202,249,0.12);border:1px solid rgba(144,202,249,0.35);text-decoration:none;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:middle;";

/** HTML for citation chips (≤3) or muted “RAG 미연동·만료”. Amber reserved for judgment badge only. */
export function renderRagUiHtml(res: any): string {
  const r = normalizeRagFields(res);
  if (r.showChips) {
    const chips = r.citations
      .map((c) => {
        const label = escHtml(c.title || c.id || 'citation');
        if (c.url) {
          return `<a href="${escHtml(c.url)}" target="_blank" rel="noopener noreferrer" style="${RAG_CHIP_STYLE}" title="${label}">${label}</a>`;
        }
        return `<span style="${RAG_CHIP_STYLE}" title="${label}">${label}</span>`;
      })
      .join('');
    return `<div style="margin-top:4px;line-height:1.6;">${chips}</div>`;
  }
  return `<div style="margin-top:3px;color:#6B7280;font-size:7.5px;font-family:monospace;">RAG 미연동·만료</div>`;
}


/** Exact muted copy when assertive packaging is not allowed. */
export const NO_ASSERTIVE_OBSERVATION_COPY = '관측/출처 없음';

export interface AssertiveUiMeta {
  assertiveAllowed: boolean | undefined;
  ragSuccess: boolean;
  sourcesPresent: boolean;
  /** true only when assertiveAllowed===true AND ragSuccess AND citations present */
  showAssertive: boolean;
}

/**
 * Anti-hallucination gate for verify-target UI.
 * Hide assertive verdict / high confidence when assertiveAllowed===false
 * OR ragSuccess===false/missing; require sources for assertive display.
 */
export function normalizeAssertiveFields(res: any): AssertiveUiMeta {
  const rag = normalizeRagFields(res);
  const assertiveAllowed =
    typeof res?.assertiveAllowed === 'boolean' ? res.assertiveAllowed : undefined;
  const sourcesPresent = rag.citations.length > 0;
  const showAssertive =
    assertiveAllowed === true && rag.ragSuccess === true && sourcesPresent;
  return {
    assertiveAllowed,
    ragSuccess: rag.ragSuccess,
    sourcesPresent,
    showAssertive,
  };
}

export function canShowAssertiveVerdict(res: any): boolean {
  return normalizeAssertiveFields(res).showAssertive;
}

/**
 * Verify-target content HTML (flight/drone/ship).
 * Non-assertive: only muted “관측/출처 없음” (no verdict / IFF / high confidence).
 * Assertive: meta + IFF + verdict + RAG chips as API provides.
 * Judgment badge is applied separately via applyJudgmentBadgeEl (amber for rule stays).
 */
export function renderVerifyTargetContentHtml(
  res: any,
  htmlEsc: (s: any) => string,
  judgment?: JudgmentMeta
): string {
  const a = normalizeAssertiveFields(res);
  if (!a.showAssertive) {
    return `<div style="color:#6B7280;font-size:8.5px;font-family:monospace;">${NO_ASSERTIVE_OBSERVATION_COPY}</div>`;
  }
  const j = judgment ?? normalizeJudgmentFields(res);
  const iff = res?.iff != null ? String(res.iff) : '';
  const iffColor =
    iff === 'HOSTILE'
      ? '#FF1744'
      : iff === 'FRIENDLY'
        ? '#76FF03'
        : iff === 'SUSPECT'
          ? '#FF9100'
          : '#00E5FF';
  const conf = j.confidence != null ? ` · 신뢰도 ${htmlEsc(j.confidence)}` : '';
  const meta = `${htmlEsc(j.helperCopy)}${conf}${res?.cached ? ' · CACHE' : ''}${
    res?.inference_time_ms != null ? ` · ${res.inference_time_ms}ms` : ''
  }`;
  const verdict = res?.verdict != null ? String(res.verdict) : '';
  return `<div style="color:#8A8880;font-size:8px;margin-bottom:2px;">${meta}</div><span style="color:${iffColor};font-weight:bold;">[${htmlEsc(iff)}]</span> ${htmlEsc(verdict)}${renderRagUiHtml(res)}`;
}

/**
 * News machine_assessment: never invent fallback AI copy when null/missing/empty.
 */
export function safeMachineAssessment(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}
