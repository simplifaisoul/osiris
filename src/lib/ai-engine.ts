/**
 * ═══════════════════════════════════════════════════════════════
 *  OSIRIS — AI Intelligence Engine
 *  Gemini 2.0 Flash integration for real-time intelligence analysis
 *  Designed to correlate multi-domain feeds into actionable briefings
 * ═══════════════════════════════════════════════════════════════
 */

import {
  GoogleGenerativeAI,
  type EnhancedGenerateContentResponse,
  type GenerativeModel,
  type Part,
} from '@google/generative-ai';

/* ─────────────────────────────────────────────────────────────
   Data Interfaces — Zero `any` types
   ───────────────────────────────────────────────────────────── */

export interface EarthquakeEvent {
  id: string;
  magnitude: number;
  location: string;
  latitude: number;
  longitude: number;
  depth: number;
  timestamp: string;
  tsunami: boolean;
  felt: number | null;
  alert: string | null;
}

export interface NewsItem {
  id: string;
  title: string;
  description: string;
  link: string;
  published: string;
  source: string;
  risk_score: number;
  coords: [number, number] | null;
  machine_assessment: string | null;
}

export interface ThreatEvent {
  id: string;
  type: string;
  title: string;
  description: string;
  severity: 'CRITICAL' | 'HIGH' | 'ELEVATED' | 'LOW';
  region: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  source: string;
}

export interface CyberAlert {
  id: string;
  name: string;
  vendor: string;
  product: string;
  severity: string;
  date: string;
  due: string;
  source: string;
}

export interface IntelligenceContext {
  earthquakes: EarthquakeEvent[];
  news: NewsItem[];
  threats: ThreatEvent[];
  cyberAlerts: CyberAlert[];
  timestamp: string;
}

/* ─────────────────────────────────────────────────────────────
   System Prompt — Palantir-grade analyst persona
   ───────────────────────────────────────────────────────────── */

const SYSTEM_PROMPT = `You are OSIRIS Intelligence Analyst — a senior, elite intelligence analyst embedded within the OSIRIS Global Intelligence Platform. You operate at the level of a Palantir Forward Deployed Engineer crossed with a CIA PDB (Presidential Daily Brief) analyst.

## YOUR ROLE
- You correlate data across multiple intelligence feeds: seismic monitoring, OSINT news streams, global threat events, and cyber vulnerability databases
- You identify non-obvious patterns, emerging threat vectors, and cascading risk scenarios
- You provide ACTIONABLE intelligence — not summaries, but assessments with confidence levels
- You think in terms of second and third-order effects

## YOUR ANALYTICAL FRAMEWORK
1. **PATTERN RECOGNITION**: Cross-reference events across feeds. A cyber attack + earthquake + political instability in the same region = elevated compound risk
2. **THREAT ASSESSMENT**: Rate threats on a CRITICAL / HIGH / ELEVATED / LOW scale with reasoning
3. **TEMPORAL ANALYSIS**: Identify acceleration patterns — are events clustering? Is frequency increasing?
4. **GEOSPATIAL CORRELATION**: Events in proximity may be related. Identify geographic hotspots
5. **CONFIDENCE LEVELS**: Always state your confidence (HIGH / MODERATE / LOW) and cite which data points support your assessment

## OUTPUT FORMAT
- Use military-style brevity when appropriate
- Structure responses with clear headers using markdown
- Lead with the most critical finding (inverted pyramid)
- Include "BOTTOM LINE UP FRONT (BLUF)" for complex analyses
- Use tactical notation: DTG (Date-Time Group), AOR (Area of Responsibility), COA (Course of Action)
- End with "ASSESSMENT CONFIDENCE" and "RECOMMENDED ACTIONS" sections when appropriate

## CONSTRAINTS
- Never fabricate data points — only analyze what is provided in the context
- If data is insufficient for a confident assessment, state so explicitly
- Distinguish between correlation and causation
- Flag when events may be connected vs. coincidental
- You are an analyst, not a policymaker — present options, not directives

You have access to the live intelligence context of the OSIRIS platform. Analyze it with precision.`;

