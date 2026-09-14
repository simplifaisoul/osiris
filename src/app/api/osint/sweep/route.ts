import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// ---- Types ----

export interface SweepDevice {
  ip: string;
  ports: number[];
  hostnames: string[];
  cpes: string[];
  vulns: string[];
  tags: string[];
  device_type: string;
  device_icon: string;
  device_color: string;
  risk_level: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
}

export interface SweepResult {
  center: {
    lat: number;
    lng: number;
    city: string;
    region: string;
    country: string;
    countryCode: string;
    isp: string;
    asn: string;
    org: string;
  };
  subnet: string;
  cidr: number;
  target_ip: string;
  devices: SweepDevice[];
  summary: {
    total_hosts: number;
    total_responsive: number;
    device_breakdown: Record<string, number>;
  };
  sweep_time_ms: number;
}

// ---- Rate Limiting ----

interface RateLimitEntry {
  timestamps: number[];
}

const rateLimitMap = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 2;

function checkRateLimit(requesterIp: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(requesterIp);

  if (!entry) {
    rateLimitMap.set(requesterIp, { timestamps: [now] });
    return true;
  }

  // Prune timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  if (entry.timestamps.length >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.timestamps.push(now);
  return true;
}

// ---- IP Validation ----

const IPV4_REGEX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function parseIPv4(ip: string): [number, number, number, number] | null {
  const match = ip.match(IPV4_REGEX);
  if (!match) return null;

  const octets = [
    parseInt(match[1], 10),
    parseInt(match[2], 10),
    parseInt(match[3], 10),
    parseInt(match[4], 10),
  ] as [number, number, number, number];

  if (octets.some((o) => o < 0 || o > 255)) return null;
  return octets;
}

function isPrivateOrReserved(octets: [number, number, number, number]): boolean {
  const [a, b] = octets;

  // 10.0.0.0/8 — Private
  if (a === 10) return true;

  // 172.16.0.0/12 — Private
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.168.0.0/16 — Private
  if (a === 192 && b === 168) return true;

  // 127.0.0.0/8 — Loopback
  if (a === 127) return true;

  // 100.64.0.0/10 — CGNAT
  if (a === 100 && b >= 64 && b <= 127) return true;

  // 169.254.0.0/16 — Link-local
  if (a === 169 && b === 254) return true;

  // 224.0.0.0 – 255.255.255.255 — Multicast + Reserved
  if (a >= 224) return true;

  // 0.0.0.0/8 — "This" network
  if (a === 0) return true;

  return false;
}

// ---- Subnet Calculation ----

function ipToNumber(octets: [number, number, number, number]): number {
  return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
}

function numberToIp(num: number): string {
  return [
    (num >>> 24) & 0xff,
    (num >>> 16) & 0xff,
    (num >>> 8) & 0xff,
    num & 0xff,
  ].join('.');
}

function calculateSubnetStart(ipNum: number, cidr: number): number {
  const mask = (0xffffffff << (32 - cidr)) >>> 0;
  return (ipNum & mask) >>> 0;
}

// ---- Batch Fetch ----

