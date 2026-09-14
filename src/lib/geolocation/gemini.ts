import type { GeolocationProvider, GeoResult } from './types';

const MODEL = 'gemini-flash-latest';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const TIMEOUT_MS = 20_000;

const GEO_SCHEMA = {
  type: 'OBJECT',
  properties: {
    primary: {
      type: 'OBJECT',
      properties: {
        label: { type: 'STRING' },
        country: { type: 'STRING' },
        latitude: { type: 'NUMBER' },
        longitude: { type: 'NUMBER' },
        confidence: { type: 'INTEGER' },
        reasoning: { type: 'STRING' },
      },
      required: ['label', 'country', 'latitude', 'longitude', 'confidence', 'reasoning'],
    },
    candidates: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          label: { type: 'STRING' },
          country: { type: 'STRING' },
          latitude: { type: 'NUMBER' },
          longitude: { type: 'NUMBER' },
          confidence: { type: 'INTEGER' },
        },
        required: ['label', 'country', 'latitude', 'longitude', 'confidence'],
      },
    },
    clues: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['primary', 'candidates', 'clues'],
};

const SYSTEM_PROMPT = `You are OSIRIS GeoLocator, an expert image geolocation (photo forensics / GEOINT) analyst.
Given a single image, estimate WHERE ON EARTH it was most likely taken.

Method:
- Read every visual clue: written language and scripts on signage, alphabets, phone numbers, license-plate style, road markings and side of driving, architecture, building materials, utility poles, vegetation and climate, terrain, sun position/shadows, vehicle models, flags, business names.
- Cross-reference clues into a coherent hypothesis. Prefer the most specific location the evidence supports (city or district), but do not invent precision the image does not justify — widen to region/country when unsure and lower the confidence.
- Provide the single best guess in "primary" with approximate decimal-degree coordinates, plus up to 4 ranked alternatives in "candidates".
- confidence is an integer 0-100. Be honest and calibrated: a generic interior with no clues should score low.
- "clues" must list the concrete observations you actually used.

If the user supplies extra context (country, source, period), weight it heavily but still verify it against the image.
Coordinates are decimal degrees: latitude in [-90, 90], longitude in [-180, 180]. Never leave them null — give your best approximate point.`;

export const geminiProvider: GeolocationProvider = {
  id: 'gemini',
  name: 'Google Gemini',
  isConfigured: () => !!process.env.GEMINI_API_KEY?.trim(),

  async geolocate(imageBase64: string, context: string, mode: 'fast' | 'precise'): Promise<GeoResult> {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error('Gemini not configured');
    }

    const userText = context
      ? `Analyze this image and geolocate it. Known context from the operator: "${context}".`
      : 'Analyze this image and geolocate it.';

    const body = {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [
        {
          role: 'user',
          parts: [
            { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } },
            { text: userText },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: GEO_SCHEMA,
        temperature: mode === 'precise' ? 0.15 : 0.4,
        maxOutputTokens: 8192,
      },
    };

    const MAX_ATTEMPTS = 4;
    const isRegion = (s: string) => /location is not supported/i.test(s);
    let res: Response | null = null;
    let lastDetail = '';

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-goog-api-key': apiKey },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch {
        // Network error or abort (timeout) — retryable.
        if (attempt === MAX_ATTEMPTS) {
          throw new Error('Could not reach Gemini');
        }
        await new Promise((r) => setTimeout(r, 600 * attempt));
        continue;
      } finally {
        clearTimeout(timer);
      }
      if (res.ok) break;
      lastDetail = await res.text().catch(() => '');
      const transient = res.status === 429 || (res.status === 400 && isRegion(lastDetail));
      if (transient && attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 700 * attempt));
        res = null;
        continue;
      }
      break;
    }

    if (!res || !res.ok) {
      throw new Error('Gemini request failed');
    }

    const payload = await res.json().catch(() => null) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
      promptFeedback?: { blockReason?: string };
    } | null;

    if (payload?.promptFeedback?.blockReason) {
      throw new Error('Model declined');
    }

    const cand = payload?.candidates?.[0];
    const text = cand?.content?.parts?.map((p) => p.text || '').join('') || '';
    if (!text) {
      throw new Error('No model output');
    }

    let data: GeoResult;
    try {
      data = JSON.parse(text) as GeoResult;
    } catch {
      throw new Error('Gemini returned malformed JSON');
    }
    if (!data.primary) {
      throw new Error('Gemini returned no location');
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
