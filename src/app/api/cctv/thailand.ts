import type { CctvCamera } from './types';

/**
 * OSIRIS — Thailand live cameras.
 *
 * Thailand publishes no open machine-readable CCTV feed: the BMA's traffic
 * cameras sit behind a portal that refuses connections from here, and the
 * Highways Department serves its cameras through a viewer rather than an API.
 * SkylineWebcams lists Bangkok, but those `liveNNNN.jpg` posters are catalog
 * stills — the three Bangkok ones were byte-identical 25 seconds apart, which
 * is why they carry no feed_url and the map showed nothing playable here.
 *
 * These are fixed-position 24/7 streams instead. Every id below was checked to
 * be live *and* embeddable at the time of writing (`playableInEmbed`), because
 * a stream that refuses embedding renders as an error inside the viewer — one
 * candidate was dropped for exactly that.
 *
 * Coordinates are area-level: the streams name a venue and a road, not a
 * survey point, so these land within a few hundred metres rather than on the
 * lens. Live streams also end at the owner's whim; a dead id shows as an
 * unavailable embed rather than breaking the layer.
 */
const THAILAND_CAMERAS: CctvCamera[] = [
  // ── Bangkok ──
  {
    id: 'th-bangkok-sukhumvit-soi-11',
    lat: 13.7437, lng: 100.5556,
    name: 'Sukhumvit Soi 11 — Bangkok',
    city: 'Bangkok',
    country: 'Thailand',
    stream_url: 'https://www.youtube.com/embed/UemFRPrl1hk?autoplay=1&mute=1',
    stream_type: 'iframe',
    external_url: 'https://www.youtube.com/watch?v=UemFRPrl1hk',
    source: 'The Real Samui Webcam',
  },
  {
    id: 'th-bangkok-sukhumvit-soi-19',
    lat: 13.7396, lng: 100.5601,
    name: 'Sukhumvit Soi 19 — Bangkok',
    city: 'Bangkok',
    country: 'Thailand',
    stream_url: 'https://www.youtube.com/embed/Q71sLS8h9a4?autoplay=1&mute=1',
    stream_type: 'iframe',
    external_url: 'https://www.youtube.com/watch?v=Q71sLS8h9a4',
    source: 'The Real Samui Webcam',
  },

  // ── Koh Samui ──
  {
    id: 'th-samui-chaweng-green-mango',
    lat: 9.5071545, lng: 99.9957562,
    name: 'Chaweng — Soi Green Mango',
    city: 'Ko Samui',
    country: 'Thailand',
    stream_url: 'https://www.youtube.com/embed/DwKCna1mumk?autoplay=1&mute=1',
    stream_type: 'iframe',
    external_url: 'https://www.youtube.com/watch?v=DwKCna1mumk',
    source: 'The Real Samui Webcam',
  },
  {
    id: 'th-samui-chaweng-munchies',
    lat: 9.5071545, lng: 99.9957562,
    name: 'Chaweng — Soi Green Mango (Munchies)',
    city: 'Ko Samui',
    country: 'Thailand',
    stream_url: 'https://www.youtube.com/embed/yFgVmioYkys?autoplay=1&mute=1',
    stream_type: 'iframe',
    external_url: 'https://www.youtube.com/watch?v=yFgVmioYkys',
    source: 'The Real Samui Webcam',
  },
  {
    id: 'th-samui-lamai-crystal-bay',
    lat: 9.4700032, lng: 100.0459763,
    name: 'Lamai — Crystal Bay Beach',
    city: 'Ko Samui',
    country: 'Thailand',
    stream_url: 'https://www.youtube.com/embed/Fw9hgttWzIg?autoplay=1&mute=1',
    stream_type: 'iframe',
    external_url: 'https://www.youtube.com/watch?v=Fw9hgttWzIg',
    source: 'The Real Samui Webcam',
  },

  // ── Koh Phangan ──
  {
    id: 'th-phangan-srithanu-sanskara',
    lat: 9.7333, lng: 99.9833,
    name: 'Koh Phangan — Srithanu Beach',
    city: 'Ko Phangan',
    country: 'Thailand',
    stream_url: 'https://www.youtube.com/embed/MW3fisTCXRQ?autoplay=1&mute=1',
    stream_type: 'iframe',
    external_url: 'https://www.youtube.com/watch?v=MW3fisTCXRQ',
    source: 'The Real Samui Webcam',
  },
];

export async function fetchThailandCameras(): Promise<CctvCamera[]> {
  return THAILAND_CAMERAS;
}
