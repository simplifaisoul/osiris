import { describe, it, expect } from 'vitest';
import { cleanQuery, donbotFrameUrl, parseDonbotMessage, DONBOT_ORIGIN, MAX_QUERY_LENGTH } from './donbot';

const msg = (type: string, extra: Record<string, unknown> = {}) => ({ source: 'digitaldon-widget', type, ...extra });

describe('cleanQuery', () => {
  it('trims, collapses space and strips control characters', () => {
    expect(cleanQuery('  bonk \n ')).toBe('bonk');
    expect(cleanQuery('pepe\u0000coin')).toBe('pepecoin');
  });
  it('rejects empty and oversized queries', () => {
    expect(cleanQuery('   ')).toBeNull();
    expect(cleanQuery('x'.repeat(MAX_QUERY_LENGTH + 1))).toBeNull();
  });
});

describe('donbotFrameUrl', () => {
  it('asks the widget origin for the query, dark, and nothing about this site', () => {
    const url = new URL(donbotFrameUrl('So11111111111111111111111111111111111111112'));
    expect(url.origin).toBe(DONBOT_ORIGIN);
    expect(url.searchParams.get('q')).toBe('So11111111111111111111111111111111111111112');
    expect(url.searchParams.get('theme')).toBe('dark');
    expect(url.searchParams.has('host')).toBe(false);
  });
  it('encodes whatever the query contains', () => {
    expect(new URL(donbotFrameUrl('a&host=evil')).searchParams.get('host')).toBeNull();
  });
});

describe('parseDonbotMessage', () => {
  it('reads a resize, capped', () => {
    expect(parseDonbotMessage(msg('digitaldon:resize', { height: 612.2 }))).toEqual({ type: 'resize', height: 613 });
    expect(parseDonbotMessage(msg('digitaldon:resize', { height: 1e9 }))).toEqual({ type: 'resize', height: 2400 });
    expect(parseDonbotMessage(msg('digitaldon:resize', { height: -5 }))).toBeNull();
  });

  it('reads a result, validated', () => {
    expect(parseDonbotMessage(msg('digitaldon:result', { symbol: '$BONK', score: 71.6, thesis: '  Strong  holders ' })))
      .toEqual({ type: 'result', symbol: 'BONK', score: 72, thesis: 'Strong holders' });
  });

  it('drops results it cannot vouch for', () => {
    expect(parseDonbotMessage(msg('digitaldon:result', { symbol: 'BONK', score: 140 }))).toBeNull();
    expect(parseDonbotMessage(msg('digitaldon:result', { symbol: '<img src=x>', score: 50 }))).toBeNull();
    expect(parseDonbotMessage(msg('digitaldon:result', { symbol: 'BONK', score: 'high' }))).toBeNull();
  });

  it('ignores anything not from the widget, and messages it has no use for', () => {
    expect(parseDonbotMessage({ type: 'digitaldon:resize', height: 300 })).toBeNull();
    expect(parseDonbotMessage(msg('digitaldon:expand', { on: true }))).toBeNull();
    expect(parseDonbotMessage('digitaldon:resize')).toBeNull();
    expect(parseDonbotMessage(null)).toBeNull();
  });
});