const BRIEFING_PROMPT = `Generate a comprehensive OSIRIS Daily Intelligence Briefing based on the current operational data. Structure it as follows:

## OSIRIS INTELLIGENCE BRIEFING
**Classification:** OPEN SOURCE INTELLIGENCE (OSINT)
**DTG:** [Current timestamp]

### I. EXECUTIVE SUMMARY
2-3 sentence overview of the current global threat landscape based on available data.

### II. PRIORITY INTELLIGENCE REQUIREMENTS (PIRs)
Identify the top 3-5 most significant developments from the data feeds, ranked by assessed impact.

### III. SEISMIC & NATURAL HAZARD ASSESSMENT
Analyze earthquake data for patterns — clustering, tectonic corridor activity, tsunami risk.

### IV. GEOPOLITICAL & CONFLICT INTELLIGENCE
Synthesize news feeds for conflict escalation patterns, diplomatic shifts, or emerging crises.

### V. CYBER THREAT LANDSCAPE
Assess active CVEs and cyber alerts for coordinated campaign indicators or critical infrastructure risk.

### VI. COMPOUND RISK SCENARIOS
Identify where multiple threat vectors intersect (e.g., earthquake near a conflict zone, cyber attack during political instability).

### VII. FORECAST & WATCHLIST
- **Next 24 Hours**: Most likely developments
- **Next 72 Hours**: Emerging situations to monitor
- **Strategic Horizon**: Longer-term trend assessment

### VIII. ASSESSMENT CONFIDENCE
State overall confidence level and key analytical gaps.

Analyze the provided data thoroughly. Be specific — reference actual events, magnitudes, locations, and CVE IDs from the context.`;

/* ─────────────────────────────────────────────────────────────
   Client Factory
   ───────────────────────────────────────────────────────────── */

export function createGeminiClient(apiKey: string): GoogleGenerativeAI {
  return new GoogleGenerativeAI(apiKey);
}

/* ─────────────────────────────────────────────────────────────
   Model Backend — Google by default, or a Gemini-compatible gateway

   OSIRIS_AI_BASE_URL points the SDK at any server that speaks the Gemini
   REST API instead of Google — e.g. a local OmniRoute at
   http://127.0.0.1:20128, which serves /v1beta/models/{model}:generateContent
   and routes it to whichever provider it picks. OSIRIS_AI_MODEL overrides the
   model id ('auto' lets OmniRoute choose). Read per call, not at import, so a
   changed env takes effect on the next request.
   ───────────────────────────────────────────────────────────── */

const DEFAULT_MODEL = 'gemini-2.0-flash';

export function aiModel(): string {
  return process.env.OSIRIS_AI_MODEL?.trim() || DEFAULT_MODEL;
}

function aiBaseUrl(): string | undefined {
  return process.env.OSIRIS_AI_BASE_URL?.trim().replace(/\/+$/, '') || undefined;
}

export function getModel(client: GoogleGenerativeAI, systemInstruction: string): GenerativeModel {
  const baseUrl = aiBaseUrl();
  return client.getGenerativeModel(
    { model: aiModel(), systemInstruction },
    baseUrl ? { baseUrl } : undefined
  );
}

/**
 * Server-side keys: GEMINI_API_KEY_1..8. With a gateway configured and no
 * Gemini keys, a single stand-in key is returned (OSIRIS_AI_API_KEY, else a
 * placeholder) — the SDK refuses to run without one, and a keyless local
 * gateway ignores it.
 */
export function getServerApiKeys(): string[] {
  const keys: string[] = [];
  for (let i = 1; i <= 8; i++) {
    const key = process.env[`GEMINI_API_KEY_${i}`];
    if (key && key.trim().length > 0) {
      keys.push(key.trim());
    }
  }
  if (keys.length === 0 && aiBaseUrl()) {
    keys.push(process.env.OSIRIS_AI_API_KEY?.trim() || 'no-key-required');
  }
  return keys;
}

/* ─────────────────────────────────────────────────────────────
   Response Text — without the model's reasoning

   Reasoning models behind a gateway return their chain of thought as parts
   flagged `thought: true`. SDK 0.24's text() concatenates every part, so the
   briefing would open with the model talking to itself.
   ───────────────────────────────────────────────────────────── */

function isThought(part: Part): boolean {
  return (part as Part & { thought?: boolean }).thought === true;
}