async function batchFetch<T>(
  urls: string[],
  concurrency: number,
  fn: (url: string) => Promise<T | null>,
): Promise<(T | null)[]> {
  const results: (T | null)[] = new Array(urls.length).fill(null);
  let idx = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (idx < urls.length) {
      const i = idx++;
      results[i] = await fn(urls[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

// ---- Device Classification ----

interface DeviceClassification {
  device_type: string;
  device_icon: string;
  device_color: string;
}

function classifyDevice(
  ports: number[],
  cpes: string[],
  tags: string[],
): DeviceClassification {
  const portSet = new Set(ports);
  const cpeLower = cpes.map((c) => c.toLowerCase());
  const tagLower = tags.map((t) => t.toLowerCase());

  // Camera/DVR
  if (
    portSet.has(554) ||
    portSet.has(8554) ||
    cpeLower.some((c) => /camera|dvr|hikvision|dahua|axis|ipcam/.test(c))
  ) {
    return { device_type: 'Camera/DVR', device_icon: 'Camera', device_color: '#FF3D3D' };
  }

  // Printer
  if (
    portSet.has(9100) ||
    cpeLower.some((c) => /printer|hp.*laserjet|epson|brother/.test(c))
  ) {
    return { device_type: 'Printer', device_icon: 'Printer', device_color: '#F48FB1' };
  }

  // IoT Device
  if (portSet.has(1883) || portSet.has(8883) || tagLower.includes('iot')) {
    return { device_type: 'IoT Device', device_icon: 'Cpu', device_color: '#39FF14' };
  }

  // VoIP/SIP
  if (portSet.has(5060) || portSet.has(5061)) {
    return { device_type: 'VoIP/SIP', device_icon: 'Phone', device_color: '#87CEEB' };
  }

  // Router/Switch
  if (
    cpeLower.some((c) => /mikrotik|ubiquiti|cisco|juniper|fortinet/.test(c)) ||
    portSet.has(161) ||
    portSet.has(8291)
  ) {
    return { device_type: 'Router/Switch', device_icon: 'Router', device_color: '#00E5FF' };
  }

  // Database
  if (
    portSet.has(3306) ||
    portSet.has(5432) ||
    portSet.has(27017) ||
    portSet.has(6379) ||
    portSet.has(9200) ||
    portSet.has(5984)
  ) {
    return { device_type: 'Database', device_icon: 'Database', device_color: '#FF6B00' };
  }

  // Mail Server
  if (
    portSet.has(25) ||
    portSet.has(587) ||
    portSet.has(993) ||
    portSet.has(995) ||
    portSet.has(110) ||
    portSet.has(143)
  ) {
    return { device_type: 'Mail Server', device_icon: 'Mail', device_color: '#FF9500' };
  }

  // DNS Server
  if (portSet.has(53)) {
    return { device_type: 'DNS Server', device_icon: 'Server', device_color: '#00BCD4' };
  }

  // FTP Server
  if (portSet.has(21) || portSet.has(990)) {
    return { device_type: 'FTP Server', device_icon: 'HardDrive', device_color: '#FFD700' };
  }

  // VPN Gateway
  if (
    portSet.has(1194) ||
    portSet.has(1723) ||
    portSet.has(500) ||
    portSet.has(4500) ||
    cpeLower.some((c) => /openvpn|wireguard/.test(c))
  ) {
    return { device_type: 'VPN Gateway', device_icon: 'ShieldCheck', device_color: '#D4AF37' };
  }

  // Windows Workstation
  if (portSet.has(3389)) {
    return { device_type: 'Windows Workstation', device_icon: 'Monitor', device_color: '#E040FB' };
  }

  // Linux Server (SSH only, no web)
  if (portSet.has(22) && !portSet.has(80) && !portSet.has(443)) {
    return { device_type: 'Linux Server', device_icon: 'Terminal', device_color: '#76FF03' };
  }

  // Web Server
  if (portSet.has(80) || portSet.has(443) || portSet.has(8080) || portSet.has(8443)) {
    return { device_type: 'Web Server', device_icon: 'Globe', device_color: '#448AFF' };
  }

  // Fallback
  return { device_type: 'Unknown Host', device_icon: 'CircleDot', device_color: '#666666' };
}

// ---- Risk Assessment ----

function assessRisk(
  device: Partial<SweepDevice>,
): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO' {
  const vulns = device.vulns ?? [];
  const ports = device.ports ?? [];
  const portSet = new Set(ports);

  if (vulns.length > 5) return 'CRITICAL';
  if (vulns.length > 0) return 'HIGH';
  if (portSet.has(23) || portSet.has(21) || portSet.has(161)) return 'MEDIUM';
  if (ports.length > 5) return 'LOW';
  return 'INFO';
}

// ---- Shodan InternetDB Response ----

interface ShodanInternetDBResponse {
  cpes: string[];
  hostnames: string[];
  ip: string;
  ports: number[];
  tags: string[];
  vulns: string[];
}

// ---- GET Handler ----

export async function GET(req: Request) {
  const startTime = Date.now();
  const { searchParams } = new URL(req.url);

  // --- 1. IP Validation ---
  const ip = searchParams.get('ip');
  if (!ip) {
    return NextResponse.json({ error: 'Missing ip parameter' }, { status: 400 });
  }

  const octets = parseIPv4(ip);
  if (!octets) {
    return NextResponse.json({ error: 'Invalid IPv4 address format' }, { status: 400 });
  }

  if (isPrivateOrReserved(octets)) {
    return NextResponse.json(
      { error: 'Private and reserved IP ranges are not allowed' },
      { status: 400 },
    );
  }

  const cidrParam = searchParams.get('cidr');
  let cidr = 24;
  if (cidrParam) {
    cidr = parseInt(cidrParam, 10);
    if (isNaN(cidr) || cidr < 24 || cidr > 32) {
      return NextResponse.json(
        { error: 'CIDR must be between 24 and 32' },
        { status: 400 },
      );
    }
  }

  // --- 2. Rate Limiting ---
  const forwarded = req.headers.get('x-forwarded-for');
  const requesterIp = forwarded?.split(',')[0]?.trim() || '127.0.0.1';

  if (!checkRateLimit(requesterIp)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Max 2 sweeps per minute.' },
      { status: 429 },
    );
  }

  try {
    // --- 3. Geolocation ---
    const geoRes = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,region,regionName,city,lat,lon,isp,org,as,proxy,hosting`,
      { signal: AbortSignal.timeout(5000) },
    );

    if (!geoRes.ok) {
      return NextResponse.json(
        { error: 'Geolocation service unavailable' },
        { status: 502 },
      );
    }

    const geoData = await geoRes.json();
    if (geoData.status === 'fail') {
      return NextResponse.json(
        { error: `Geolocation failed: ${geoData.message || 'Unknown error'}` },
        { status: 422 },
      );
    }

    const center = {
      lat: geoData.lat as number,
      lng: geoData.lon as number,
      city: geoData.city as string,
      region: geoData.regionName as string,
      country: geoData.country as string,
      countryCode: geoData.countryCode as string,
      isp: geoData.isp as string,
      asn: (geoData.as as string) || '',
      org: (geoData.org as string) || '',
    };

    // --- 4. Shodan InternetDB Sweep ---
    const ipNum = ipToNumber(octets);
    const subnetStart = calculateSubnetStart(ipNum, cidr);
    const totalHosts = Math.pow(2, 32 - cidr);
    const subnet = numberToIp(subnetStart);

    // Build list of IPs in the subnet
    const urls: string[] = [];
    for (let i = 0; i < totalHosts; i++) {
      const currentIp = numberToIp((subnetStart + i) >>> 0);
      urls.push(`https://internetdb.shodan.io/${currentIp}`);
    }

    // Fetch with concurrency limit
    const shodanResults = await batchFetch<ShodanInternetDBResponse>(
      urls,
      20,
      async (url) => {
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
          if (res.status === 404) return null; // Non-responsive host
          if (!res.ok) return null;
          return (await res.json()) as ShodanInternetDBResponse;
        } catch {
          return null;
        }
      },
    );

    // --- 5 & 6. Classify Devices ---
    const devices: SweepDevice[] = [];
    const deviceBreakdown: Record<string, number> = {};

    for (const result of shodanResults) {
      if (!result) continue;

      const classification = classifyDevice(result.ports, result.cpes, result.tags);
      const risk = assessRisk({
        ports: result.ports,
        vulns: result.vulns,
      });

      devices.push({
        ip: result.ip,
        ports: result.ports,
        hostnames: result.hostnames,
        cpes: result.cpes,
        vulns: result.vulns,
        tags: result.tags,
        device_type: classification.device_type,
        device_icon: classification.device_icon,
        device_color: classification.device_color,
        risk_level: risk,
      });

      deviceBreakdown[classification.device_type] =
        (deviceBreakdown[classification.device_type] || 0) + 1;
    }

    // --- 7. Response ---
    const sweepResult: SweepResult = {
      center,
      subnet: `${subnet}/${cidr}`,
      cidr,
      target_ip: ip,
      devices,
      summary: {
        total_hosts: totalHosts,
        total_responsive: devices.length,
        device_breakdown: deviceBreakdown,
      },
      sweep_time_ms: Date.now() - startTime,
    };

    return NextResponse.json(sweepResult, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    });
  } catch (err) {
    console.error('[OSIRIS] Sweep error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Sweep failed' }, { status: 500 });
  }
}
