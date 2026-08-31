/**
 * ═══════════════════════════════════════════════════════════════
 *  OSIRIS — API Catalog
 *  Machine-readable description of every public route under /api.
 *  Kept in sync by hand with src/app/api/ * /route.ts
 * ═══════════════════════════════════════════════════════════════
 */

export type HttpMethod = 'GET' | 'POST';

export interface ApiParam {
  name: string;
  required?: boolean;
  desc: string;
  example?: string;
}

export interface ApiEndpoint {
  /** Path relative to the deployment origin, e.g. `/api/flights` */
  path: string;
  method: HttpMethod | HttpMethod[];
  summary: string;
  /** Query-string parameters (GET) */
  params?: ApiParam[];
  /** Top-level keys present on a 2xx response */
  returns: string[];
  /** Free-form notes: caching, auth, upstream source, failure modes */
  notes?: string;
  /** Environment variables the route reads */
  env?: string[];
  /** Pretty-printed JSON request body, for POST routes */
  bodyExample?: string;
  /** True when the route needs a credential the docs cannot supply */
  requiresAuth?: boolean;
}

/** Stable DOM id / deep-link anchor for an endpoint. */
export function endpointId(ep: ApiEndpoint): string {
  const method = Array.isArray(ep.method) ? ep.method[0] : ep.method;
  return `ep-${method}-${ep.path.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')}`.toLowerCase();
}

/** Example request URL with required params filled from their documented examples. */
export function sampleUrl(ep: ApiEndpoint, origin = ''): string {
  const qs = (ep.params || [])
    .filter(p => p.required || p.example)
    .map(p => `${p.name}=${encodeURIComponent((p.example || '').split(' | ')[0] || 'value')}`)
    .join('&');
  return `${origin}${ep.path}${qs ? `?${qs}` : ''}`;
}

export interface ApiGroup {
  id: string;
  title: string;
  blurb: string;
  endpoints: ApiEndpoint[];
}

