import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  analyzeIntelligence,
  createGeminiClient,
  getServerApiKeys,
  type IntelligenceContext,
} from './ai-engine';

/**
 * The engine can run against Google or any Gemini-compatible gateway (e.g. a
 * local OmniRoute). These tests stub fetch and assert on what the real SDK
 * sends, so they cover the SDK's own URL building rather than a mock of it.
 */

const CONTEXT: IntelligenceContext = {
  earthquakes: [],
  news: [],
  threats: [],
  cyberAlerts: [],
  timestamp: '2026-09-11T00:00:00Z',
};

function geminiReply(parts: Array<{ text: string; thought?: boolean }>) {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { role: 'model', parts }, finishReason: 'STOP', index: 0 }],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

function clearAiEnv() {
  for (let i = 1; i <= 8; i++) vi.stubEnv(`GEMINI_API_KEY_${i}`, '');
  vi.stubEnv('OSIRIS_AI_BASE_URL', '');
  vi.stubEnv('OSIRIS_AI_MODEL', '');
  vi.stubEnv('OSIRIS_AI_API_KEY', '');
}

beforeEach(clearAiEnv);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('model backend', () => {
  it('talks to Google with gemini-2.0-flash by default', async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiReply([{ text: 'ok' }]));
    vi.stubGlobal('fetch', fetchMock);

    await analyzeIntelligence(createGeminiClient('k'), CONTEXT, 'q');

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'
    );
  });

  it('sends requests to the configured gateway and model', async () => {
    vi.stubEnv('OSIRIS_AI_BASE_URL', 'http://127.0.0.1:20128/');
    vi.stubEnv('OSIRIS_AI_MODEL', 'auto');
    const fetchMock = vi.fn().mockResolvedValue(geminiReply([{ text: 'ok' }]));
    vi.stubGlobal('fetch', fetchMock);

    await analyzeIntelligence(createGeminiClient('k'), CONTEXT, 'q');

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'http://127.0.0.1:20128/v1beta/models/auto:generateContent'
    );
  });
});

describe('response text', () => {
  it('drops reasoning parts a gateway model returns as thought: true', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        geminiReply([
          { text: 'We need to answer tersely.', thought: true },
          { text: '## BLUF\n' },
          { text: 'Nominal.' },
        ])
      )
    );

    const text = await analyzeIntelligence(createGeminiClient('k'), CONTEXT, 'q');

    expect(text).toBe('## BLUF\nNominal.');
  });

  it('returns plain replies unchanged', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(geminiReply([{ text: 'Nominal.' }])));

    const text = await analyzeIntelligence(createGeminiClient('k'), CONTEXT, 'q');

    expect(text).toBe('Nominal.');
  });
});

describe('getServerApiKeys', () => {
  it('returns nothing when neither Gemini keys nor a gateway are configured', () => {
    expect(getServerApiKeys()).toEqual([]);
  });

  it('returns the Gemini keys in order', () => {
    vi.stubEnv('GEMINI_API_KEY_1', ' a ');
    vi.stubEnv('GEMINI_API_KEY_3', 'c');

    expect(getServerApiKeys()).toEqual(['a', 'c']);
  });

  it('supplies a stand-in key for a keyless gateway', () => {
    vi.stubEnv('OSIRIS_AI_BASE_URL', 'http://127.0.0.1:20128');

    expect(getServerApiKeys()).toEqual(['no-key-required']);
  });

  it('prefers OSIRIS_AI_API_KEY for a gateway that wants one', () => {
    vi.stubEnv('OSIRIS_AI_BASE_URL', 'http://127.0.0.1:20128');
    vi.stubEnv('OSIRIS_AI_API_KEY', 'gw-key');

    expect(getServerApiKeys()).toEqual(['gw-key']);
  });

  it('uses real Gemini keys over the stand-in when both are set', () => {
    vi.stubEnv('OSIRIS_AI_BASE_URL', 'http://127.0.0.1:20128');
    vi.stubEnv('GEMINI_API_KEY_1', 'a');

    expect(getServerApiKeys()).toEqual(['a']);
  });
});
