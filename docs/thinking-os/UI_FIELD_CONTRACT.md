# UI_FIELD_CONTRACT — honesty / Thinking OS

## Judgment / verify
- judgmentSource: local_ai | rule
- aiSuccess / ai_success: boolean
- assertiveAllowed: boolean — true only with strong grounded citations
- ragSuccess: boolean
- ragCitations?: { id, title, url, score }[]
- confidence / confidence_score: number — without assertiveAllowed, ≤50
- iff / iff_verdict: without assertiveAllowed → SUSPECT
- verdict / ai_verdict: without sources → "관측/출처 없음…" muted path
- rule_verdict: rule-estimate copy only (never "실측")

## Chat SSE (/api/local-ai/chat)
- type: rag → { ragSuccess, assertiveAllowed, citations }
- type: token | thinking | elapsed | first_token | done | end | error
- end includes ragSuccess, assertiveAllowed, citations

## Briefing / analyze / overview
- briefingSource: gemini_cloud | local_ai
- provider (legacy): gemini → treat as cloud

## UI badges
- local_ai + aiSuccess → 로컬AI판정 (green)
- rule / !aiSuccess → 규칙판정 (amber)
- briefingSource=gemini_cloud → 클라우드 Gemini (amber/muted)
- !assertiveAllowed / !ragSuccess → muted 관측/출처 없음 only
