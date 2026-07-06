import { describe, it, expect } from 'vitest';
import { relativeTime } from './relativeTime';

const NOW = Date.parse('2026-07-06T12:00:00.000Z');

describe('relativeTime', () => {
  it('returns "never" for a null timestamp', () => {
    expect(relativeTime(null, NOW)).toBe('never');
  });

  it('returns "now" for something within the last few seconds', () => {
    expect(relativeTime('2026-07-06T11:59:58.000Z', NOW)).toBe('now');
  });

  it('formats seconds', () => {
    expect(relativeTime('2026-07-06T11:59:20.000Z', NOW)).toBe('40s ago');
  });

  it('formats minutes', () => {
    expect(relativeTime('2026-07-06T11:45:00.000Z', NOW)).toBe('15m ago');
  });

  it('formats hours', () => {
    expect(relativeTime('2026-07-06T09:00:00.000Z', NOW)).toBe('3h ago');
  });

  it('formats days', () => {
    expect(relativeTime('2026-07-04T12:00:00.000Z', NOW)).toBe('2d ago');
  });

  it('returns "never" for an unparseable timestamp', () => {
    expect(relativeTime('not-a-date', NOW)).toBe('never');
  });
});