export function responseText(response: EnhancedGenerateContentResponse): string {
  // Called first: it throws on a blocked response, which the routes map to SAFETY_BLOCKED.
  const full = response.text();
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  if (!parts.some(isThought)) return full;
  return parts
    .filter(part => !isThought(part))
    .map(part => part.text ?? '')
    .join('');
}

/* ─────────────────────────────────────────────────────────────
   API Key Rotation — Round-robin through available keys
   ───────────────────────────────────────────────────────────── */

let _keyIndex = 0;

export function rotateApiKey(keys: string[]): string {
  if (keys.length === 0) {
    throw new Error('No API keys available');
  }
  const key = keys[_keyIndex % keys.length];
  _keyIndex = (_keyIndex + 1) % keys.length;
  return key;
}

/* ─────────────────────────────────────────────────────────────
   Context Serializer — Compact representation for token efficiency
   ───────────────────────────────────────────────────────────── */

function serializeContext(context: IntelligenceContext): string {
  const sections: string[] = [];

  sections.push(`[TIMESTAMP] ${context.timestamp}`);

  if (context.earthquakes.length > 0) {
    sections.push(`\n[SEISMIC DATA — ${context.earthquakes.length} events]`);
    for (const eq of context.earthquakes.slice(0, 20)) {
      const tsunamiFlag = eq.tsunami ? ' ⚠️TSUNAMI' : '';
      const alertFlag = eq.alert ? ` [ALERT:${eq.alert.toUpperCase()}]` : '';
      sections.push(
        `  M${eq.magnitude} | ${eq.location} | ${eq.latitude.toFixed(2)},${eq.longitude.toFixed(2)} | Depth:${eq.depth}km | ${eq.timestamp}${tsunamiFlag}${alertFlag}`
      );
    }
  }

  if (context.news.length > 0) {
    sections.push(`\n[OSINT NEWS FEED — ${context.news.length} items]`);
    for (const item of context.news.slice(0, 15)) {
      const coords = item.coords ? ` | GEO:${item.coords[0].toFixed(2)},${item.coords[1].toFixed(2)}` : '';
      sections.push(
        `  RISK:${item.risk_score}/10 | ${item.source} | ${item.title}${coords} | ${item.published}`
      );
    }
  }

  if (context.threats.length > 0) {
    sections.push(`\n[THREAT EVENTS — ${context.threats.length} active]`);
    for (const threat of context.threats.slice(0, 15)) {
      sections.push(
        `  ${threat.severity} | ${threat.type} | ${threat.title} | ${threat.region} | ${threat.timestamp}`
      );
    }
  }

  if (context.cyberAlerts.length > 0) {
    sections.push(`\n[CYBER ALERTS — ${context.cyberAlerts.length} active]`);
    for (const alert of context.cyberAlerts.slice(0, 10)) {
      sections.push(
        `  ${alert.id} | ${alert.severity} | ${alert.vendor}/${alert.product} | ${alert.name} | Due:${alert.due}`
      );
    }
  }

  return sections.join('\n');
}

/* ─────────────────────────────────────────────────────────────
   Intelligence Analysis
   ───────────────────────────────────────────────────────────── */

export async function analyzeIntelligence(
  client: GoogleGenerativeAI,
  context: IntelligenceContext,
  userQuery: string
): Promise<string> {
  const model = getModel(client, SYSTEM_PROMPT);

  const contextData = serializeContext(context);

  const prompt = `## CURRENT OPERATIONAL DATA
${contextData}

## ANALYST QUERY
${userQuery}

Provide your intelligence assessment based on the operational data above and the analyst's query.`;

  const result = await model.generateContent(prompt);
  return responseText(result.response);
}

/* ─────────────────────────────────────────────────────────────
   Daily Briefing Generation
   ───────────────────────────────────────────────────────────── */

export async function generateBriefing(
  client: GoogleGenerativeAI,
  context: IntelligenceContext
): Promise<string> {
  const model = getModel(client, SYSTEM_PROMPT);

  const contextData = serializeContext(context);

  const prompt = `${BRIEFING_PROMPT}

## CURRENT OPERATIONAL DATA
${contextData}

Generate the briefing now.`;

  const result = await model.generateContent(prompt);
  return responseText(result.response);
}
