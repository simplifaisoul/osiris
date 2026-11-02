import { NextResponse } from 'next/server';
import { isIP } from 'node:net';
import { portServiceName } from '@/lib/osint-utils';
import { getClientIp, isRateLimited, validateHost } from '@/lib/ssrf-guard';

export const dynamic = 'force-dynamic';

/** One open port as the Recon PORT SCAN shows it. */
export interface ScannedPort {
  port: number;
  transport: string;
  service?: string;
  product?: string;
  version?: string;
  banner?: string;
  title?: string;
  cpes: string[];
  vulns: string[];
  last_seen?: string;
}

export interface PortScanResult {
  target: string;
  ip: string;
  /** `shodan` is the full host API (needs SHODAN_API_KEY); `internetdb` the keyless fallback. */
  source: 'shodan' | 'internetdb';
  ports: ScannedPort[];
  hostnames: string[];
  domains: string[];
  tags: string[];
  cpes: string[];
  vulns: string[];
  org?: string;
  isp?: string;
  asn?: string;
  os?: string;
  location?: { city?: string; country?: string; lat?: number; lng?: number };
  last_update?: string;
  note?: string;
}

/** The parts of a Shodan host record this route reads. */
interface ShodanService {
  port?: number;
  transport?: string;
  product?: string;
  version?: string;
  data?: string;
  timestamp?: string;
  cpe?: unknown;
  cpe23?: unknown;
  vulns?: unknown;
  _shodan?: { module?: string };
  http?: { title?: string };
  ssl?: { cert?: { subject?: { CN?: string } } };
}
interface ShodanHost {
  data?: ShodanService[];
  ports?: unknown[];
  hostnames?: unknown;
  domains?: unknown;
  tags?: unknown;
  vulns?: unknown;
  org?: string;
  isp?: string;
  asn?: string;
  os?: string | null;
  city?: string | null;
  country_name?: string;
  latitude?: number;
  longitude?: number;
  last_update?: string;
}

const BANNER_MAX = 600;
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
/** Shodan gives `vulns` as an object keyed by CVE on a service, and as an array on the host. */
const vulnIds = (v: unknown): string[] => (Array.isArray(v) ? strs(v) : v && typeof v === 'object' ? Object.keys(v) : []);
const uniq = (xs: string[]) => [...new Set(xs)];

/** The full Shodan host record: every open port with its banner, product and CVEs. */
async function shodanHost(ip: string, key: string): Promise<{ status: number; data?: ShodanHost }> {
  const res = await fetch(`https://api.shodan.io/shodan/host/${encodeURIComponent(ip)}?key=${encodeURIComponent(key)}`, {
    signal: AbortSignal.timeout(12_000),
    cache: 'no-store',
  });
  if (!res.ok) return { status: res.status };
  return { status: res.status, data: await res.json() };
}

function fromShodan(target: string, ip: string, h: ShodanHost): PortScanResult {
  const services = Array.isArray(h.data) ? h.data : [];
  // A host can report the same port more than once (tcp and udp, or a re-crawl).
  const byKey = new Map<string, ScannedPort>();
  for (const s of services) {
    if (typeof s?.port !== 'number') continue;
    const port = s.port;
    const transport = s.transport || 'tcp';
    const k = `${port}/${transport}`;
    if (byKey.has(k)) continue;
    const banner = typeof s.data === 'string' ? s.data.trim() : '';
    byKey.set(k, {
      port,
      transport,
      service: s._shodan?.module || portServiceName(port),
      product: s.product,
      version: s.version,
      banner: banner ? banner.slice(0, BANNER_MAX) : undefined,
      title: s.http?.title || s.ssl?.cert?.subject?.CN,
      cpes: uniq([...strs(s.cpe23), ...strs(s.cpe)]),
      vulns: vulnIds(s.vulns),
      last_seen: s.timestamp,
    });
  }
  // Ports Shodan lists without a banner still count as open.
  for (const p of Array.isArray(h.ports) ? h.ports : []) {
    if (typeof p === 'number' && ![...byKey.values()].some(x => x.port === p)) {
      byKey.set(`${p}/tcp`, { port: p, transport: 'tcp', service: portServiceName(p), cpes: [], vulns: [] });
    }
  }
  const ports = [...byKey.values()].sort((a, b) => a.port - b.port);
  return {
    target,
    ip,
    source: 'shodan',
    ports,
    hostnames: strs(h.hostnames),
    domains: strs(h.domains),
    tags: strs(h.tags),
    cpes: uniq(ports.flatMap(p => p.cpes)),
    vulns: uniq([...vulnIds(h.vulns), ...ports.flatMap(p => p.vulns)]),
    org: h.org || undefined,
    isp: h.isp || undefined,
    asn: h.asn || undefined,
    os: h.os || undefined,
    location: { city: h.city || undefined, country: h.country_name || undefined, lat: h.latitude, lng: h.longitude },
    last_update: h.last_update,
  };
}

