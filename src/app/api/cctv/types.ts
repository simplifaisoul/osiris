export type CctvStreamType = 'jpg' | 'hls' | 'iframe' | 'mjpeg' | 'mp4';

export interface CctvCamera {
  id: string;
  lat: number;
  lng: number;
  name: string;
  city: string;
  country: string;
  /** Static image URL (MJPEG/JPG snapshot) */
  feed_url?: string;
  /** Live video stream (HLS .m3u8) or embed URL (YouTube/rtsp.me) */
  stream_url?: string;
  stream_type?: CctvStreamType;
  external_url?: string;
  source: string;
}

/*
 * Hosts whose still images a browser cannot load straight from the source.
 * infobanjirjps.selangor.gov.my — Selangor's flood cameras — serves over
 * plain http, which an https page blocks as mixed content, so the picture is
 * there in development and gone in production. The proxy re-serves it over
 * https. ss.nmroads.com — New Mexico DOT's snapshots — is the same: it does
 * not answer on https at all. A host added here must also be in the proxy's
 * own allowlist.
 */
const PROXY_IMAGE_HOSTS = ['infobanjirjps.selangor.gov.my', 'ss.nmroads.com'];

/** The URL a browser can actually load this still from. */
export function proxiedImageUrl(url: string): string {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return url;
  }
  return PROXY_IMAGE_HOSTS.some(h => host === h || host.endsWith('.' + h))
    ? `/api/cctv/proxy?url=${encodeURIComponent(url)}`
    : url;
}

/**
 * The cameras that no other layer already shows within `meters` of them.
 *
 * Some agencies republish a neighbour's cameras as their own: VDOT carries
 * about forty of Arlington County's, and 511 Ontario fifteen of York Region's,
 * the same picture byte for byte. Two pins on one spot for one camera is
 * clutter, so the layer that adds them second leaves those out.
 */
export function withoutCamerasNear(cameras: CctvCamera[], shown: CctvCamera[], meters: number): CctvCamera[] {
  if (!shown.length) return cameras;
  const near = (a: CctvCamera, b: CctvCamera) => {
    const dy = (a.lat - b.lat) * 111_320;
    const dx = (a.lng - b.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
    return dx * dx + dy * dy < meters * meters;
  };
  return cameras.filter(c => !shown.some(s => near(c, s)));
}

/* Windows-1252's bytes 0x80–0x9F, which are not Latin-1's; 0 marks the five it leaves undefined. */
const CP1252_HIGH = [
  0x20ac, 0, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0, 0x017d, 0,
  0, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0, 0x017e, 0x0178,
];

/**
 * Decode a Windows-1252 file. Node's TextDecoder takes the label but decodes
 * Latin-1, so a dash (0x96) came out as an invisible control character.
 */
export function decodeWindows1252(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = '';
  for (let i = 0; i < view.length; i += 8192) {
    const chunk = Array.from(view.subarray(i, i + 8192), b => (b >= 0x80 && b <= 0x9f && CP1252_HIGH[b - 0x80]) || b);
    out += String.fromCharCode(...chunk);
  }
  return out;
}

export function normalizeFeedUrl(url: string): string {
  if (url.startsWith('pics/')) {
    return `http://free-webcambg.com/${url.split('?')[0]}`;
  }
  return url.split('?')[0];
}

export function inferStreamType(url: string): CctvStreamType {
  if (/\.m3u8(\?|$)/i.test(url)) return 'hls';
  if (/youtube\.com\/embed|youtube-nocookie\.com\/embed|rtsp\.me\/embed|ipcamlive\.com\/player|click2stream\.com|windy\.com\/webcams\/\d+\/embed|skylinewebcams\.com|voyage\.aprr\.fr/i.test(url)) {
    return 'iframe';
  }
  return 'jpg';
}
