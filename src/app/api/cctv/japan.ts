import type { CctvCamera } from './types';

/**
 * Japan CCTV Cameras
 * Sources:
 *  - YouTube 24/7 live streams (Shibuya, Tokyo Tower, Mt. Fuji, etc.)
 *  (Japan's river cameras come from japan-rivers.ts.)
 *  - Known public webcams across Japan
 */

const JAPAN_CAMERAS: CctvCamera[] = [
  // ── YouTube Live Streams ──
  {
    id: 'jp-shibuya-crossing',
    lat: 35.6595, lng: 139.7005,
    name: 'Shibuya Scramble Crossing',
    city: 'Tokyo', country: 'Japan',
    stream_url: 'https://www.youtube.com/embed/coYw-eVU0Ks?autoplay=1&mute=1',
    stream_type: 'iframe',
    source: 'ANN News / YouTube',
  },
  {
    id: 'jp-tokyo-tower',
    lat: 35.6586, lng: 139.7454,
    name: 'Tokyo Tower Live Cam',
    city: 'Tokyo', country: 'Japan',
    stream_url: 'https://www.youtube.com/embed/cbJ03Xk_eLQ?autoplay=1&mute=1',
    stream_type: 'iframe',
    source: 'YouTube',
  },
  {
    id: 'jp-mt-fuji',
    lat: 35.3606, lng: 138.7274,
    name: 'Mt. Fuji Live',
    city: 'Shizuoka/Yamanashi', country: 'Japan',
    stream_url: 'https://www.youtube.com/embed/5aLh8R2HqOQ?autoplay=1&mute=1',
    stream_type: 'iframe',
    source: 'YouTube',
  },
  {
    id: 'jp-osaka-dotonbori',
    lat: 34.6687, lng: 135.5013,
    name: 'Dotonbori Live Cam',
    city: 'Osaka', country: 'Japan',
    stream_url: 'https://www.youtube.com/embed/m6J9w94oBXY?autoplay=1&mute=1',
    stream_type: 'iframe',
    source: 'YouTube',
  },
  {
    id: 'jp-shinjuku-kabukicho',
    lat: 35.6938, lng: 139.7034,
    name: 'Shinjuku Kabukicho Live',
    city: 'Tokyo', country: 'Japan',
    stream_url: 'https://www.youtube.com/embed/gFRtAAmiFbE?autoplay=1&mute=1',
    stream_type: 'iframe',
    source: 'YouTube',
  },
  {
    id: 'jp-akihabara',
    lat: 35.6984, lng: 139.7731,
    name: 'Akihabara Electric Town',
    city: 'Tokyo', country: 'Japan',
    stream_url: 'https://www.youtube.com/embed/HULqEi0RqXI?autoplay=1&mute=1',
    stream_type: 'iframe',
    source: 'YouTube',
  },
  {
    id: 'jp-tokyo-skytree',
    lat: 35.7101, lng: 139.8107,
    name: 'Tokyo Skytree Live',
    city: 'Tokyo', country: 'Japan',
    stream_url: 'https://www.youtube.com/embed/xIp5F2D8vQ0?autoplay=1&mute=1',
    stream_type: 'iframe',
    source: 'YouTube',
  },
  {
    id: 'jp-ginza',
    lat: 35.6717, lng: 139.7649,
    name: 'Ginza 4-Chome Crossing',
    city: 'Tokyo', country: 'Japan',
    stream_url: 'https://www.youtube.com/embed/LYzCVlG6lkE?autoplay=1&mute=1',
    stream_type: 'iframe',
    source: 'YouTube',
  },
  {
    id: 'jp-yokohama-port',
    lat: 35.4437, lng: 139.6380,
    name: 'Yokohama Port Live',
    city: 'Yokohama', country: 'Japan',
    stream_url: 'https://www.youtube.com/embed/dN4HRiQnAn4?autoplay=1&mute=1',
    stream_type: 'iframe',
    source: 'YouTube',
  },
  {
    id: 'jp-kyoto-kiyomizu',
    lat: 34.9949, lng: 135.7850,
    name: 'Kyoto Arashiyama Bamboo Forest',
    city: 'Kyoto', country: 'Japan',
    stream_url: 'https://www.youtube.com/embed/Op-lf2NRMzs?autoplay=1&mute=1',
    stream_type: 'iframe',
    source: 'YouTube',
  },
  {
    id: 'jp-hiroshima-dome',
    lat: 34.3955, lng: 132.4536,
    name: 'Hiroshima Peace Memorial',
    city: 'Hiroshima', country: 'Japan',
    stream_url: 'https://www.youtube.com/embed/R6-G_4W5K_M?autoplay=1&mute=1',
    stream_type: 'iframe',
    source: 'YouTube',
  },
  {
    id: 'jp-sapporo-odori',
    lat: 43.0588, lng: 141.3563,
    name: 'Sapporo Odori Park',
    city: 'Sapporo', country: 'Japan',
    stream_url: 'https://www.youtube.com/embed/N7k3Q5rMZfM?autoplay=1&mute=1',
    stream_type: 'iframe',
    source: 'YouTube',
  },
  {
    id: 'jp-naha-kokusai',
    lat: 26.3358, lng: 127.6809,
    name: 'Naha Kokusai Street',
    city: 'Naha/Okinawa', country: 'Japan',
    stream_url: 'https://www.youtube.com/embed/cKTkCqVB00A?autoplay=1&mute=1',
    stream_type: 'iframe',
    source: 'YouTube',
  },
  {
    id: 'jp-fukuoka-hakata',
    lat: 33.5898, lng: 130.4017,
    name: 'Fukuoka Hakata Station',
    city: 'Fukuoka', country: 'Japan',
    stream_url: 'https://www.youtube.com/embed/xvN_GxkVjKs?autoplay=1&mute=1',
    stream_type: 'iframe',
    source: 'YouTube',
  },
  {
    id: 'jp-nagoya-station',
    lat: 35.1709, lng: 136.8815,
    name: 'Nagoya Station Area',
    city: 'Nagoya', country: 'Japan',
    stream_url: 'https://www.youtube.com/embed/Oji-G0UhD9U?autoplay=1&mute=1',
    stream_type: 'iframe',
    source: 'YouTube',
  },
  {
    id: 'jp-kobe-harbor',
    lat: 34.6851, lng: 135.1956,
    name: 'Kobe Harborland',
    city: 'Kobe', country: 'Japan',
    stream_url: 'https://www.youtube.com/embed/3xGw0xQBN0s?autoplay=1&mute=1',
    stream_type: 'iframe',
    source: 'YouTube',
  },
  {
    id: 'jp-asakusa-sensoji',
    lat: 35.7148, lng: 139.7967,
    name: 'Asakusa Senso-ji Temple',
    city: 'Tokyo', country: 'Japan',
    stream_url: 'https://www.youtube.com/embed/Ic5FaEzh6h0?autoplay=1&mute=1',
    stream_type: 'iframe',
    source: 'YouTube',
  },
  {
    id: 'jp-tokyo-bay',
    lat: 35.6279, lng: 139.7742,
    name: 'Tokyo Bay Waterfront',
    city: 'Tokyo', country: 'Japan',
    stream_url: 'https://www.youtube.com/embed/Y9X1W8HBE4g?autoplay=1&mute=1',
    stream_type: 'iframe',
    source: 'YouTube',
  },
];

export async function fetchJapanCameras(): Promise<CctvCamera[]> {
  return JAPAN_CAMERAS;
}