/** Keyless fallback: Shodan InternetDB has the open ports, CPEs and CVEs, but no banners. */
async function fromInternetDb(target: string, ip: string, note?: string): Promise<PortScanResult> {
  const res = await fetch(`https://internetdb.shodan.io/${encodeURIComponent(ip)}`, {
    signal: AbortSignal.timeout(8_000),
    cache: 'no-store',
  });
  const empty = { target, ip, source: 'internetdb' as const, ports: [], hostnames: [], domains: [], tags: [], cpes: [], vulns: [] };
  if (res.status === 404) return { ...empty, note: note ?? 'Shodan has no record of open ports on this host.' };
  if (!res.ok) throw new Error(`Shodan InternetDB HTTP ${res.status}`);
  const d: { ports?: unknown[]; hostnames?: unknown; tags?: unknown; cpes?: unknown; vulns?: unknown } = await res.json();
  const ports: ScannedPort[] = (Array.isArray(d.ports) ? d.ports : [])
    .filter((p: unknown): p is number => typeof p === 'number')
    .sort((a: number, b: number) => a - b)
    .map((p: number) => ({ port: p, transport: 'tcp', service: portServiceName(p), cpes: [], vulns: [] }));
  return { ...empty, ports, hostnames: strs(d.hostnames), tags: strs(d.tags), cpes: strs(d.cpes), vulns: strs(d.vulns), note };
}

export async function GET(req: Request) {
  const target = new URL(req.url).searchParams.get('target')?.trim() ?? '';
  if (!target) return NextResponse.json({ error: 'Missing target parameter' }, { status: 400 });

  if (isRateLimited(`portscan:${getClientIp(req)}`, 15, 60_000)) {
    return NextResponse.json({ error: 'Too many scans — wait a minute and try again.' }, { status: 429 });
  }

  // Hostnames resolve here; private, reserved and metadata targets are refused.
  const check = await validateHost(target);
  if (!check.ok) return NextResponse.json({ error: `Cannot scan ${target}: ${check.reason}` }, { status: 400 });
  const ip = check.resolved?.find(a => isIP(a) === 4) ?? check.resolved?.[0];
  if (!ip) return NextResponse.json({ error: `Cannot scan ${target}: no address` }, { status: 400 });

  try {
    const key = process.env.SHODAN_API_KEY?.trim();
    if (!key) return NextResponse.json(await fromInternetDb(target, ip));

    const host = await shodanHost(ip, key);
    if (host.data) return NextResponse.json(fromShodan(target, ip, host.data));
    if (host.status === 404) {
      return NextResponse.json({ target, ip, source: 'shodan', ports: [], hostnames: [], domains: [], tags: [], cpes: [], vulns: [], note: 'Shodan has no record of open ports on this host.' } satisfies PortScanResult);
    }
    // A bad key, spent credits or an outage: still answer, from the keyless index.
    const why = host.status === 401 || host.status === 403 ? 'the Shodan API key was refused' : host.status === 429 ? 'Shodan rate-limited the key' : `Shodan returned HTTP ${host.status}`;
    return NextResponse.json(await fromInternetDb(target, ip, `Showing the keyless InternetDB record: ${why}.`));
  } catch (error) {
    return NextResponse.json({ error: 'Shodan port scan failed', detail: (error as Error)?.message }, { status: 502 });
  }
}
