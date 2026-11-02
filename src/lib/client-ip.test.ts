import { describe, it, expect } from 'vitest';
import { getClientIp, isRateLimited, isPublicIp, visitorIp } from './ssrf-guard';

const req = (headers: Record<string, string>) => new Request('https://osiris.test/api/scanner', { headers });

describe('getClientIp', () => {
  /* The bypass: the leftmost X-Forwarded-For entry is written by the client,
     so a new value per request bought a new rate-limit bucket per request. */
  it('ignores the client-written left entry and uses the proxy-observed right one', () => {
    expect(getClientIp(req({ 'x-forwarded-for': '1.1.1.1, 203.0.113.9' }))).toBe('203.0.113.9');
    expect(getClientIp(req({ 'x-forwarded-for': '9.9.9.9, 203.0.113.9' }))).toBe('203.0.113.9');
  });

  it('prefers an edge-set header over anything forwarded', () => {
    expect(getClientIp(req({
      'cf-connecting-ip': '198.51.100.4',
      'x-forwarded-for': 'attacker-controlled, 203.0.113.9',
    }))).toBe('198.51.100.4');
  });

  it('falls back to x-real-ip when there is no edge header', () => {
    expect(getClientIp(req({ 'x-real-ip': '198.51.100.7' }))).toBe('198.51.100.7');
  });

  it('collapses junk to one shared bucket instead of a fresh one each time', () => {
    expect(getClientIp(req({ 'x-forwarded-for': 'not-an-ip' }))).toBe('unknown');
    expect(getClientIp(req({ 'x-forwarded-for': 'also-not-an-ip' }))).toBe('unknown');
    expect(getClientIp(req({}))).toBe('unknown');
  });

  it('accepts IPv6, bracketed or bare', () => {
    expect(getClientIp(req({ 'x-real-ip': '2001:db8::1' }))).toBe('2001:db8::1');
    expect(getClientIp(req({ 'x-real-ip': '[2001:db8::1]' }))).toBe('[2001:db8::1]');
  });
});

describe('scanner throttle under a spoofed header', () => {
  it('still binds when the attacker rotates the left entry every request', () => {
    const limit = 5;
    let blocked = 0;
    for (let i = 0; i < 20; i++) {
      const ip = getClientIp(req({ 'x-forwarded-for': `10.0.0.${i}, 203.0.113.42` }));
      if (isRateLimited(ip, limit, 60_000)) blocked++;
    }
    // 20 requests, 5 allowed: the rotation buys nothing.
    expect(blocked).toBe(15);
  });
});

describe('isPublicIp', () => {
  it('keeps public 172.x and drops only 172.16/12', () => {
    expect(isPublicIp('172.56.10.20')).toBe(true);   // T-Mobile US
    expect(isPublicIp('172.217.4.14')).toBe(true);   // Google
    expect(isPublicIp('172.32.0.1')).toBe(true);
    expect(isPublicIp('172.16.0.1')).toBe(false);
    expect(isPublicIp('172.31.255.255')).toBe(false);
  });

  it('rejects loopback, private, CGNAT and reserved IPv6', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.1.5', '100.89.48.10', '::1', 'fd00::1', 'fe80::1', '']) {
      expect(isPublicIp(ip)).toBe(false);
    }
  });

  it('accepts public IPv6 and judges an IPv4-mapped address by its IPv4', () => {
    expect(isPublicIp('2a00:1450:4001:80b::200e')).toBe(true);
    expect(isPublicIp('::ffff:81.2.69.142')).toBe(true);
    expect(isPublicIp('::ffff:10.0.0.1')).toBe(false);
  });

  it('rejects things that are not addresses', () => {
    expect(isPublicIp('unknown')).toBe(false);
    expect(isPublicIp('2130706433')).toBe(false);
  });
});

describe('visitorIp', () => {
  it('prefers the edge header', () => {
    expect(visitorIp(req({ 'cf-connecting-ip': '81.2.69.142', 'x-forwarded-for': '8.8.8.8' }))).toBe('81.2.69.142');
  });

  it('skips a proxy-internal address and finds the visitor further down', () => {
    // A container network in front of the app: x-real-ip is the proxy itself.
    expect(visitorIp(req({ 'x-real-ip': '172.18.0.5', 'x-forwarded-for': '172.56.10.20, 172.18.0.5' }))).toBe('172.56.10.20');
  });

  it('returns null rather than a private address', () => {
    expect(visitorIp(req({ 'x-forwarded-for': '10.0.0.4, 127.0.0.1' }))).toBeNull();
    expect(visitorIp(req({}))).toBeNull();
  });
});
