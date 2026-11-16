import { describe, expect, it } from 'vitest';
import { validateHost } from './ssrf-guard';

describe('validateHost — IPv6 literals', () => {
  it('refuses reserved addresses however they are spelled', async () => {
    for (const host of [
      '::1',
      '0:0:0:0:0:0:0:1',            // loopback, written out
      '0::1',
      '[0:0:0:0:0:0:0:1]',
      '0:0:0:0:0:0:0:1%1',          // with a zone id
      '0:0::ffff:7f00:1',           // IPv4-mapped 127.0.0.1
      '0:0:0:0:0:ffff:a9fe:a9fe',   // IPv4-mapped 169.254.169.254
      'FD00:0:0:0:0:0:0:1',         // unique-local, upper case
      'fe80::1%eth0',               // link-local with a zone id
    ]) {
      expect((await validateHost(host)).ok, host).toBe(false);
    }
  });

  it('still accepts public addresses in either spelling', async () => {
    expect((await validateHost('2606:4700:4700::1111')).ok).toBe(true);
    expect((await validateHost('2606:4700:4700:0:0:0:0:1111')).ok).toBe(true);
  });
});
