/**
 * ═══════════════════════════════════════════════════════════════
 *  OSIRIS — API Catalog
 *  Machine-readable description of every public route under /api.
 *  Kept in sync by hand with src/app/api/ * /route.ts
 * ═══════════════════════════════════════════════════════════════
 */

export type HttpMethod = 'GET' | 'POST' | 'DELETE';

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
  /** Request headers the route reads, shown in the snippets with placeholder values */
  headers?: Record<string, string>;
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
          'kp_available',
          'kp_timestamp',
          'storm_level',
          'storm_color',
          'solar_flares',
          'alerts',
          'timestamp',
        ],
        notes:
          '`storm_color` is a hex string the HUD renders directly, so clients need no severity lookup table. `kp_index` is null and `storm_level` is "Unknown" when NOAA did not answer — absence of a reading is never reported as "Quiet".',
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
        returns: ['countries', 'methodology', 'exchanges', 'open_exchanges', 'total_exchanges', 'timestamp'],
        notes:
          '`base_risk` is a hand-assigned editorial ordering, not a calibrated or back-tested figure — `methodology.basis` says so on every response. `quake_magnitude` is the observed USGS component, reported separately so the two are not conflated.',
      },
      {
        path: '/api/region-dossier',
        method: 'GET',
        summary: 'Composite intelligence summary for a map location — the panel behind a map double right-click.',
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
        summary: 'Telegram OSINT posts with the declared lean of each channel, media, cross-posts and a per-source health report. risk_score is a keyword count, not a model output, and coords are preset country anchors.',
        returns: ['news', 'total', 'sources', 'timestamp'],
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
        path: '/api/cctv/frame',
        method: 'GET',
        summary: "A still camera's current frame, for the built-in detector (AI Analyze, OI Assist, forecasts).",
        params: [{ name: 'id', required: true, desc: 'Camera id from /api/cctv.' }],
        returns: ['image/jpeg | image/png | image/webp | image/gif', 'X-Frame-At header'],
        notes: 'Takes a camera id, never a URL: only cameras in the OSIRIS catalogue. Frames are held for 4 s; 90 requests a minute per client.',
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
        summary: 'Listed botnet C2 servers from abuse.ch Feodo Tracker — blocklist entries, not observed attacks.',
        returns: ['indicators', 'total', 'online', 'fetched_at', 'source', 'source_url'],
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
        summary: 'One-click read-out for the Alerts or Markets panel. Alerts also return a structured brief: threads by theatre, perspective and seismic summary.',
        returns: ['mode', 'overview', 'highlights', 'generatedBy', 'generatedAt', 'brief'],
        bodyExample: `{
  "mode": "alerts",
  "payload": {
    "news": [{ "id": "a1", "title": "Drone attack on Kharkiv", "source": "t.me/liveuamap", "bloc": "western", "published": "2026-09-17T11:00:00Z" }],
    "earthquakes": [{ "magnitude": 5.4, "place": "80 km S of Kuril", "time": 1789646400000 }]
  }
}`,
      },
    ],
  },
  {
    id: 'oi',
    title: 'OI (Assist & Prediction)',
    blurb:
      'OI Assist, a model on your own key that works the map in conversation, and a prediction engine on live OSIRIS intelligence: it casts the actors who decide a question, plays them against each other over dated periods in several parallel worlds, and a report agent writes the predicted path with a calibrated figure. Your model key is sent in headers and never stored. Also served as an MCP server at /api/mcp; see OI guide.',
    endpoints: [
      {
        path: '/api/oi',
        method: 'GET',
        summary: 'What the service offers: providers and their default models, run depths and their model-call counts, limits and endpoints.',
        returns: ['name', 'version', 'credit', 'providers', 'depths', 'limits', 'auth', 'endpoints'],
      },
      {
        path: '/api/oi/models',
        method: 'POST',
        summary: 'The models your key can use, straight from the provider. Doubles as a key check: a rejected key fails here, before a run spends anything.',
        returns: ['provider', 'ok', 'listed', 'models', 'default'],
        headers: { 'X-OI-Key': '$YOUR_MODEL_KEY' },
        requiresAuth: true,
        notes: 'Providers: `openai`, `anthropic`, `google`, `openrouter`, `groq`, `deepseek`, `xai`, `mistral`, `qwen`. 401 when the provider rejects the key, 402 when the account is out of credit. 20 checks per minute per address.',
        bodyExample: `{
  "provider": "openai"
}`,
      },
      {
        path: '/api/oi/runs',
        method: 'POST',
        summary: 'Start a prediction. Answers 202 at once with the run id, a link to watch it on the globe, and a run token for steering it.',
        returns: ['id', 'status', 'phase', 'watch_url', 'events_url', 'run_token', 'progress'],
        headers: { 'X-OI-Provider': 'openai', 'X-OI-Key': '$YOUR_MODEL_KEY', 'X-OI-Model': 'gpt-5-mini' },
        requiresAuth: true,
        notes: '`depth` is `quick` (4 actors × 3 periods × 2 worlds, about 34 model calls), `standard` (6 × 4 × 3, about 88) or `deep` (7 × 4 × 4, about 132). A world that settles early stops spending calls. `seed` takes up to 100,000 characters of your own data (about 25,000 input tokens), read once by the world model; with `seed_scope: "panel"` every actor’s move and the report agent also read its first 8,000 characters, at about 2,000 more input tokens a call. `use_feeds` (default true) has the run research the question first (recent news with its links, from GDELT and Wikipedia’s Current events, and Wikipedia background) and read OSIRIS news, quakes and markets; the actors quote these sources by id: articles (`w`), market data (`q`), prediction markets (`m`), background (`b`), the live feeds (`c`). Keep `run_token`: it is not shown again. Two runs at once and eight per ten minutes per address.',
        bodyExample: `{
  "question": "Will Brent crude settle above $90 on 31 December 2026?",
  "depth": "standard",
  "use_feeds": true
}`,
      },
      {
        path: '/api/oi/runs/{id}',
        method: 'GET',
        summary: 'A run summary: phase and progress, the simulated periods, the worlds pooled period by period, each world with its events, the cast with their personas, and once written, the report: the predicted path, what each actor does, how each world ended, drivers, scenarios, signposts and dissent, with the sources they quote.',
        params: [
          { name: 'wait', desc: 'Seconds (up to 55) to wait for the run to finish before answering.', example: '30' },
          { name: 'view', desc: '`full` returns every event so far, to rebuild the whole run.', example: 'full' },
        ],
        returns: ['id', 'status', 'phase', 'kind', 'answer', 'probability_pct', 'outcomes', 'unit', 'proposition', 'measure', 'baseline', 'market', 'progress', 'periods', 'pooled', 'report', 'actors', 'worlds', 'sources', 'injected', 'usage', 'watch_url'],
        notes: '`kind` is `binary` (a probability of YES), `choice` (a share for each of `outcomes`) or `number` (an `estimate` with an 80% `low`–`high` range, in `unit`); `answer` says it in words either way. On a question about a price, `measure` names it (ticker, level, side, touch or close), and `baseline` gives the statistical baseline from its own history (`probability_pct` or a `p10`–`p90` range) and, once the run is done, `simulated`: the worlds’ events priced across the market’s own paths. `market` is the id of the source (an `odds` source, with `odds.probability_pct`) that is a prediction market on this same question. Anyone with the id can read a run: that is how a prediction is shared. Runs are kept for three hours after they finish.',
      },
      {
        path: '/api/oi/runs/{id}/events',
        method: 'GET',
        summary: 'The run as it happens, over Server-Sent Events: phases, actors and relations, the cast and the simulated clock, every move, event and world standing, the worlds pooled after each period, injected events and the report.',
        returns: ['…SSE event stream'],
        notes: 'Each event is `id: <seq>` and `data: <json>`, with a `t` field naming its type. The stream replays from the start, follows live, and closes after `end`. Reconnect with `Last-Event-ID` (or `?after=<seq>`) to resume.',
      },
      {
        path: '/api/oi/trending',
        method: 'GET',
        summary: 'What the world is betting on: the busiest open questions on Polymarket that can be predicted (not games, at least two weeks out), each with the crowd’s price of YES. No key; kept ten minutes.',
        returns: ['items[].question', 'items[].probability', 'items[].event', 'items[].url', 'items[].closes'],
      },
      {
        path: '/api/oi/assist',
        method: 'POST',
        summary: "One step of an OI Assist conversation: send the conversation and what is on the map; get back what OI says and the actions it wants taken (go_to, layers, find, highlight, show, markets, open, map_view, forecast, clear).",
        returns: ['step.say', 'step.actions', 'step.done', 'usage'],
        headers: { 'X-OI-Provider': 'openai', 'X-OI-Key': '$YOUR_MODEL_KEY' },
        requiresAuth: true,
        notes: 'Stateless: the conversation lives with the caller. Carry out the actions, and while `done` is false send their results back as a `tool` message for the next step. 40 steps per minute per address.',
        bodyExample: `{
  "messages": [{ "role": "user", "text": "Military aircraft near Frankfurt", "mode": "research" }],
  "context": { "view": { "lat": 50.1, "lng": 8.7, "zoom": 6 }, "layersOn": ["military"], "loaded": { "military_flights": 104 } }
}`,
      },
      {
        path: '/api/oi/runs/{id}/ask',
        method: 'POST',
        summary: 'Question the report agent, or any actor that played (by id), about a run. Uses your key again.',
        returns: ['id', 'target', 'reply'],
        headers: { 'X-OI-Key': '$YOUR_MODEL_KEY' },
        requiresAuth: true,
        notes: "Provider and model default to the run's own; send `X-OI-Provider` and `X-OI-Model` to ask on another. 20 questions per minute per address.",
        bodyExample: `{
  "target": "report",
  "message": "What would change this prediction most?"
}`,
      },
      {
        path: '/api/oi/runs/{id}/inject',
        method: 'POST',
        summary: "God's-eye view: drop an event into a running simulation. It happens in every world in the next period of simulated time.",
        returns: ['id', 'queued', 'lands_in_period'],
        headers: { 'X-OI-Run-Token': '$RUN_TOKEN' },
        requiresAuth: true,
        notes: 'Needs the run token from the start response. Up to eight events per run; refused once the report is being written.',
        bodyExample: `{
  "text": "OPEC+ calls an emergency meeting for Friday"
}`,
      },
      {
        path: '/api/oi/runs/{id}',
        method: 'DELETE',
        summary: 'Cancel a running prediction.',
        returns: ['id', 'cancelled', 'status'],
        headers: { 'X-OI-Run-Token': '$RUN_TOKEN' },
        requiresAuth: true,
      },
      {
        path: '/api/mcp',
        method: 'POST',
        summary: 'OI and live OSIRIS intelligence as an MCP server (Streamable HTTP, stateless) for agents such as Hermes, Claude and Cursor.',
        returns: ['jsonrpc', 'id', 'result'],
        headers: { Accept: 'application/json, text/event-stream', 'X-OI-Provider': 'openai', 'X-OI-Key': '$YOUR_MODEL_KEY' },
        notes: 'Tools: `oi_predict`, `oi_get_run`, `oi_ask`, `oi_inject`, `oi_cancel`, `oi_info`, and the free `osiris_world_brief`, `osiris_markets` and `osiris_trending`, which need no key. A call that waits on a forecast streams progress notifications when the client accepts SSE. Protocol versions 2025-06-18, 2025-03-26 and 2024-11-05.',
        bodyExample: `{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list"
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
