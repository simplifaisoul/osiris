import type { GeolocationProvider, GeoResult } from './types';

const MODEL = 'claude-opus-4-8';
const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const TIMEOUT_MS = 20_000;

const SYSTEM_PROMPT = `You are OSIRIS GeoLocator, an expert image geolocation (photo forensics / GEOINT) analyst.
Given a single image, estimate WHERE ON EARTH it was most likely taken.

Method:
- Read every visual clue: written language and scripts on signage, alphabets, phone numbers, license-plate style, road markings and side of driving, architecture, building materials, utility poles, vegetation and climate, terrain, sun position/shadows, vehicle models, flags, business names.
- Cross-reference clues into a coherent hypothesis. Prefer the most specific location the evidence supports (city or district), but do not invent precision the image does not justify — widen to region/country when unsure and lower the confidence.
- Provide the single best guess plus up to 4 ranked alternatives.
- confidence is an integer 0-100. Be honest and calibrated: a generic interior with no clues should score low.
- clues must list the concrete observations you actually used.

If the user supplies extra context (country, source, period), weight it heavily but still verify it against the image.
Coordinates are decimal degrees: latitude in [-90, 90], longitude in [-180, 180]. Never leave them null — give your best approximate point.
Report your findings by calling the report_geolocation tool exactly once — do not respond with plain text.`;

const REPORT_TOOL = {
  name: 'report_geolocation',
  description: 'Report the geolocation analysis result for the provided image.',
  input_schema: {
    type: 'object',
    properties: {
      primary: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          country: { type: 'string' },
          latitude: { type: 'number' },
          longitude: { type: 'number' },
          confidence: { type: 'integer' },
          reasoning: { type: 'string' },
        },
        required: ['label', 'country', 'latitude', 'longitude', 'confidence', 'reasoning'],
      },
      candidates: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            country: { type: 'string' },
            latitude: { type: 'number' },
            longitude: { type: 'number' },
            confidence: { type: 'integer' },
          },
          required: ['label', 'country', 'latitude', 'longitude', 'confidence'],
        },
      },
      clues: { type: 'array', items: { type: 'string' } },
    },
    required: ['primary', 'candidates', 'clues'],
  },
};

interface ClaudeResponse {
  stop_reason?: string;
  content?: Array<{
    type: string;
    name?: string;
    input?: unknown;
  }>;
}

export const anthropicProvider: GeolocationProvider = {
  id: 'anthropic',
  name: 'Anthropic Claude',
  isConfigured: () => !!process.env.ANTHROPIC_API_KEY?.trim(),

  async geolocate(imageBase64: string, context: string, mode: 'fast' | 'precise'): Promise<GeoResult> {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      throw new Error('Claude not configured');
    }

    const userText = [
      context ? `Known context from the operator: "${context}".` : null,
      mode === 'precise' ? 'Take extra care: cross-reference every visible clue thoroughly before answering.' : null,
      'Analyze this image and geolocate it.',
    ].filter(Boolean).join(' ');

    const body = {
      model: MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
            { type: 'text', text: userText },
          ],
        },
      ],
      tools: [REPORT_TOOL],
      tool_choice: { type: 'tool', name: 'report_geolocation' },
    };

    const MAX_ATTEMPTS = 3;
    let res: Response | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch {
        // Network error or abort (timeout) — retryable.
        if (attempt === MAX_ATTEMPTS) {
          throw new Error('Could not reach Claude');
        }
        await new Promise((r) => setTimeout(r, 600 * attempt));
        continue;
      } finally {
        clearTimeout(timer);
      }

      if (res.ok) break;

      // Only 429/5xx are retryable. 400/401/403/404 are permanent — don't waste attempts.
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 700 * attempt));
        res = null;
        continue;
      }
      break;
    }

    if (!res) {
      throw new Error('Could not reach Claude');
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Claude request failed: ${res.status} ${detail.slice(0, 200)}`);
    }

    const payload = await res.json().catch(() => null) as ClaudeResponse | null;
    if (!payload) {
      throw new Error('Claude returned no usable output');
    }
    if (payload.stop_reason === 'refusal') {
      throw new Error('Claude declined this request');
    }
    if (payload.stop_reason === 'max_tokens') {
      throw new Error('Claude response was truncated before completing the analysis');
    }

    const toolBlock = payload.content?.find((b) => b.type === 'tool_use' && b.name === 'report_geolocation');
    if (!toolBlock || typeof toolBlock.input !== 'object' || toolBlock.input === null) {
      throw new Error('Claude did not return a structured geolocation result');
    }

    const data = toolBlock.input as GeoResult;
    if (!data.primary) {
      throw new Error('Claude returned no location');
    }

    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number(v) || 0));
    data.primary.latitude = clamp(data.primary.latitude, -90, 90);
    data.primary.longitude = clamp(data.primary.longitude, -180, 180);
    for (const c of data.candidates || []) {
      c.latitude = clamp(c.latitude, -90, 90);
      c.longitude = clamp(c.longitude, -180, 180);
    }

    return data;
  },
};
