import { describe, it, expect } from 'vitest';
import {
  validateQuery, platformCategory, splitNdjson, csvCell, toCsv,
  pushHistory, parseHistory, relativeTime, HISTORY_CAP, type HistoryEntry,
} from './fingerprint';

describe('validateQuery', () => {
  it('accepts a plain handle and rejects one that could escape a URL path', () => {
    expect(validateQuery('username', 'johndoe')).toBeNull();
    expect(validateQuery('username', 'john/../doe')).not.toBeNull();
    expect(validateQuery('username', '   ')).not.toBeNull();
  });

  it('checks email shape', () => {
    expect(validateQuery('email', 'jdoe@mail.com')).toBeNull();
    expect(validateQuery('email', 'jdoe@mail')).not.toBeNull();
    expect(validateQuery('email', 'jdoe')).not.toBeNull();
  });

  it('accepts formatted phone numbers within the E.164 digit range', () => {
    expect(validateQuery('phone', '+1 (415) 555-0132')).toBeNull();
    expect(validateQuery('phone', '12345')).not.toBeNull();
    expect(validateQuery('phone', '+1 415 CALL NOW')).not.toBeNull();
    expect(validateQuery('phone', '1'.repeat(16))).not.toBeNull();
  });
});

describe('platformCategory', () => {
  it('files known sites by name, case-insensitively', () => {
    expect(platformCategory('GitHub')).toBe('Developer');
    expect(platformCategory('steam')).toBe('Gaming');
    expect(platformCategory('Instagram')).toBe('Social');
  });

  it('falls back to name hints, then Other', () => {
    expect(platformCategory('Some Linux Forum')).toBe('Forums');
    expect(platformCategory('Zzqx')).toBe('Other');
  });
});

describe('splitNdjson', () => {
  it('keeps a line split across chunks until it is complete', () => {
    const first = splitNdjson('{"a":1}\n{"b":');
    expect(first.lines).toEqual(['{"a":1}']);
    expect(first.rest).toBe('{"b":');
    const second = splitNdjson(first.rest + '2}\n\n');
    expect(second.lines).toEqual(['{"b":2}']);
    expect(second.rest).toBe('');
  });
});

describe('csv export', () => {
  it('quotes delimiters and doubles embedded quotes', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(undefined)).toBe('');
  });

  it('neutralises cells a spreadsheet would run as formulas', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('joins rows with CRLF', () => {
    expect(toCsv(['a', 'b'], [[1, 2]])).toBe('a,b\r\n1,2');
  });
});

describe('history', () => {
  const entry = (i: number): HistoryEntry => ({ query: `q${i}`, type: 'username', count: i, status: 'done', at: i });

  it('puts the newest first and caps the log', () => {
    let list: HistoryEntry[] = [];
    for (let i = 0; i < HISTORY_CAP + 5; i++) list = pushHistory(list, entry(i));
    expect(list).toHaveLength(HISTORY_CAP);
    expect(list[0].query).toBe(`q${HISTORY_CAP + 4}`);
  });

  it('survives missing, corrupt or foreign stored values', () => {
    expect(parseHistory(null)).toEqual([]);
    expect(parseHistory('not json')).toEqual([]);
    expect(parseHistory('{"a":1}')).toEqual([]);
    expect(parseHistory(JSON.stringify([entry(1), { query: 'x', type: 'ssn', at: 1 }]))).toEqual([entry(1)]);
  });
});

describe('relativeTime', () => {
  it('reads like a log', () => {
    const now = 10_000_000;
    expect(relativeTime(now - 10_000, now)).toBe('just now');
    expect(relativeTime(now - 2 * 60_000, now)).toBe('2m ago');
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe('3h ago');
    expect(relativeTime(now - 2 * 86_400_000, now)).toBe('2d ago');
  });
});
