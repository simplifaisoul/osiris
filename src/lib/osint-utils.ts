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

export interface ShodanInternetDBResponse {
  cpes: string[];
  hostnames: string[];
  ip: string;
  ports: number[];
  tags: string[];
  vulns: string[];
}

const IPV4_REGEX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function parseIPv4(ip: string): [number, number, number, number] | null {
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

export function isPrivateOrReserved(octets: [number, number, number, number]): boolean {
  const [a, b] = octets;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a >= 224) return true;
  if (a === 0) return true;
  return false;
}

export function ipToNumber(octets: [number, number, number, number]): number {
  return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
}

export function numberToIp(num: number): string {
  return [
    (num >>> 24) & 0xff,
    (num >>> 16) & 0xff,
    (num >>> 8) & 0xff,
    num & 0xff,
  ].join('.');
}

export function calculateSubnetStart(ipNum: number, cidr: number): number {
  const mask = (0xffffffff << (32 - cidr)) >>> 0;
  return (ipNum & mask) >>> 0;
}

export interface DeviceClassification {
  device_type: string;
  device_icon: string;
  device_color: string;
}

export function classifyDevice(
  ports: number[],
  cpes: string[],
  tags: string[],
): DeviceClassification {
  const portSet = new Set(ports || []);
  const cpeLower = (cpes || []).map((c) => c.toLowerCase());
  const tagLower = (tags || []).map((t) => t.toLowerCase());

  if (portSet.has(554) || portSet.has(8554) || cpeLower.some((c) => /camera|dvr|hikvision|dahua|axis|ipcam/.test(c))) {
    return { device_type: 'Camera/DVR', device_icon: 'Camera', device_color: '#FF3D3D' };
  }
  if (portSet.has(9100) || cpeLower.some((c) => /printer|hp.*laserjet|epson|brother/.test(c))) {
    return { device_type: 'Printer', device_icon: 'Printer', device_color: '#F48FB1' };
  }
  if (portSet.has(1883) || portSet.has(8883) || tagLower.includes('iot')) {
    return { device_type: 'IoT Device', device_icon: 'Cpu', device_color: '#39FF14' };
  }
  if (portSet.has(5060) || portSet.has(5061)) {
    return { device_type: 'VoIP/SIP', device_icon: 'Phone', device_color: '#87CEEB' };
  }
  if (cpeLower.some((c) => /mikrotik|ubiquiti|cisco|juniper|fortinet/.test(c)) || portSet.has(161) || portSet.has(8291)) {
    return { device_type: 'Router/Switch', device_icon: 'Router', device_color: '#00E5FF' };
  }
  if (portSet.has(3306) || portSet.has(5432) || portSet.has(27017) || portSet.has(6379) || portSet.has(9200) || portSet.has(5984)) {
    return { device_type: 'Database', device_icon: 'Database', device_color: '#FF6B00' };
  }
  if (portSet.has(25) || portSet.has(587) || portSet.has(993) || portSet.has(995) || portSet.has(110) || portSet.has(143)) {
    return { device_type: 'Mail Server', device_icon: 'Mail', device_color: '#FF9500' };
  }
  if (portSet.has(53)) {
    return { device_type: 'DNS Server', device_icon: 'Server', device_color: '#00BCD4' };
  }
  if (portSet.has(21) || portSet.has(990)) {
    return { device_type: 'FTP Server', device_icon: 'HardDrive', device_color: '#FFD700' };
  }
  if (portSet.has(1194) || portSet.has(1723) || portSet.has(500) || portSet.has(4500) || cpeLower.some((c) => /openvpn|wireguard/.test(c))) {
    return { device_type: 'VPN Gateway', device_icon: 'ShieldCheck', device_color: '#D4AF37' };
  }
  if (portSet.has(3389)) {
    return { device_type: 'Windows Workstation', device_icon: 'Monitor', device_color: '#E040FB' };
  }
  if (portSet.has(22) && !portSet.has(80) && !portSet.has(443)) {
    return { device_type: 'Linux Server', device_icon: 'Terminal', device_color: '#76FF03' };
  }
  if (portSet.has(80) || portSet.has(443) || portSet.has(8080) || portSet.has(8443)) {
    return { device_type: 'Web Server', device_icon: 'Globe', device_color: '#448AFF' };
  }
  return { device_type: 'Unknown Host', device_icon: 'CircleDot', device_color: '#666666' };
}

export function assessRisk(
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

export async function batchFetch<T>(
  urls: string[],
  concurrency: number,
  fn: (url: string) => Promise<T | null>,
  onProgress?: (done: number) => void
): Promise<(T | null)[]> {
  const results: (T | null)[] = new Array(urls.length).fill(null);
  let idx = 0;
  let completed = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (idx < urls.length) {
      const i = idx++;
      results[i] = await fn(urls[i]);
      completed++;
      if (onProgress) onProgress(completed);
    }
  });
  await Promise.all(workers);
  return results;
}

/** IANA service names for the ports Shodan sees most, so a keyless result
 *  (port numbers only) still reads as services. */
const WELL_KNOWN_PORTS: Record<number, string> = {
  21: 'ftp', 22: 'ssh', 23: 'telnet', 25: 'smtp', 53: 'dns', 69: 'tftp', 80: 'http',
  102: 's7', 110: 'pop3', 111: 'rpcbind', 123: 'ntp', 135: 'msrpc', 137: 'netbios-ns',
  139: 'netbios-ssn', 143: 'imap', 161: 'snmp', 179: 'bgp', 389: 'ldap', 443: 'https',
  445: 'smb', 465: 'smtps', 500: 'ike', 502: 'modbus', 514: 'syslog', 515: 'printer',
  554: 'rtsp', 587: 'submission', 631: 'ipp', 636: 'ldaps', 873: 'rsync', 993: 'imaps',
  995: 'pop3s', 1080: 'socks', 1194: 'openvpn', 1433: 'mssql', 1521: 'oracle',
  1723: 'pptp', 1883: 'mqtt', 1900: 'upnp', 2049: 'nfs', 2082: 'cpanel', 2083: 'cpanel-ssl',
  2181: 'zookeeper', 2375: 'docker', 2376: 'docker-tls', 3000: 'http-alt', 3306: 'mysql',
  3389: 'rdp', 4500: 'ipsec-nat', 5000: 'upnp/http', 5060: 'sip', 5061: 'sips',
  5432: 'postgresql', 5601: 'kibana', 5672: 'amqp', 5900: 'vnc', 5984: 'couchdb',
  6379: 'redis', 6443: 'kubernetes', 7547: 'cwmp', 8000: 'http-alt', 8008: 'http-alt',
  8080: 'http-proxy', 8081: 'http-alt', 8088: 'http-alt', 8291: 'winbox', 8443: 'https-alt',
  8554: 'rtsp-alt', 8883: 'mqtt-tls', 8888: 'http-alt', 9000: 'http-alt', 9090: 'http-alt',
  9100: 'jetdirect', 9200: 'elasticsearch', 10000: 'webmin', 11211: 'memcached',
  20000: 'dnp3', 27017: 'mongodb', 47808: 'bacnet',
};

export function portServiceName(port: number): string | undefined {
  return WELL_KNOWN_PORTS[port];
}
