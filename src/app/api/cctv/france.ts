import type { CctvCamera } from './types';

// ── Existing YouTube Live Streams ──
const YOUTUBE_LIVE: CctvCamera[] = [
  {
    id: 'fr-paris-1', lat: 48.8584, lng: 2.2945,
    name: 'Paris - Eiffel Tower Area', city: 'Paris', country: 'France',
    stream_url: 'https://www.youtube.com/embed/UMuEooW0iAQ?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0',
    stream_type: 'iframe', source: 'YouTube Live',
  },
  {
    id: 'fr-paris-2', lat: 48.8600, lng: 2.3300,
    name: 'Paris - Louvre Area', city: 'Paris', country: 'France',
    stream_url: 'https://www.youtube.com/embed/OzYp4NRZlwQ?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0',
    stream_type: 'iframe', source: 'YouTube Live',
  },
  {
    id: 'fr-nice-1', lat: 43.6961, lng: 7.2717,
    name: 'Nice - Promenade des Anglais', city: 'Nice', country: 'France',
    stream_url: 'https://www.youtube.com/embed/YAdNYoRY0Cw?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0',
    stream_type: 'iframe', source: 'YouTube Live',
  },
  {
    id: 'fr-nice-2', lat: 43.7000, lng: 7.2600,
    name: 'Nice - City View', city: 'Nice', country: 'France',
    stream_url: 'https://www.youtube.com/embed/asO_10T0k2k?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0',
    stream_type: 'iframe', source: 'YouTube Live',
  }
];

