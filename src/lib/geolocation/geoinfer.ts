import type { GeolocationProvider, GeoResult, GeoCandidate } from './types';

const BASE_URL = 'https://api.geoinfer.com/v1';
// Fallback only — GeoInfer's own docs currently advertise "global_v0_1" as
// the default model id, but that string 500s with a server-side KeyError
// (confirmed by direct testing); the real deployed model was "global_v4_0"
// at verification time. Since GeoInfer can roll models forward, resolve the
// live default from GET /v1/prediction/models (unauthenticated, cached
// briefly below) instead of trusting a hardcoded id long-term.
const FALLBACK_MODEL_ID = 'global_v4_0';
const TIMEOUT_MS = 20_000;
const MODEL_CACHE_MS = 10 * 60_000;

interface GeoInferModel {
  id: string;
  enabled?: boolean;
  status?: string;
  access_level?: string;
}

interface GeoInferCluster {
  center: { latitude: number; longitude: number };
  location: { name?: string; admin1?: string; country_code?: string };
  radius_km: number;
}

interface GeoInferResponse {
  data?: {
    prediction?: {
      clusters?: GeoInferCluster[];
    };
    model_id?: string;
  };
}

let modelCache: { id: string; fetchedAt: number } | null = null;

async function resolveModelId(): Promise<string> {
  if (modelCache && Date.now() - modelCache.fetchedAt < MODEL_CACHE_MS) {
    return modelCache.id;
  }
  try {
    const res = await fetch(`${BASE_URL}/prediction/models`);
    if (!res.ok) return FALLBACK_MODEL_ID;
    const payload = await res.json().catch(() => null) as { data?: GeoInferModel[] } | null;
    const model = payload?.data?.find((m) => m.enabled !== false && m.status === 'ready' && m.access_level === 'public');
    const id = model?.id || FALLBACK_MODEL_ID;
    modelCache = { id, fetchedAt: Date.now() };
    return id;
  } catch {
    return FALLBACK_MODEL_ID;
  }
}

// GeoInfer is a pure ML image-clustering model — it returns ranked location
// clusters with an uncertainty radius, not a probability. We synthesize a
// confidence score from that radius (tighter cluster = higher confidence);
// this is a heuristic, not a real statistical probability.
function confidenceFromRadius(radiusKm: number): number {
  return Math.round(Math.max(5, Math.min(95, 100 - radiusKm * 2)));
}

function clusterLabel(c: GeoInferCluster): string {
  const place = c.location?.name;
  const region = c.location?.admin1 || c.location?.country_code;
  if (place && region) return `${place}, ${region}`;
  return place || region || 'Unknown location';
}

function clusterToCandidate(c: GeoInferCluster): GeoCandidate {
  return {
    label: clusterLabel(c),
    country: c.location?.country_code || 'N/A',
    latitude: c.center?.latitude ?? 0,
    longitude: c.center?.longitude ?? 0,
    confidence: confidenceFromRadius(c.radius_km ?? 50),
  };
}

export const geoinferProvider: GeolocationProvider = {
  id: 'geoinfer',
  name: 'GeoInfer',
  isConfigured: () => !!process.env.GEOINFER_API_KEY?.trim(),

  async geolocate(imageBase64: string, context: string, mode: 'fast' | 'precise'): Promise<GeoResult> {
    const apiKey = process.env.GEOINFER_API_KEY?.trim();
    if (!apiKey) {
      throw new Error('GeoInfer not configured');
    }

    // GeoInfer has no fast/precise dial of its own — map mode to how many
    // ranked clusters we ask it to return.
    const topN = mode === 'precise' ? 10 : 5;
    const modelId = await resolveModelId();
    const url = `${BASE_URL}/prediction/predict?top_n=${topN}&model_id=${modelId}`;

    // GeoInfer's optional `meta` field is a structured object (country/states/
    // name/filename), not freeform text — our operator `context` string doesn't
    // map cleanly onto it, so we intentionally omit it rather than stuff
    // mismatched data into a field the model expects to be reliable.
    void context;

    const form = new FormData();
    const bytes = Buffer.from(imageBase64, 'base64');
    form.append('file', new Blob([bytes], { type: 'image/jpeg' }), 'image.jpg');

    const MAX_ATTEMPTS = 3;
    let res: Response | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'X-GeoInfer-Key': apiKey },
          body: form,
          signal: controller.signal,
        });
      } catch {
        if (attempt === MAX_ATTEMPTS) {
          throw new Error('Could not reach GeoInfer');
        }
        await new Promise((r) => setTimeout(r, 600 * attempt));
        continue;
      } finally {
        clearTimeout(timer);
      }

      if (res.ok) break;
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 700 * attempt));
        res = null;
        continue;
      }
      break;
    }

    if (!res) {
      throw new Error('Could not reach GeoInfer');
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`GeoInfer request failed: ${res.status} ${detail.slice(0, 200)}`);
    }

    const payload = await res.json().catch(() => null) as GeoInferResponse | null;
    const clusters = payload?.data?.prediction?.clusters || [];
    if (clusters.length === 0) {
      throw new Error('GeoInfer returned no location clusters');
    }

    const resultModelId = payload?.data?.model_id || modelId;
    const [top, ...rest] = clusters;

    return {
      primary: {
        ...clusterToCandidate(top),
        reasoning: `GeoInfer model ${resultModelId} — top cluster "${clusterLabel(top)}" with an estimated radius of ~${(top.radius_km ?? 0).toFixed(1)} km.`,
      },
      candidates: rest.map(clusterToCandidate),
      clues: [
        'GeoInfer is a machine-learning image-clustering model; it does not produce textual visual clues like the LLM-based providers.',
      ],
    };
  },
};
