import { CctvCamera } from './types';

// ── SkylineWebcams — Live Snapshot JPGs (auto-refresh) ──
const SKYLINE_SWITZERLAND: CctvCamera[] = [
  { id: 'sky-ch-matterhorn', lat: 45.9763, lng: 7.6586, name: 'Zermatt - Matterhorn', city: 'Zermatt', country: 'Switzerland', external_url: 'https://www.skylinewebcams.com/en/webcam/suisse/valais/zermatt/matterhorn.html', source: 'SkylineWebcams' },
  { id: 'sky-ch-lugano', lat: 46.0037, lng: 8.9511, name: 'Lake Lugano', city: 'Lugano', country: 'Switzerland', external_url: 'https://www.skylinewebcams.com/en/webcam/suisse/ticino/lugano/lake-lugano.html', source: 'SkylineWebcams' },
  { id: 'sky-ch-st-moritz', lat: 46.4908, lng: 9.8355, name: 'St. Moritz - Lake', city: 'St. Moritz', country: 'Switzerland', external_url: 'https://www.skylinewebcams.com/en/webcam/suisse/grisons/st-moritz/st-moritz.html', source: 'SkylineWebcams' },
  { id: 'sky-ch-jungfrau', lat: 46.5475, lng: 7.9826, name: 'Jungfraujoch - Top of Europe', city: 'Interlaken', country: 'Switzerland', external_url: 'https://www.skylinewebcams.com/en/webcam/suisse/bern/interlaken/jungfraujoch.html', source: 'SkylineWebcams' },
  { id: 'sky-ch-geneva', lat: 46.2044, lng: 6.1432, name: 'Geneva - Jet d\'Eau', city: 'Geneva', country: 'Switzerland', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive497.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/suisse/geneve/geneve/geneva-jet-deau.html', source: 'SkylineWebcams' },
];

export async function fetchSwitzerlandCameras(): Promise<CctvCamera[]> {
  return [
    {
      id: 'chuv-heliport',
      lat: 46.5250,
      lng: 6.6420,
      name: 'CHUV Heliport Webcam',
      city: 'Lausanne',
      country: 'Switzerland',
      stream_type: 'jpg',
      stream_url: 'https://wc-heli.chuv.ch/axis-cgi/jpg/image.cgi?resolution=640x480',
      external_url: 'https://wc-heli.chuv.ch/view/view.shtml',
      source: 'chuv.ch'
    },
    ...SKYLINE_SWITZERLAND
  ];
}
