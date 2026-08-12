import type { CctvCamera } from './types';
import { stealthFetch } from '@/lib/stealthFetch';

const PROVINCE_MAP: Record<string, string> = {
  '01': 'Álava', '02': 'Albacete', '03': 'Alicante', '04': 'Almería', '05': 'Ávila',
  '06': 'Badajoz', '07': 'Baleares', '08': 'Barcelona', '09': 'Burgos', '10': 'Cáceres',
  '11': 'Cádiz', '12': 'Castellón', '13': 'Ciudad Real', '14': 'Córdoba', '15': 'A Coruña',
  '16': 'Cuenca', '17': 'Girona', '18': 'Granada', '19': 'Guadalajara', '20': 'Gipuzkoa',
  '21': 'Huelva', '22': 'Huesca', '23': 'Jaén', '24': 'León', '25': 'Lleida',
  '26': 'La Rioja', '27': 'Lugo', '28': 'Madrid', '29': 'Málaga', '30': 'Murcia',
  '31': 'Navarra', '32': 'Ourense', '33': 'Asturias', '34': 'Palencia', '35': 'Las Palmas',
  '36': 'Pontevedra', '37': 'Salamanca', '38': 'S.C. Tenerife', '39': 'Cantabria',
  '40': 'Segovia', '41': 'Sevilla', '42': 'Soria', '43': 'Tarragona', '44': 'Teruel',
  '45': 'Toledo', '46': 'Valencia', '47': 'Valladolid', '48': 'Bizkaia', '49': 'Zamora',
  '50': 'Zaragoza', '51': 'Ceuta', '52': 'Melilla'
};

// ── Existing YouTube Live Streams ──
const YOUTUBE_LIVE: CctvCamera[] = [
  {
    id: 'es-barcelona-2', lat: 41.3800, lng: 2.1800,
    name: 'Barcelona - Beach Area', city: 'Barcelona', country: 'Spain',
    stream_url: 'https://www.youtube.com/embed/4DjwrvoTKwk?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0',
    stream_type: 'iframe', source: 'YouTube Live',
  },
  {
    id: 'es-madrid-1', lat: 40.4168, lng: -3.7038,
    name: 'Madrid - Puerta del Sol', city: 'Madrid', country: 'Spain',
    stream_url: 'https://www.youtube.com/embed/4CaHlfpGlAI?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0',
    stream_type: 'iframe', source: 'YouTube Live',
  },
  {
    id: 'es-madrid-2', lat: 40.4200, lng: -3.7000,
    name: 'Madrid - Gran Via', city: 'Madrid', country: 'Spain',
    stream_url: 'https://www.youtube.com/embed/LSPN10FbR3U?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0',
    stream_type: 'iframe', source: 'YouTube Live',
  }
];