export const API_GROUPS: ApiGroup[] = [
  {
    id: 'system',
    title: 'System',
    blurb: 'Liveness and aggregate counters. Safe to poll from monitoring.',
    endpoints: [
      {
        path: '/api/health',
        method: 'GET',
        summary: 'Liveness probe. Never touches an upstream feed, so it stays fast under load.',
        returns: ['status', 'platform', 'version', 'uptime', 'timestamp', 'endpoints'],
        notes: '`status` is the literal string `operational`. `uptime` is process uptime in seconds.',
      },
      {
        path: '/api/stats',
        method: 'GET',
        summary:
          'Fans out to the heavy feeds in parallel and returns only the counts — roughly 100 bytes instead of 10 MB of GeoJSON.',
        returns: ['stats', 'timestamp'],
        notes:
          '`stats` contains `flights`, `sats`, `cctv`, `weather`, `nuclear`, `incidents`. Cached `s-maxage=30, stale-while-revalidate=60`, so 10k concurrent dashboard boots collapse into one upstream fetch per minute.',
      },
    ],
  },
  {
    id: 'aviation-space',
    title: 'Aviation & Space',
    blurb: 'Aircraft, orbital objects, and heliophysics.',
    endpoints: [
      {
        path: '/api/flights',
        method: 'GET',
        summary: 'Live ADS-B aircraft, bucketed by class.',
        returns: ['commercial_flights', 'private_flights', 'private_jets', 'military_flights', 'source'],
        notes:
          'Keyless via adsb.lol. Each bucket is an array; sum them for a total. `OPENSKY_CLIENT_ID` / `OPENSKY_CLIENT_SECRET` are reserved for higher rate limits and are not required.',
      },
      {
        path: '/api/satellites',
        method: 'GET',
        summary: 'Tracked orbital objects with TLE-derived positions.',
        returns: ['satellites', 'total', 'category_counts', 'raw_count', 'timestamp'],
        notes: 'Sourced from celestrak.org. `category_counts` breaks the set down by mission type.',
      },
      {
        path: '/api/space-weather',
        method: 'GET',
        summary: 'Geomagnetic conditions and solar flare activity from NOAA SWPC.',
        returns: [
          'kp_index',
          'kp_timestamp',
          'storm_level',
          'storm_color',
          'solar_flares',
          'alerts',
          'timestamp',
        ],
        notes: '`storm_color` is a hex string the HUD renders directly, so clients need no severity lookup table.',
      },
    ],
  },
  {
    id: 'earth',
    title: 'Earth & Environment',
    blurb: 'Seismic, fire, atmospheric, and orbital-imagery feeds.',
    endpoints: [
      {
        path: '/api/earthquakes',
        method: 'GET',
        summary: 'Recent seismic events from the USGS feed.',
        returns: ['earthquakes', 'total', 'timestamp'],
        notes: 'M2.5+ over the trailing day. Each event carries `magnitude`, `place`, `depth`, `time`, `tsunami`, `alert`.',
      },
      {
        path: '/api/fires',
        method: 'GET',
        summary: 'Active wildfire hotspots from NASA FIRMS.',
        returns: ['fires', 'total', 'source', 'timestamp'],
        env: ['FIRMS_API_KEY'],
        notes: 'Uses the keyless FIRMS CSV by default; the key only matters if you switch to the per-area API.',
      },
      {
        path: '/api/weather',
        method: 'GET',
        summary: 'Severe weather and natural events from NASA EONET.',
        returns: ['events', 'total', 'timestamp'],
      },
      {
        path: '/api/air-quality',
        method: 'GET',
        summary: 'Ground station air quality readings.',
        returns: ['stations', 'total', 'timestamp'],
      },
      {
        path: '/api/radar',
        method: 'GET',
        summary: 'GPS interference and navigation outage reporting.',
        returns: ['outages', 'total', 'source', 'timestamp'],
      },
      {
        path: '/api/sentinel',
        method: 'GET',
        summary: 'Sentinel satellite imagery scenes covering a point.',
        params: [
          { name: 'lat', required: true, desc: 'Latitude of the point of interest.', example: '51.5072' },
          { name: 'lng', required: true, desc: 'Longitude of the point of interest.', example: '-0.1276' },
          { name: 'radius', desc: 'Search radius in kilometres.', example: '50' },
          { name: 'days', desc: 'How far back to search, in days.', example: '30' },
        ],
        returns: ['scenes', 'timestamp'],
      },
    ],
  },
  {
    id: 'geopolitical',
    title: 'Geopolitical',
    blurb: 'Conflict zones, frontlines, event streams, and country-level risk.',
    endpoints: [
      {
        path: '/api/conflicts',
        method: 'GET',
        summary: 'Active conflict zones joined with live incident reporting.',
        returns: [
          'zones',
          'activeWarzones',
          'liveEvents',
          'totalZones',
          'totalLiveEvents',
          'sources',
          'refreshInterval',
          'timestamp',
        ],
        notes: '`refreshInterval` is the server’s recommended client poll interval in milliseconds — honour it rather than hard-coding your own.',
      },
      {
        path: '/api/frontlines',
        method: 'GET',
        summary: 'Frontline geometry for active theatres.',
        returns: ['frontlines', 'timestamp'],
      },
      {
        path: '/api/gdelt',
        method: 'GET',
        summary: 'Geocoded world events from the GDELT project.',
        returns: ['events', 'total', 'source', 'timestamp'],
      },
      {
        path: '/api/country-risk',
        method: 'GET',
        summary: 'Per-country risk scoring alongside market session state.',
        returns: ['countries', 'exchanges', 'open_exchanges', 'total_exchanges', 'timestamp'],
      },
      {
        path: '/api/region-dossier',
        method: 'GET',
        summary: 'Composite intelligence summary for a map location — the panel behind a map right-click.',
        params: [
          { name: 'lat', required: true, desc: 'Latitude of the region.', example: '48.3794' },
          { name: 'lng', required: true, desc: 'Longitude of the region.', example: '31.1656' },
        ],
        returns: ['coordinates', '…dossier sections'],
      },
    ],
  },
  {
    id: 'media-markets',
    title: 'Media & Markets',
    blurb: 'News aggregation, live broadcast streams, and financial instruments.',
    endpoints: [
      {
        path: '/api/news',
        method: 'GET',
        summary: 'Aggregated OSINT news items.',
        returns: ['news', 'total', 'timestamp'],
      },
      {
        path: '/api/live-news',
        method: 'GET',
        summary: '24/7 broadcast streams grouped by category.',
        returns: ['feeds', 'categories', 'total', 'timestamp'],
      },
      {
        path: '/api/markets',
        method: 'GET',
        summary: 'Defence-sector equities and commodities.',
        returns: ['stocks', 'timestamp'],
      },
      {
        path: '/api/crypto',
        method: 'GET',
        summary: 'Spot prices for the assets shown in the status ticker.',
        returns: ['…price series'],
      },
      {
        path: '/api/scm-suppliers',
        method: 'GET',
        summary: 'Supply-chain suppliers with criticality flags.',
        returns: ['suppliers', 'total', 'critical_count', 'timestamp'],
      },
    ],
  },
  {
    id: 'surveillance',
    title: 'Surveillance & Infrastructure',
    blurb: 'Camera networks, fixed infrastructure, maritime traffic, and tile/stream proxies.',
    endpoints: [
      {
        path: '/api/cctv',
        method: 'GET',
        summary: 'Public camera networks, optionally filtered by region or radius.',
        params: [
          { name: 'region', desc: 'Restrict to a named provider region.', example: 'london' },
          { name: 'lat', desc: 'Latitude for a radius search.', example: '51.5072' },
          { name: 'lng', desc: 'Longitude for a radius search.', example: '-0.1276' },
          { name: 'radius', desc: 'Radius in kilometres. Requires `lat` and `lng`.', example: '25' },
        ],
        returns: ['cameras', 'regions', 'total', 'timestamp'],
      },
      {
        path: '/api/cctv/stream-status',
        method: 'GET',
        summary: 'Probes whether a camera stream is reachable before the player commits to it.',
        params: [{ name: 'url', required: true, desc: 'Stream URL to probe.' }],
        returns: ['available', 'blocked', 'provider', 'reason'],
        notes: '`blocked` distinguishes an upstream refusing our origin from a stream that is simply offline.',
      },
      {
        path: '/api/cctv/proxy',
        method: 'GET',
        summary: 'Same-origin proxy for camera streams that set restrictive CORS headers.',
        params: [{ name: 'url', required: true, desc: 'Upstream stream URL.' }],
        returns: ['domain', 'failed', 'error'],
        notes: 'Allow-listed by domain. Not a general-purpose open proxy.',
      },
      {
        path: '/api/infrastructure',
        method: 'GET',
        summary: 'Fixed strategic infrastructure — nuclear sites, plants, and facilities.',
        returns: ['infrastructure', 'total', 'timestamp'],
      },
      {
        path: '/api/maritime',
        method: 'GET',
        summary: 'Ports, chokepoints, and vessel positions.',
        returns: ['ports', 'chokepoints', 'ships', 'total_ports', 'total_chokepoints', 'total_ships', 'timestamp'],
        env: ['AIS_API_KEY'],
      },
      {
        path: '/api/arcgis',
        method: 'GET',
        summary: 'Queries a configured ArcGIS feature service.',
        params: [
          { name: 'service', desc: 'Service identifier to query.' },
          { name: 'q', desc: 'Attribute query string.' },
          { name: 'bbox', desc: 'Bounding box filter, `minLng,minLat,maxLng,maxLat`.' },
        ],
        returns: ['…feature collection'],
      },
      {
        path: '/api/proxy-tiles',
        method: 'GET',
        summary: 'Same-origin raster tile proxy for basemaps that block cross-origin reads.',
        params: [{ name: 'url', required: true, desc: 'Upstream tile URL.' }],
        returns: ['…binary tile'],
      },
      {
        path: '/api/geo',
        method: 'GET',
        summary: 'Geolocates the calling client by IP.',
        returns: ['status', 'query', 'city', 'regionName', 'country', 'lat', 'lon', 'isp', 'org'],
      },
    ],
  },
  {
    id: 'cyber',
    title: 'Cyber Threat',
    blurb: 'Vulnerability, attack, and malware telemetry.',
    endpoints: [
      {
        path: '/api/cyber-threats',
        method: 'GET',
        summary: 'Recent CVE disclosures with rollup statistics.',
        returns: ['threats', 'stats'],
      },
      {
        path: '/api/cyber-attacks',
        method: 'GET',
        summary: 'Observed attack events for the live threat map.',
        returns: ['attacks', 'total'],
      },
      {
        path: '/api/malware',
        method: 'GET',
        summary: 'Live malware hosts from abuse.ch URLhaus, geolocated per address.',
        returns: ['threats', 'total', 'cursor', 'last_poll', 'stream', 'source', 'timestamp'],
      },
      {
        path: '/api/malware/stream',
        method: 'GET',
        summary:
          'Server-sent events for the malware layer: a snapshot on connect, then new detections as URLhaus reports them.',
        returns: ['snapshot', 'detections', 'status', 'heartbeat'],
      },
    ],
  },
  {
    id: 'osint',
    title: 'OSINT Toolkit',
    blurb:
      'The lookup tools behind the RECON panel. Every route takes a single subject and returns a normalised result, so they compose well in scripts.',
    endpoints: [
      {
        path: '/api/osint/dns',
        method: 'GET',
        summary: 'Resolves A, AAAA, MX, NS, TXT, and SOA records.',
        params: [{ name: 'domain', required: true, desc: 'Domain to resolve.', example: 'example.com' }],
        returns: ['…record sets'],
      },
      {
        path: '/api/osint/whois',
        method: 'GET',
        summary: 'Registration and registrar detail for a domain.',
        params: [{ name: 'domain', required: true, desc: 'Domain to look up.', example: 'example.com' }],
        returns: ['…registration record'],
      },
      {
        path: '/api/osint/certs',
        method: 'GET',
        summary: 'Certificate transparency search — an effective passive subdomain enumerator.',
        params: [{ name: 'domain', required: true, desc: 'Apex domain to search.', example: 'example.com' }],
        returns: ['certificates', 'subdomains', 'total_certs', 'unique_subdomains', 'timestamp'],
      },
      {
        path: '/api/osint/ip',
        method: 'GET',
        summary: 'Geolocation, ASN, and network ownership for an address.',
        params: [{ name: 'ip', required: true, desc: 'IPv4 or IPv6 address.', example: '8.8.8.8' }],
        returns: ['…address record'],
      },
      {
        path: '/api/osint/shodan',
        method: 'GET',
        summary: 'Exposed services, banners, and known vulnerabilities for a host.',
        params: [{ name: 'ip', required: true, desc: 'Address to query.', example: '8.8.8.8' }],
        returns: ['status', 'ports', 'hostnames', 'cpes', 'vulns', 'tags', 'detail'],
      },
      {
        path: '/api/osint/bgp',
        method: 'GET',
        summary: 'ASN, prefix, and peering relationships.',
        params: [{ name: 'query', required: true, desc: 'ASN, prefix, or IP.', example: 'AS15169' }],
        returns: ['…routing record'],
      },
      {
        path: '/api/osint/mac',
        method: 'GET',
        summary: 'Resolves a MAC address or OUI prefix to its hardware vendor.',
        params: [{ name: 'mac', required: true, desc: 'MAC address or OUI prefix.', example: '00:1A:2B:3C:4D:5E' }],
        returns: ['mac', 'prefix', 'vendor', 'address', 'detail'],
      },
      {
        path: '/api/osint/phone',
        method: 'GET',
        summary: 'Validates and classifies a phone number in E.164 form.',
        params: [{ name: 'number', required: true, desc: 'Number in international format.', example: '+442071234567' }],
        returns: [
          'valid',
          'number',
          'country_code',
          'region',
          'line_type',
          'national',
          'international',
          'lat',
          'query',
        ],
      },
      {
        path: '/api/osint/github',
        method: 'GET',
        summary: 'Public profile metadata for a GitHub account.',
        params: [{ name: 'user', required: true, desc: 'GitHub username.', example: 'torvalds' }],
        returns: ['username', 'name', 'bio', 'company', 'location', 'blog', 'email', 'twitter', 'public_repos'],
      },
      {
        path: '/api/osint/leaks',
        method: 'GET',
        summary: 'Checks an address against known breach corpora.',
        params: [{ name: 'email', required: true, desc: 'Email address to check.' }],
        returns: ['breached', 'breaches', 'data_exposed', 'detail'],
      },
      {
        path: '/api/osint/hudsonrock',
        method: 'GET',
        summary: 'Reports whether an asset appears in Hudson Rock\'s infostealer corpus — machines compromised by credential-stealing malware.',
        params: [
          { name: 'query', required: true, desc: 'Email, domain, username or phone number.', example: 'tesla.com' },
          { name: 'type', required: false, desc: 'Pins the asset type instead of inferring it: email, domain, username or phone.', example: 'domain' },
        ],
        returns: ['query', 'type', 'compromised', 'stealers', 'total_corporate_services', 'total_user_services', 'totalStealers', 'employees', 'users'],
      },
      {
        path: '/api/osint/cve',
        method: 'GET',
        summary: 'Full NVD record for a single CVE identifier.',
        params: [{ name: 'cve', required: true, desc: 'CVE ID.', example: 'CVE-2021-44228' }],
        returns: ['id', 'description', 'cvss', 'cvss_vector', 'severity', 'published', 'references', 'source'],
      },
      {
        path: '/api/osint/sanctions',
        method: 'GET',
        summary: 'Searches the OpenSanctions mirror of the US OFAC SDN list.',
        params: [
          { name: 'query', required: true, desc: 'Name of a person, organisation, or vessel.' },
          { name: 'schema', desc: 'Entity type filter.', example: 'Person | Organization | Vessel' },
          { name: 'limit', desc: 'Maximum results to return.', example: '10' },
        ],
        returns: ['schema', 'total', 'source', 'timestamp'],
      },
      {
        path: '/api/osint/threats',
        method: 'GET',
        summary: 'Reputation and threat-intel enrichment for an indicator.',
        params: [{ name: 'query', required: true, desc: 'IP, domain, or file hash.' }],
        returns: ['…enrichment record'],
      },
      {
        path: '/api/osint/sweep',
        method: 'GET',
        summary: 'Sweeps a single address or a CIDR range for reachable hosts.',
        params: [
          { name: 'ip', desc: 'Single address to sweep.' },
          { name: 'cidr', desc: 'CIDR range to sweep. Use instead of `ip`.', example: '192.0.2.0/24' },
        ],
        returns: ['target_ip', '…sweep results'],
        notes: 'Only sweep ranges you are authorised to test.',
      },
    ],
  },
  {
    id: 'recon',
    title: 'Recon Scanner',
    blurb: 'Active scanning, delegated to a separate backend so the web tier never runs scans itself.',
    endpoints: [
      {
        path: '/api/scanner',
        method: 'GET',
        summary: 'Runs a scan against a target via the OSIRIS scanner backend.',
        params: [
          {
            name: 'type',
            required: true,
            desc: 'Scan type.',
            example: 'quick | ssl | headers | rdns | subdomains | tech | whois | geoloc | vuln',
          },
          { name: 'target', required: true, desc: 'Host, domain, or address to scan.' },
        ],
        returns: ['detail', 'hint', 'failed', 'error'],
        env: ['SCANNER_URL', 'SCANNER_KEY'],
        notes:
          'Returns 503 when `SCANNER_URL` / `SCANNER_KEY` are unset — that is the supported way to disable RECON. `SCANNER_KEY` must equal the backend’s `OSIRIS_KEY`.',
      },
    ],
  },
  {
    id: 'graph',
    title: 'Entity Graph',
    blurb: 'Link analysis over entities surfaced elsewhere in the platform.',
    endpoints: [
      {
        path: '/api/entity/expand',
        method: 'GET',
        summary: 'Expands one graph node into its neighbours.',
        params: [
          { name: 'id', required: true, desc: 'Entity identifier to expand.' },
          { name: 'type', required: true, desc: 'Entity type, which selects the expansion strategy.' },
        ],
        returns: ['…nodes and edges'],
      },
    ],
  },
  {
    id: 'ai',
    title: 'AI Analysis',
    blurb:
      'Gemini-backed correlation over feed data you supply. All three are POST, all three are rate limited to 5 requests per minute per IP.',
    endpoints: [
      {
        path: '/api/ai/analyze',
        method: 'POST',
        summary: 'Cross-feed correlation and threat assessment over an intelligence context.',
        returns: ['…analysis'],
        notes:
          'Body is an `IntelligenceContext`. Exceeding the limit returns 429. Feed it straight from the read endpoints — the shape matches what they return.',
        bodyExample: `{
  "earthquakes": [],
  "news": [],
  "threats": [],
  "cyberAlerts": [],
  "timestamp": "2026-07-29T12:00:00Z"
}`,
      },
      {
        path: '/api/ai/briefing',
        method: 'POST',
        summary: 'Structured threat briefing in the style of a daily intelligence product.',
        returns: ['…briefing'],
        notes: 'Same `IntelligenceContext` body and same rate limit as `/api/ai/analyze`.',
        bodyExample: `{
  "earthquakes": [],
  "news": [],
  "threats": [],
  "cyberAlerts": [],
  "timestamp": "2026-07-29T12:00:00Z"
}`,
      },
      {
        path: '/api/ai/overview',
        method: 'POST',
        summary: 'Short headline highlights for the overview panel.',
        returns: ['highlights', 'generatedAt'],
        bodyExample: `{
  "earthquakes": [],
  "news": [],
  "threats": [],
  "cyberAlerts": [],
  "timestamp": "2026-07-29T12:00:00Z"
}`,
      },
    ],
  },
  {
    id: 'sdk',
    title: 'Polybolos SDK',
    blurb:
      'Push entities from an external platform into the Common Operating Picture, and stream the merged picture back out.',
    endpoints: [
      {
        path: '/api/sdk/ingest',
        method: 'POST',
        summary: 'Accepts Polybolos-format entities from an external system and merges them into the map.',
        returns: ['accepted', 'rejected', 'errors', 'timestamp'],
        env: ['SDK_INGEST_KEY'],
        requiresAuth: true,
        notes:
          'Each entity needs `id`, `position.lat`, and `position.lng`; everything else is defaulted. Stored ids are namespaced to `ext-{source}-{id}`, so two platforms can push the same id safely. Fails closed: 503 when `SDK_INGEST_KEY` is unset, 401 on key mismatch, 400 on a malformed payload.',
        bodyExample: `{
  "source": "lattice",
  "apiKey": "$SDK_INGEST_KEY",
  "entities": [
    {
      "id": "TRK-4471",
      "name": "UNKNOWN SURFACE CONTACT",
      "domain": "SEA",
      "entityType": "TRACK",
      "position": { "lat": 36.14, "lng": -5.35, "heading": 271, "speed": 14.2 },
      "threat": "UNKNOWN",
      "classification": "UNCLASSIFIED",
      "confidence": 0.86
    }
  ]
}`,
      },
      {
        path: '/api/sdk/ingest',
        method: 'GET',
        summary: 'Reports how many external entities are currently held, plus recent ingest history.',
        returns: ['sdk', 'version', 'entityCount', 'recentIngestions', 'timestamp'],
      },
      {
        path: '/api/sdk/stream',
        method: 'GET',
        summary: 'Server-Sent Events stream of normalised entities as they arrive.',
        returns: ['…SSE event stream'],
        notes:
          'Opens with a `status` event carrying `connected`, `entityCount`, `feedCount`, `latticeStatus`, and `lastUpdate`. Consume with `EventSource`, not `fetch`.',
      },
    ],
  },
  {
    id: 'webhooks',
    title: 'Webhooks',
    blurb: 'Inbound hooks from external services.',
    endpoints: [
      {
        path: '/api/github-webhook',
        method: 'POST',
        summary: 'Receives GitHub repository events.',
        returns: ['success', 'message', 'error'],
        requiresAuth: true,
        notes: 'Signature-verified. Unsigned or mismatched deliveries are rejected with 401.',
      },
    ],
  },
];

/** Total endpoint count, derived rather than hard-coded so it cannot drift. */
export const ENDPOINT_COUNT = API_GROUPS.reduce((n, g) => n + g.endpoints.length, 0);
