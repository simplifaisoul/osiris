export type CctvStreamType = 'jpg' | 'hls' | 'iframe' | 'mjpeg';

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
 * https. A host added here must also be in the proxy's own allowlist.
 */
const PROXY_IMAGE_HOSTS = ['infobanjirjps.selangor.gov.my'];

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