// ── SkylineWebcams — Live Snapshot JPGs (auto-refresh) ──
// Source: https://www.skylinewebcams.com/es/webcam/espana.html
// CDN pattern: cdn.skylinewebcams.com/live{ID}.jpg
// NOTE: this is Skyline's catalog poster, not a guaranteed live frame. Roughly
// a third of them refresh; the rest are frozen at whatever the camera saw when
// it was catalogued (some as far back as 2021). Only cameras whose poster was
// observed changing keep a feed_url — the rest carry external_url alone so the
// viewer shows an external-feed card instead of a stale still.
const SKYLINE_SPAIN: CctvCamera[] = [
  // ─── Canarias - Tenerife ───
  { id: 'sky-es-los-cristianos', lat: 28.0517, lng: -16.7155, name: 'Playa de Los Cristianos', city: 'Tenerife', country: 'Spain', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive340.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/canarias/santa-cruz-de-tenerife/playa-los-cristianos.html', source: 'SkylineWebcams' },
  { id: 'sky-es-las-vistas', lat: 28.0540, lng: -16.7230, name: 'Playa Las Vistas', city: 'Tenerife', country: 'Spain', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive339.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/canarias/santa-cruz-de-tenerife/playa-las-vistas.html', source: 'SkylineWebcams' },
  { id: 'sky-es-medano-surf', lat: 28.0445, lng: -16.5370, name: 'El Médano Surf & Kitesurf', city: 'Tenerife', country: 'Spain', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive427.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/canarias/santa-cruz-de-tenerife/surf-kitesurf-medano.html', source: 'SkylineWebcams' },
  { id: 'sky-es-duque', lat: 28.0800, lng: -16.7400, name: 'Playa del Duque - El Beril', city: 'Tenerife', country: 'Spain', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive4943.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/canarias/santa-cruz-de-tenerife/playa-del-duque-el-beril.html', source: 'SkylineWebcams' },
  { id: 'sky-es-fanabe', lat: 28.0730, lng: -16.7370, name: 'Playa de Fañabé', city: 'Tenerife', country: 'Spain', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive383.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/canarias/santa-cruz-de-tenerife/playa-de-fanabe.html', source: 'SkylineWebcams' },
  { id: 'sky-es-troya', lat: 28.0600, lng: -16.7300, name: 'Playa de Troya - Las Américas', city: 'Tenerife', country: 'Spain', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive382.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/canarias/santa-cruz-de-tenerife/playa-troya.html', source: 'SkylineWebcams' },
  { id: 'sky-es-puerto-cruz', lat: 28.4147, lng: -16.5476, name: 'Puerto de la Cruz', city: 'Tenerife', country: 'Spain', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive366.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/canarias/santa-cruz-de-tenerife/puerto-de-la-cruz-tenerife.html', source: 'SkylineWebcams' },
  { id: 'sky-es-la-pinta', lat: 28.0750, lng: -16.7350, name: 'Costa Adeje - Playa La Pinta', city: 'Tenerife', country: 'Spain', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive1064.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/canarias/santa-cruz-de-tenerife/playa-la-pinta.html', source: 'SkylineWebcams' },
  { id: 'sky-es-bahia-cristianos', lat: 28.0490, lng: -16.7180, name: 'Bahía de Los Cristianos', city: 'Tenerife', country: 'Spain', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive2910.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/canarias/santa-cruz-de-tenerife/bahia-los-cristianos.html', source: 'SkylineWebcams' },
  { id: 'sky-es-isora', lat: 28.1940, lng: -16.8560, name: 'Guía de Isora - Playa San Juan', city: 'Tenerife', country: 'Spain', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive3033.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/canarias/santa-cruz-de-tenerife/guia-de-isora.html', source: 'SkylineWebcams' },
  { id: 'sky-es-costa-adeje', lat: 28.0900, lng: -16.7500, name: 'Costa Adeje - Playa Paraíso', city: 'Tenerife', country: 'Spain', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive5145.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/canarias/santa-cruz-de-tenerife/costa-adeje.html', source: 'SkylineWebcams' },
  { id: 'sky-es-punta-brava', lat: 28.4100, lng: -16.5600, name: 'Puerto de la Cruz - Punta Brava', city: 'Tenerife', country: 'Spain', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive1276.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/canarias/santa-cruz-de-tenerife/punta-brava.html', source: 'SkylineWebcams' },
  { id: 'sky-es-masca', lat: 28.2960, lng: -16.8410, name: 'Parque Rural de Teno - Masca', city: 'Tenerife', country: 'Spain', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive1093.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/canarias/santa-cruz-de-tenerife/masca-valley-tenerife.html', source: 'SkylineWebcams' },
  { id: 'sky-es-americas', lat: 28.0560, lng: -16.7280, name: 'Arona - Playa de Las Américas', city: 'Tenerife', country: 'Spain', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive1115.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/canarias/santa-cruz-de-tenerife/playa-de-las-americas.html', source: 'SkylineWebcams' },
  { id: 'sky-es-hidalgo', lat: 28.5600, lng: -16.3300, name: 'Punta del Hidalgo', city: 'Tenerife', country: 'Spain', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive1065.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/canarias/santa-cruz-de-tenerife/punta-del-hidalgo.html', source: 'SkylineWebcams' },
  { id: 'sky-es-lago-martianez', lat: 28.4150, lng: -16.5460, name: 'Puerto de la Cruz - Lago Martiánez', city: 'Tenerife', country: 'Spain', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive1042.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/canarias/santa-cruz-de-tenerife/puerto-de-la-cruz-lago-martianez.html', source: 'SkylineWebcams' },
  { id: 'sky-es-san-telmo', lat: 28.4130, lng: -16.5500, name: 'Puerto de la Cruz - Playa San Telmo', city: 'Tenerife', country: 'Spain', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive792.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/canarias/santa-cruz-de-tenerife/puerto-de-la-cruz-playa-san-telmo.html', source: 'SkylineWebcams' },
  { id: 'sky-es-medano-playa', lat: 28.0450, lng: -16.5380, name: 'Playa de El Médano', city: 'Tenerife', country: 'Spain', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive376.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/canarias/santa-cruz-de-tenerife/playa-de-el-medano.html', source: 'SkylineWebcams' },
  { id: 'sky-es-duque2', lat: 28.0810, lng: -16.7410, name: 'Playa del Duque', city: 'Tenerife', country: 'Spain', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive1073.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/canarias/santa-cruz-de-tenerife/playa-del-duque.html', source: 'SkylineWebcams' },
  { id: 'sky-es-catamaran', lat: 28.0700, lng: -16.7350, name: 'Catamarán Royal Delfin', city: 'Tenerife', country: 'Spain', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive670.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/canarias/santa-cruz-de-tenerife/catamarano-royal-delfin.html', source: 'SkylineWebcams' },
  // ─── Canarias - Gran Canaria ───
  { id: 'sky-es-canteras-g', lat: 28.1420, lng: -15.4330, name: 'Playa Grande de Las Canteras', city: 'Gran Canaria', country: 'Spain', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive680.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/canarias/las-palmas-gran-canaria/playa-grande-las-canteras.html', source: 'SkylineWebcams' },
  { id: 'sky-es-canteras', lat: 28.1400, lng: -15.4380, name: 'Las Palmas - Playa de Las Canteras', city: 'Gran Canaria', country: 'Spain', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive624.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/canarias/las-palmas-gran-canaria/playa-las-canteras.html', source: 'SkylineWebcams' },
  { id: 'sky-es-patalavaca', lat: 27.7730, lng: -15.6830, name: 'Patalavaca - Anfi del Mar', city: 'Gran Canaria', country: 'Spain', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive211.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/canarias/las-palmas-gran-canaria/patalavaca.html', source: 'SkylineWebcams' },
  { id: 'sky-es-puerto-rico', lat: 27.7870, lng: -15.7100, name: 'Mogán - Playa de Puerto Rico', city: 'Gran Canaria', country: 'Spain', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive1747.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/canarias/las-palmas-gran-canaria/mogan-playa-de-puerto-rico.html', source: 'SkylineWebcams' },
  { id: 'sky-es-amadores', lat: 27.7920, lng: -15.7200, name: 'Playa de Amadores', city: 'Gran Canaria', country: 'Spain', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive1517.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/canarias/las-palmas-gran-canaria/puerto-rico-de-gran-canaria-playa-amadores.html', source: 'SkylineWebcams' },
  { id: 'sky-es-playa-cura', lat: 27.7850, lng: -15.7050, name: 'Mogán - Playa del Cura', city: 'Gran Canaria', country: 'Spain', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive1518.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/canarias/las-palmas-gran-canaria/mogan-playa-del-cura.html', source: 'SkylineWebcams' },
  // ─── Canarias - Lanzarote/Fuerteventura ───
  { id: 'sky-es-pocillos', lat: 28.9210, lng: -13.6510, name: 'Puerto del Carmen - Playa Los Pocillos', city: 'Lanzarote', country: 'Spain', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive4592.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/canarias/las-palmas-gran-canaria/puerto-del-carmen-playa-los-pocillos.html', source: 'SkylineWebcams' },
  { id: 'sky-es-corralejo', lat: 28.7300, lng: -13.8670, name: 'Fuerteventura - Corralejo', city: 'Fuerteventura', country: 'Spain', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive1091.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/canarias/corralejo/fuerteventura-corralejo.html', source: 'SkylineWebcams' },
  { id: 'sky-es-corralejo-gp', lat: 28.7350, lng: -13.8600, name: 'Grandes Playas de Corralejo', city: 'Fuerteventura', country: 'Spain', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive6086.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/canarias/corralejo/grandes-playas-corralejo.html', source: 'SkylineWebcams' },
  { id: 'sky-es-playa-blanca', lat: 28.8600, lng: -13.8300, name: 'Yaiza - Playa Blanca', city: 'Lanzarote', country: 'Spain', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive6084.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/canarias/las-palmas/yaiza-playa-blanca.html', source: 'SkylineWebcams' },
  // ─── Mainland - Madrid ───
  { id: 'sky-es-sol-tiopepe', lat: 40.4170, lng: -3.7035, name: 'Puerta del Sol - Tío Pepe', city: 'Madrid', country: 'Spain', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/comunidad-de-madrid/madrid/puerta-del-sol-tio-pepe.html', source: 'SkylineWebcams' },
  { id: 'sky-es-sol-mayor', lat: 40.4172, lng: -3.7050, name: 'Puerta del Sol - Calle Mayor', city: 'Madrid', country: 'Spain', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/comunidad-de-madrid/madrid/puerta-del-sol-calle-mayor.html', source: 'SkylineWebcams' },
  { id: 'sky-es-callao', lat: 40.4200, lng: -3.7070, name: 'Madrid - Plaza del Callao', city: 'Madrid', country: 'Spain', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive566.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/comunidad-de-madrid/madrid/madrid-plaza-del-callao.html', source: 'SkylineWebcams' },
  { id: 'sky-es-alcala', lat: 40.4190, lng: -3.6940, name: 'Calle de Alcalá - Cibeles', city: 'Madrid', country: 'Spain', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive314.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/comunidad-de-madrid/madrid/calle-alcala.html', source: 'SkylineWebcams' },
  // ─── Mainland - Andalucía ───
  { id: 'sky-es-alhambra', lat: 37.1760, lng: -3.5880, name: 'La Alhambra de Granada', city: 'Granada', country: 'Spain', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive372.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/andalucia/granada/alhambra-de-granada.html', source: 'SkylineWebcams' },
  { id: 'sky-es-sevilla-sf', lat: 37.3891, lng: -5.9945, name: 'Sevilla - Plaza de San Francisco', city: 'Sevilla', country: 'Spain', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive823.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/andalucia/sevilla/siviglia-plaza-san-francisco.html', source: 'SkylineWebcams' },
  { id: 'sky-es-barrosa', lat: 36.3700, lng: -6.1700, name: 'Playa de la Barrosa - Chiclana', city: 'Chiclana', country: 'Spain', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive1636.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/andalucia/cadiz/chiclana-de-la-frontera-playa-de-la-barrosa.html', source: 'SkylineWebcams' },
  { id: 'sky-es-cocedores', lat: 37.3850, lng: -1.6400, name: 'Pulpí - Playa de los Cocedores', city: 'Pulpí', country: 'Spain', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive5987.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/andalucia/almeria/pulpi-playa-de-los-cocedores.html', source: 'SkylineWebcams' },
  // ─── Costa Blanca / Valencia ───
  { id: 'sky-es-benidorm-p', lat: 38.5322, lng: -0.1270, name: 'Benidorm - Playa de Poniente', city: 'Benidorm', country: 'Spain', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive630.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/comunidad-valenciana/alicante/benidorm-playa-poniente-sur.html', source: 'SkylineWebcams' },
  { id: 'sky-es-benidorm-pp', lat: 38.5340, lng: -0.1250, name: 'Benidorm - Playa de Poniente - Puerto', city: 'Benidorm', country: 'Spain', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive293.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/comunidad-valenciana/alicante/benidorm-playa-poniente.html', source: 'SkylineWebcams' },
  { id: 'sky-es-benidorm-l', lat: 38.5370, lng: -0.1180, name: 'Benidorm - Playa de Levante', city: 'Benidorm', country: 'Spain', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive642.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/comunidad-valenciana/alicante/benidorm-playa-levante.html', source: 'SkylineWebcams' },
  { id: 'sky-es-benidorm-la', lat: 38.5360, lng: -0.1200, name: 'Benidorm - Playa de Levante - Alicante', city: 'Benidorm', country: 'Spain', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive592.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/comunidad-valenciana/alicante/benidorm-playa-alicante.html', source: 'SkylineWebcams' },
  { id: 'sky-es-calpe', lat: 38.6440, lng: 0.0650, name: 'Calpe - Peñón de Ifach', city: 'Calpe', country: 'Spain', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive3032.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/comunidad-valenciana/alicante/calpe-penon-de-ifach.html', source: 'SkylineWebcams' },
  // ─── Cataluña ───
  { id: 'sky-es-lloret', lat: 41.7010, lng: 2.8460, name: 'Lloret de Mar - Costa Brava', city: 'Lloret de Mar', country: 'Spain', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive631.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/cataluna/gerona/lloret-de-mar-costa-brava.html', source: 'SkylineWebcams' },
  { id: 'sky-es-calafell', lat: 41.1970, lng: 1.5660, name: 'Calafell - Tarragona', city: 'Calafell', country: 'Spain', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive3822.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/cataluna/tarragona/calafell.html', source: 'SkylineWebcams' },
  { id: 'sky-es-barcelona-cat', lat: 41.3810, lng: 2.1970, name: 'Tour en Catamarán - Port Olímpic', city: 'Barcelona', country: 'Spain', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/cataluna/barcelona/catamaran.html', source: 'SkylineWebcams' },
  // ─── Cantabria ───
  { id: 'sky-es-sardinero', lat: 43.4750, lng: -3.7870, name: 'Santander - Playa del Sardinero', city: 'Santander', country: 'Spain', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive728.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/cantabria/santander/playa-del-sardinero.html', source: 'SkylineWebcams' },
  { id: 'sky-es-suances', lat: 43.4320, lng: -4.0420, name: 'Suances - Playa de la Concha', city: 'Suances', country: 'Spain', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive804.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/cantabria/suances/playa-de-la-concha.html', source: 'SkylineWebcams' },
  // ─── Baleares ───
  { id: 'sky-es-pujols', lat: 38.7230, lng: 1.4620, name: 'Formentera - Playa de Es Pujols', city: 'Formentera', country: 'Spain', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive4727.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/islas-baleares/formentera/playa-es-pujols.html', source: 'SkylineWebcams' },
  // ─── Murcia ───
  { id: 'sky-es-bullas', lat: 38.0497, lng: -1.6700, name: 'Bullas - Plaza de España', city: 'Bullas', country: 'Spain', feed_url: '/api/cctv/proxy?url=https%3A%2F%2Fcdn.skylinewebcams.com%2Flive299.jpg', external_url: 'https://www.skylinewebcams.com/en/webcam/espana/region-de-murcia/murcia/bullas-plaza-de-espana.html', source: 'SkylineWebcams' },
];

const SPAIN_CAMERAS: CctvCamera[] = [...YOUTUBE_LIVE, ...SKYLINE_SPAIN];

let dgtCache: { cameras: CctvCamera[], timestamp: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function fetchDGTCameras(): Promise<CctvCamera[]> {
  if (dgtCache && Date.now() - dgtCache.timestamp < CACHE_TTL_MS) {
    return dgtCache.cameras;
  }

  try {
    const response = await stealthFetch('https://www.dgt.es/.content/.assets/json/camaras.json', {
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return dgtCache?.cameras || [];
    const data = await response.json();
    
    if (!data || !Array.isArray(data.camaras)) {
      return [];
    }

    const cameras: CctvCamera[] = [];
    for (const cam of data.camaras) {
      const lat = parseFloat(cam.latitud);
      const lng = parseFloat(cam.longitud);
      
      if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) continue;

      const direction = cam.sentido !== '-' ? ` (${cam.sentido === '+' ? 'Ascending' : cam.sentido})` : '';
      const name = `${cam.carretera} km ${cam.pk}${direction}`;
      const city = PROVINCE_MAP[cam.provincia] || `Province ${cam.provincia}`;

      cameras.push({
        id: `dgt-${cam.id}`,
        lat,
        lng,
        name,
        city,
        country: 'Spain',
        feed_url: `/api/cctv/proxy?url=${encodeURIComponent(cam.imagen)}`,
        source: 'DGT'
      });
    }

    dgtCache = { cameras, timestamp: Date.now() };
    return cameras;
  } catch (error) {
    console.error('Failed to fetch DGT cameras:', error);
    return [];
  }
}

export async function fetchSpainCameras(): Promise<CctvCamera[]> {
  const dgtCameras = await fetchDGTCameras();
  const merged: CctvCamera[] = [...SPAIN_CAMERAS];

  for (const dgtCam of dgtCameras) {
    const isDuplicate = SPAIN_CAMERAS.some(staticCam => 
      Math.abs(staticCam.lat - dgtCam.lat) <= 0.001 && 
      Math.abs(staticCam.lng - dgtCam.lng) <= 0.001
    );

    if (!isDuplicate) {
      merged.push(dgtCam);
    }
  }

  return merged;
}
