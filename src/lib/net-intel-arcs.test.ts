import { describe, it, expect } from 'vitest';
import { familyLinks, type FamilyHost } from './net-intel-arcs';

const host = (ip: string, lng: number, lat: number, malware = 'HookBot', asn: number | null = null): FamilyHost =>
  ({ ip, lng, lat, malware, asn });

const pairs = (hosts: FamilyHost[]) => familyLinks(hosts).map(l => `${l.from.ip}>${l.to.ip}`);

describe('familyLinks', () => {
  it('joins a family with one line fewer than it has hosts', () => {
    const hosts = [host('1.0.0.1', 0, 0), host('1.0.0.2', 10, 0), host('1.0.0.3', 20, 0), host('1.0.0.4', 30, 0)];
    expect(familyLinks(hosts)).toHaveLength(3);
  });

  it('runs through nearest neighbours, not across the whole family', () => {
    // Three hosts in a row: the outer two are joined through the middle one.
    const hosts = [host('1.0.0.1', 0, 0), host('1.0.0.3', 40, 0), host('1.0.0.2', 20, 0)];
    expect(pairs(hosts)).toEqual(['1.0.0.1>1.0.0.2', '1.0.0.2>1.0.0.3']);
  });

  it('never joins two different families', () => {
    const links = familyLinks([
      host('1.0.0.1', 0, 0, 'HookBot'), host('1.0.0.2', 1, 0, 'Supershell'),
      host('1.0.0.3', 2, 0, 'HookBot'), host('1.0.0.4', 3, 0, 'Supershell'),
    ]);
    expect(links).toHaveLength(2);
    expect(links.every(l => l.from.malware === l.to.malware)).toBe(true);
  });

  it('reads the family without regard to case', () => {
    expect(familyLinks([host('1.0.0.1', 0, 0, 'Lokibot'), host('1.0.0.2', 1, 0, 'LokiBot')])).toHaveLength(1);
  });

  it('draws nothing for a family of one', () => {
    expect(familyLinks([host('1.0.0.1', 0, 0, 'Lunex'), host('1.0.0.2', 1, 0, 'Exvicy')])).toEqual([]);
  });

  it('gives the same links whatever order the hosts arrive in', () => {
    // The snapshot is re-sorted as listings change; arcs must not redraw for that.
    const hosts = [host('1.0.0.1', 0, 0), host('1.0.0.2', 5, 5), host('1.0.0.3', -5, 5), host('1.0.0.4', 0, 9)];
    expect(pairs([...hosts].reverse())).toEqual(pairs(hosts));
  });

  it('marks a link whose ends share an autonomous system', () => {
    const links = familyLinks([host('1.0.0.1', 0, 0, 'HookBot', 209605), host('1.0.0.2', 1, 0, 'HookBot', 209605)]);
    expect(links[0].sameAs).toBe(true);
    expect(familyLinks([host('1.0.0.1', 0, 0), host('1.0.0.2', 1, 0)])[0].sameAs).toBe(false);
  });

  it('skips a host without a position or a family', () => {
    expect(familyLinks([host('1.0.0.1', NaN, 0), host('1.0.0.2', 1, 0), host('1.0.0.3', 2, 0, '')])).toEqual([]);
  });
});
