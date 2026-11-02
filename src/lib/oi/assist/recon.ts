/**
 * OSIRIS OI Assist: the Recon panel's lookups, for OI.
 *
 * The Recon panel runs one OSINT lookup per tool against the site's own API
 * routes (and one public one). This names those tools for the model, builds
 * each lookup's request, and turns any result JSON into a few readable fields.
 * OI reaches them through the `recon` tool in tools.ts; `self_track` (the
 * reader's own public-IP location, via /api/geo) is handled by the caller.
 */

export const RECON_TOOLS = [
  'self_track', 'shodan', 'dns', 'whois', 'certs', 'ssl', 'subdomains', 'headers',
  'tech', 'bgp', 'mac', 'phone', 'username', 'github', 'threats', 'leaks', 'crypto', 'vuln',
] as const;
export type ReconTool = typeof RECON_TOOLS[number];

/** Words a model is likely to use for a tool, mapped to its id. */
const ALIAS: Record<string, ReconTool> = {
  self: 'self_track', selftrack: 'self_track', me: 'self_track', locate: 'self_track', my_location: 'self_track', track: 'self_track',
  scanner: 'shodan', port_scan: 'shodan', portscan: 'shodan', ports: 'shodan', sweep: 'shodan', iot: 'shodan', device: 'shodan',
  domain: 'dns', breach: 'leaks', breaches: 'leaks', email: 'leaks', wallet: 'crypto', address: 'crypto', chain: 'crypto',
  user: 'username', handle: 'username', reputation: 'threats', threat: 'threats', asn: 'bgp', cert: 'certs', certificates: 'certs',
};

export function reconToolId(v: string): ReconTool | null {
  const s = v.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if ((RECON_TOOLS as readonly string[]).includes(s)) return s as ReconTool;
  return ALIAS[s] ?? null;
}

export const RECON_LABEL: Record<ReconTool, string> = {
  self_track: 'Self track', shodan: 'Shodan IoT', dns: 'DNS', whois: 'WHOIS', certs: 'Certificates',
  ssl: 'SSL/TLS', subdomains: 'Subdomains', headers: 'Headers', tech: 'Tech detect', bgp: 'BGP route',
  mac: 'MAC vendor', phone: 'Phone intel', username: 'Username hunt', github: 'GitHub recon',
  threats: 'Threat intel', leaks: 'Data leaks', crypto: 'Chain intel', vuln: 'Vuln sweep',
};

/** IP/host tools whose target can be geolocated to put a pin on the map. */
export const RECON_GEOLOCATABLE: ReconTool[] = ['shodan', 'dns', 'whois', 'certs', 'ssl', 'subdomains', 'headers', 'tech', 'bgp', 'threats'];

/**
 * The request a lookup makes. `external` is fetched with no-store (a public API,
 * not our own route). `self_track` has no request here: the caller uses /api/geo.
 */
export function reconRequest(tool: ReconTool, target: string): { url: string; external?: boolean } | null {
  const t = encodeURIComponent(target);
  switch (tool) {
    case 'dns': return { url: `/api/osint/dns?domain=${t}` };
    case 'whois': return { url: `/api/osint/whois?domain=${t}` };
    case 'certs': return { url: `/api/osint/certs?domain=${t}` };
    case 'bgp': return { url: `/api/osint/bgp?query=${t}` };
    case 'mac': return { url: `/api/osint/mac?mac=${t}` };
    case 'phone': return { url: `/api/osint/phone?number=${t}` };
    case 'crypto': return { url: `/api/osint/crypto?address=${t}` };
    case 'username': return { url: `/api/osint/username?username=${t}` };
    case 'github': return { url: `/api/osint/github?user=${t}` };
    case 'threats': return { url: `/api/osint/threats?query=${t}` };
    // Keyless Shodan InternetDB record, proxied by our route (open ports, CVEs, tags).
    case 'shodan': return { url: `/api/osint/shodan?ip=${t}` };
    // These need the scanner backend (SCANNER_KEY); they fail gracefully when it is off.
    case 'vuln': case 'ssl': case 'subdomains': case 'headers': case 'tech':
      return { url: `/api/scanner?target=${t}&type=${tool}` };
    case 'leaks': return { url: `https://api.xposedornot.com/v1/breach-analytics?email=${t}`, external: true };
    case 'self_track': return null;
  }
}

/** A handful of readable fields from any recon JSON: scalars as-is, arrays summarised. */
export function reconFields(json: Record<string, unknown>): { label: string; detail: string }[] {
  const out: { label: string; detail: string }[] = [];
  for (const [k, v] of Object.entries(json)) {
    if (out.length >= 10) break;
    if (k === 'error' || k === 'detail' || k === 'status') continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      const s = String(v).trim();
      if (s) out.push({ label: k, detail: s.slice(0, 160) });
    } else if (Array.isArray(v) && v.length) {
      const flat = v.filter(x => typeof x === 'string' || typeof x === 'number').slice(0, 8).join(', ');
      out.push({ label: k, detail: (flat ? `${v.length}: ${flat}` : `${v.length} item${v.length === 1 ? '' : 's'}`).slice(0, 160) });
    }
  }
  return out;
}
