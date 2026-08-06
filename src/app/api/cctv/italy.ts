import type { CctvCamera } from './types';

// ── SkylineWebcams — Live Snapshot JPGs (auto-refresh) ──
const SKYLINE_ITALY: CctvCamera[] = [
  // Rome
  { id: 'sky-it-trevi', lat: 41.9009, lng: 12.4833, name: 'Rome - Trevi Fountain', city: 'Rome', country: 'Italy', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive341.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/italia/lazio/roma/fontana-di-trevi.html', source: 'SkylineWebcams' },
  { id: 'sky-it-pantheon', lat: 41.8986, lng: 12.4769, name: 'Rome - Pantheon', city: 'Rome', country: 'Italy', external_url: 'https://www.skylinewebcams.com/en/webcam/italia/lazio/roma/pantheon.html', source: 'SkylineWebcams' },
  { id: 'sky-it-colosseum', lat: 41.8902, lng: 12.4922, name: 'Rome - Colosseum', city: 'Rome', country: 'Italy', external_url: 'https://www.skylinewebcams.com/en/webcam/italia/lazio/roma/colosseo.html', source: 'SkylineWebcams' },
  { id: 'sky-it-navona', lat: 41.8992, lng: 12.4731, name: 'Rome - Piazza Navona', city: 'Rome', country: 'Italy', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive343.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/italia/lazio/roma/piazza-navona.html', source: 'SkylineWebcams' },
  { id: 'sky-it-spagna', lat: 41.9059, lng: 12.4827, name: 'Rome - Spanish Steps', city: 'Rome', country: 'Italy', external_url: 'https://www.skylinewebcams.com/en/webcam/italia/lazio/roma/piazza-di-spagna.html', source: 'SkylineWebcams' },
  
  // Venice
  { id: 'sky-it-rialto', lat: 45.4381, lng: 12.3358, name: 'Venice - Rialto Bridge', city: 'Venice', country: 'Italy', external_url: 'https://www.skylinewebcams.com/en/webcam/italia/veneto/venezia/ponte-di-rialto.html', source: 'SkylineWebcams' },
  { id: 'sky-it-sanmarco', lat: 45.4341, lng: 12.3384, name: 'Venice - St. Mark\'s Square', city: 'Venice', country: 'Italy', external_url: 'https://www.skylinewebcams.com/en/webcam/italia/veneto/venezia/piazza-san-marco.html', source: 'SkylineWebcams' },
  { id: 'sky-it-grandcanal', lat: 45.4311, lng: 12.3283, name: 'Venice - Grand Canal', city: 'Venice', country: 'Italy', external_url: 'https://www.skylinewebcams.com/en/webcam/italia/veneto/venezia/canal-grande.html', source: 'SkylineWebcams' },

  // Milan
  { id: 'sky-it-duomo', lat: 45.4642, lng: 9.1900, name: 'Milan - Milan Cathedral', city: 'Milan', country: 'Italy', external_url: 'https://www.skylinewebcams.com/en/webcam/italia/lombardia/milano/duomo-milano.html', source: 'SkylineWebcams' },
  { id: 'sky-it-sanbabila', lat: 45.4665, lng: 9.1969, name: 'Milan - Piazza San Babila', city: 'Milan', country: 'Italy', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive435.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/italia/lombardia/milano/piazza-san-babila.html', source: 'SkylineWebcams' },

  // Florence
  { id: 'sky-it-signoria', lat: 43.7695, lng: 11.2558, name: 'Florence - Piazza della Signoria', city: 'Florence', country: 'Italy', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive245.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/italia/toscana/firenze/piazza-della-signoria.html', source: 'SkylineWebcams' },
  { id: 'sky-it-pontevecchio', lat: 43.7687, lng: 11.2530, name: 'Florence - Ponte Vecchio', city: 'Florence', country: 'Italy', external_url: 'https://www.skylinewebcams.com/en/webcam/italia/toscana/firenze/ponte-vecchio.html', source: 'SkylineWebcams' },

  // Naples
  { id: 'sky-it-vesuvio', lat: 40.8174, lng: 14.4261, name: 'Naples - Mount Vesuvius', city: 'Naples', country: 'Italy', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive66.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/italia/campania/napoli/vesuvio.html', source: 'SkylineWebcams' },
  { id: 'sky-it-plebiscito', lat: 40.8359, lng: 14.2487, name: 'Naples - Piazza del Plebiscito', city: 'Naples', country: 'Italy', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive260.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/italia/campania/napoli/piazza-del-plebiscito.html', source: 'SkylineWebcams' },

  // Amalfi Coast
  { id: 'sky-it-amalfi', lat: 40.6333, lng: 14.6027, name: 'Amalfi Coast - Positano', city: 'Positano', country: 'Italy', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive259.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/italia/campania/salerno/positano.html', source: 'SkylineWebcams' },
  
  // Sicily
  { id: 'sky-it-etna', lat: 37.7510, lng: 14.9934, name: 'Mount Etna - Volcano', city: 'Catania', country: 'Italy', external_url: 'https://www.skylinewebcams.com/en/webcam/italia/sicilia/catania/vulcano-etna.html', source: 'SkylineWebcams' },
];

export async function fetchItalyCameras(): Promise<CctvCamera[]> {
  return SKYLINE_ITALY;
}