// ── SkylineWebcams — Live Snapshot JPGs (auto-refresh) ──
// Source: https://www.skylinewebcams.com/fr/webcam/france.html
const SKYLINE_FRANCE: CctvCamera[] = [
  { id: 'sky-fr-calanques', lat: 43.2100, lng: 5.4300, name: 'Marseille - Les Calanques', city: 'Marseille', country: 'France', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive1234.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/france/provence-alpes-cote-dazur/marseille/les-calanques-de-marseille.html', source: 'SkylineWebcams' },
  { id: 'sky-fr-frejus', lat: 43.4330, lng: 6.7370, name: 'Plage de Fréjus', city: 'Fréjus', country: 'France', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive1235.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/france/provence-alpes-cote-dazur/frejus/plage-de-frejus.html', source: 'SkylineWebcams' },
  { id: 'sky-fr-la-rochelle', lat: 46.1591, lng: -1.1520, name: 'La Rochelle - Vieux Port', city: 'La Rochelle', country: 'France', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive1236.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/france/nouvelle-aquitaine/la-rochelle/vieux-port.html', source: 'SkylineWebcams' },
  { id: 'sky-fr-royan', lat: 45.6284, lng: -1.0286, name: 'Royan - Plage de Pontaillac', city: 'Royan', country: 'France', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive1237.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/france/nouvelle-aquitaine/royan/plage-de-pontaillac.html', source: 'SkylineWebcams' },
  { id: 'sky-fr-mont-dore', lat: 45.5740, lng: 2.8080, name: 'Le Mont-Dore - Sommet de Sancy', city: 'Le Mont-Dore', country: 'France', external_url: 'https://www.skylinewebcams.com/en/webcam/france/auvergne-rhone-alpes/mont-dore/le-mont-dore.html', source: 'SkylineWebcams' },
  { id: 'sky-fr-sete', lat: 43.4035, lng: 3.6970, name: 'Sète - Port de Plaisance', city: 'Sète', country: 'France', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive1239.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/france/occitanie/sete/port-de-plaisance.html', source: 'SkylineWebcams' },
  { id: 'sky-fr-bourget', lat: 45.6910, lng: 5.8810, name: 'Lac du Bourget - Aix les Bains', city: 'Aix-les-Bains', country: 'France', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive1240.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/france/auvergne-rhone-alpes/aix-les-bains/lac-du-bourget.html', source: 'SkylineWebcams' },
  { id: 'sky-fr-porto-vecchio', lat: 41.5910, lng: 9.2790, name: 'Porto-Vecchio - Plage de Folaca', city: 'Porto-Vecchio', country: 'France', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive1241.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/france/corsica/porto-vecchio/porto-vecchio-folacca-beach.html', source: 'SkylineWebcams' },
  { id: 'sky-fr-menton', lat: 43.7750, lng: 7.4990, name: 'Menton - Vue Panoramique', city: 'Menton', country: 'France', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive1242.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/france/provence-alpes-cote-dazur/menton/vue-panoramique.html', source: 'SkylineWebcams' },
];

// ── APRR / AREA — French Highway Webcams ──
// Source: https://voyage.aprr.fr/carte-itineraires?type=webcam
// Note: APRR blocks iframe embedding. These are external-link-only cams
// with position on the map but link out to the APRR map for live view.
const APRR_HIGHWAY: CctvCamera[] = [
  // A6 — Paris-Lyon corridor
  { id: 'aprr-a6-beaune', lat: 47.0245, lng: 4.8390, name: 'A6 Beaune — Péage', city: 'Beaune', country: 'France', external_url: 'https://voyage.aprr.fr/carte-itineraires?type=webcam', source: 'APRR' },
  { id: 'aprr-a6-auxerre', lat: 47.7990, lng: 3.5700, name: 'A6 Auxerre Nord', city: 'Auxerre', country: 'France', external_url: 'https://voyage.aprr.fr/carte-itineraires?type=webcam', source: 'APRR' },
  { id: 'aprr-a6-macon', lat: 46.3070, lng: 4.8330, name: 'A6 Mâcon Sud', city: 'Mâcon', country: 'France', external_url: 'https://voyage.aprr.fr/carte-itineraires?type=webcam', source: 'APRR' },
  { id: 'aprr-a6-villefranche', lat: 45.9900, lng: 4.7200, name: 'A6 Villefranche-sur-Saône', city: 'Villefranche', country: 'France', external_url: 'https://voyage.aprr.fr/carte-itineraires?type=webcam', source: 'APRR' },
  { id: 'aprr-a6-avallon', lat: 47.4860, lng: 3.9080, name: 'A6 Avallon', city: 'Avallon', country: 'France', external_url: 'https://voyage.aprr.fr/carte-itineraires?type=webcam', source: 'APRR' },
  { id: 'aprr-a6-chalon', lat: 46.7810, lng: 4.8540, name: 'A6 Chalon-sur-Saône', city: 'Chalon-sur-Saône', country: 'France', external_url: 'https://voyage.aprr.fr/carte-itineraires?type=webcam', source: 'APRR' },
  { id: 'aprr-a6-tournus', lat: 46.5710, lng: 4.9080, name: 'A6 Tournus', city: 'Tournus', country: 'France', external_url: 'https://voyage.aprr.fr/carte-itineraires?type=webcam', source: 'APRR' },
  // A31 — Dijon-Nancy-Luxembourg
  { id: 'aprr-a31-dijon', lat: 47.3220, lng: 5.0415, name: 'A31 Dijon Nord', city: 'Dijon', country: 'France', external_url: 'https://voyage.aprr.fr/carte-itineraires?type=webcam', source: 'APRR' },
  { id: 'aprr-a31-langres', lat: 47.8620, lng: 5.3330, name: 'A31 Langres Sud', city: 'Langres', country: 'France', external_url: 'https://voyage.aprr.fr/carte-itineraires?type=webcam', source: 'APRR' },
  { id: 'aprr-a31-toul', lat: 48.6750, lng: 5.8890, name: 'A31 Toul', city: 'Toul', country: 'France', external_url: 'https://voyage.aprr.fr/carte-itineraires?type=webcam', source: 'APRR' },
  // A36 — Beaune-Mulhouse
  { id: 'aprr-a36-besancon', lat: 47.2378, lng: 6.0241, name: 'A36 Besançon Ouest', city: 'Besançon', country: 'France', external_url: 'https://voyage.aprr.fr/carte-itineraires?type=webcam', source: 'APRR' },
  { id: 'aprr-a36-belfort', lat: 47.6400, lng: 6.8600, name: 'A36 Belfort', city: 'Belfort', country: 'France', external_url: 'https://voyage.aprr.fr/carte-itineraires?type=webcam', source: 'APRR' },
  { id: 'aprr-a36-mulhouse', lat: 47.7508, lng: 7.3359, name: 'A36 Mulhouse', city: 'Mulhouse', country: 'France', external_url: 'https://voyage.aprr.fr/carte-itineraires?type=webcam', source: 'APRR' },
  // A39 — Dijon-Bourg
  { id: 'aprr-a39-dole', lat: 47.0930, lng: 5.4900, name: 'A39 Dole', city: 'Dole', country: 'France', external_url: 'https://voyage.aprr.fr/carte-itineraires?type=webcam', source: 'APRR' },
  { id: 'aprr-a39-lons', lat: 46.6730, lng: 5.5550, name: 'A39 Lons-le-Saunier', city: 'Lons-le-Saunier', country: 'France', external_url: 'https://voyage.aprr.fr/carte-itineraires?type=webcam', source: 'APRR' },
  // A40 — Mâcon-Chamonix (Autoroute Blanche)
  { id: 'aprr-a40-bourg', lat: 46.2056, lng: 5.2254, name: 'A40 Bourg-en-Bresse', city: 'Bourg-en-Bresse', country: 'France', external_url: 'https://voyage.aprr.fr/carte-itineraires?type=webcam', source: 'AREA' },
  { id: 'aprr-a40-nantua', lat: 46.1530, lng: 5.6080, name: 'A40 Nantua', city: 'Nantua', country: 'France', external_url: 'https://voyage.aprr.fr/carte-itineraires?type=webcam', source: 'AREA' },
  { id: 'aprr-a40-annecy', lat: 46.0592, lng: 6.0710, name: 'A40 Annecy Nord', city: 'Annecy', country: 'France', external_url: 'https://voyage.aprr.fr/carte-itineraires?type=webcam', source: 'AREA' },
  { id: 'aprr-a40-chamonix', lat: 45.9237, lng: 6.8694, name: 'A40 Chamonix - Mont Blanc Tunnel', city: 'Chamonix', country: 'France', external_url: 'https://voyage.aprr.fr/carte-itineraires?type=webcam', source: 'AREA' },
  // A43 — Lyon-Chambéry-Turin
  { id: 'aprr-a43-chambery', lat: 45.5646, lng: 5.9178, name: 'A43 Chambéry', city: 'Chambéry', country: 'France', external_url: 'https://voyage.aprr.fr/carte-itineraires?type=webcam', source: 'AREA' },
  { id: 'aprr-a43-modane', lat: 45.1940, lng: 6.6580, name: 'A43 Modane - Fréjus Tunnel', city: 'Modane', country: 'France', external_url: 'https://voyage.aprr.fr/carte-itineraires?type=webcam', source: 'AREA' },
  { id: 'aprr-a43-albertville', lat: 45.6756, lng: 6.3927, name: 'A43 Albertville', city: 'Albertville', country: 'France', external_url: 'https://voyage.aprr.fr/carte-itineraires?type=webcam', source: 'AREA' },
  // A5 — Paris-Troyes-Langres
  { id: 'aprr-a5-troyes', lat: 48.2973, lng: 4.0744, name: 'A5 Troyes', city: 'Troyes', country: 'France', external_url: 'https://voyage.aprr.fr/carte-itineraires?type=webcam', source: 'APRR' },
  { id: 'aprr-a5-sens', lat: 48.1985, lng: 3.2838, name: 'A5 Sens', city: 'Sens', country: 'France', external_url: 'https://voyage.aprr.fr/carte-itineraires?type=webcam', source: 'APRR' },
  // A71 — Orléans-Clermont
  { id: 'aprr-a71-bourges', lat: 47.0833, lng: 2.3960, name: 'A71 Bourges', city: 'Bourges', country: 'France', external_url: 'https://voyage.aprr.fr/carte-itineraires?type=webcam', source: 'APRR' },
  { id: 'aprr-a71-clermont', lat: 45.7772, lng: 3.0870, name: 'A71 Clermont-Ferrand Nord', city: 'Clermont-Ferrand', country: 'France', external_url: 'https://voyage.aprr.fr/carte-itineraires?type=webcam', source: 'APRR' },
  // A77 — Nevers
  { id: 'aprr-a77-nevers', lat: 46.9896, lng: 3.1590, name: 'A77 Nevers', city: 'Nevers', country: 'France', external_url: 'https://voyage.aprr.fr/carte-itineraires?type=webcam', source: 'APRR' },
];

const FRANCE_CAMERAS: CctvCamera[] = [...YOUTUBE_LIVE, ...SKYLINE_FRANCE, ...APRR_HIGHWAY];

export async function fetchFranceCameras(): Promise<CctvCamera[]> {
  return FRANCE_CAMERAS;
}
