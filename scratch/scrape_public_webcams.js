/**
 * OSIRIS — harvester for publicly broadcast webcams (throwaway, like
 * scrape_germany.js).
 *
 * These cameras are open data: their operators publish them themselves, on
 * their own sites and channels. What they lack is a catalogue, so this reads a
 * public index of them — a list of pages, not of feeds, with no coordinates
 * and no stream URLs across 383 different hosts — and turns the part OSIRIS
 * can actually show into a generated CctvCamera module.
 *
 * Three stages, run in order:
 *
 *   node scratch/scrape_public_webcams.js harvest   -> public-webcams-harvest.json
 *   node scratch/scrape_public_webcams.js geocode   -> public-webcams-places.json
 *   node scratch/scrape_public_webcams.js emit      -> ../src/app/api/cctv/public-webcams.generated.ts
 *
 * The places file is committed so `emit` is reproducible without hitting
 * Nominatim again.
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const INDEX_BASE = 'https://www.bekijkhet.nu/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
/** Nominatim's usage policy asks callers to identify themselves. */
const NOMINATIM_UA = 'osiris-cctv/1.0 (+https://github.com/simplifaisoul/osiris)';
const HERE = __dirname;
const HARVEST = path.join(HERE, 'public-webcams-harvest.json');
const PLACES = path.join(HERE, 'public-webcams-places.json');
const OUT = path.join(HERE, '..', 'src', 'app', 'api', 'cctv', 'public-webcams.generated.ts');

const PAGES = [
  ['wd', 'cams-wd.html'], ['fr', 'cams-fr.html'], ['gr', 'cams-gr.html'],
  ['dr', 'cams-dr.html'], ['fl', 'cams-fl.html'], ['ov', 'cams-ov.html'],
  ['gd', 'cams-gd.html'], ['nh', 'cams-nh.html'], ['zh', 'cams-zh.html'],
  ['ut', 'cams-ut.html'], ['zl', 'cams-zl.html'], ['nb', 'cams-nb.html'],
  ['lb', 'cams-lb.html'], ['vid', 'vid.html'], ['cruise', 'cruise.html'],
  ['bu', 'cams-bu.html'],
];

function fetchText(url, redirects = 0, agent = UA) {
  return new Promise((resolve) => {
    if (redirects > 5) return resolve('');
    const lib = url.startsWith('http://') ? http : https;
    const req = lib.get(url, { headers: { 'User-Agent': agent, Accept: '*/*' }, timeout: 20000 }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        return resolve(fetchText(new URL(res.headers.location, url).toString(), redirects + 1, agent));
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve(data));
    });
    req.on('timeout', () => { req.destroy(); resolve(''); });
    req.on('error', () => resolve(''));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The index serves raw entities; strip the handful its editors actually use. */
function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function clean(s) {
  return decodeEntities(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

/**
 * The place label carries a Frisian or dialect name in brackets — "Harlingen
 * (Harns)" — and the editors sometimes append a weather emoji. Neither belongs
 * in a geocoder query or on the map.
 */
function normalizePlace(raw) {
  return clean(raw)
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/[☀-➿️\u{1f300}-\u{1faff}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const CARD_RE = new RegExp(
  '<div class="image_1">\\s*<a href="([^"]+)"[^>]*>\\s*<img[^>]*alt="([^"]*)"[^>]*>\\s*</a>\\s*</div>\\s*' +
  '<h4 class="prid_text">(.*?)</h4>\\s*' +
  '<p class="korem_text">(.*?)</p>',
  'gs',
);

async function harvest() {
  const rows = [];
  const seen = new Set();

  for (const [region, page] of PAGES) {
    const html = await fetchText(`${INDEX_BASE}${page}`);
    if (!html) { console.error(`  !! ${page} leverde niets op`); continue; }
    let m, n = 0;
    CARD_RE.lastIndex = 0;
    while ((m = CARD_RE.exec(html)) !== null) {
      const url = m[1].trim();
      if (url.startsWith('mailto:') || url.startsWith('#') || !/^https?:/i.test(url)) continue;
      if (url.includes('rwsverkeersinfo.nl')) continue;   // already in netherlands.ts
      if (seen.has(url)) continue;
      seen.add(url);
      rows.push({ region, url, place: normalizePlace(m[3]), desc: clean(m[4]) });
      n++;
    }
    console.error(`  ${page.padEnd(16)} ${String(n).padStart(4)} camera's`);
  }

  // Resolve the Wowza platform family to a playable HLS playlist.
  const family = rows.filter((r) => r.url.includes('/pages/cameras/'));
  console.error(`\n  ${family.length} pagina's van het Wowza-platform oplossen...`);
  let statik = 0, tokened = 0, none = 0;
  for (const r of family) {
    const html = await fetchText(r.url);
    const hls = (html.match(/https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/) || [])[0];
    if (!hls) { none++; continue; }
    // Tokens carry wowzatokenendtime and expire inside 20 minutes — baking one
    // ships a URL that is already dead by the time anybody clicks it.
    if (/wowzatoken/i.test(hls)) { r.tokened = true; tokened++; continue; }
    r.hls = hls;
    statik++;
  }
  console.error(`  ${statik} statische HLS, ${tokened} met token (alleen link), ${none} zonder stream`);

  fs.writeFileSync(HARVEST, JSON.stringify(rows, null, 1));
  console.error(`\n  ${rows.length} camera's -> ${path.relative(process.cwd(), HARVEST)}`);
}


/* ────────────────────────────────────────────────────────────────────────────
 * Country and place resolution
 * ──────────────────────────────────────────────────────────────────────────── */

/** The Buitenland page labels a camera by country, in Dutch. */
const COUNTRIES = {
  'Australië': ['Australia', 'au'],        'België': ['Belgium', 'be'],
  'Belize': ['Belize', 'bz'],              'Bonaire': ['Bonaire', 'bq'],
  'Brazilië': ['Brazil', 'br'],            'Canada': ['Canada', 'ca'],
  'Croatië': ['Croatia', 'hr'],            'Curaçao': ['Curaçao', 'cw'],
  'Denemarken': ['Denmark', 'dk'],         'Duitsland': ['Germany', 'de'],
  'Estland': ['Estonia', 'ee'],            'Filipijnen': ['Philippines', 'ph'],
  'Finland': ['Finland', 'fi'],            'Frankrijk': ['France', 'fr'],
  'Griekenland': ['Greece', 'gr'],         'Groenland': ['Greenland', 'gl'],
  'IJsland': ['Iceland', 'is'],            'Ierland': ['Ireland', 'ie'],
  'Italië': ['Italy', 'it'],               'Jamaica': ['Jamaica', 'jm'],
  'Japan': ['Japan', 'jp'],                'Korea': ['South Korea', 'kr'],
  'Namibië': ['Namibia', 'na'],            'Noorwegen': ['Norway', 'no'],
  'Oostenrijk': ['Austria', 'at'],         'Polen': ['Poland', 'pl'],
  'Portugal': ['Portugal', 'pt'],          'Roemenië': ['Romania', 'ro'],
  'Rusland': ['Russia', 'ru'],             'Slovenië': ['Slovenia', 'si'],
  'Spanje': ['Spain', 'es'],               'Taiwan': ['Taiwan', 'tw'],
  'Thailand': ['Thailand', 'th'],          'Tjechië': ['Czechia', 'cz'],
  'U.K.': ['United Kingdom', 'gb'],        'U.S.A.': ['United States', 'us'],
  'Vaticaanstad': ['Vatican City', 'va'],  'Virgin Islands': ['US Virgin Islands', 'vi'],
  'Zuid-Afrika': ['South Africa', 'za'],   'Zweden': ['Sweden', 'se'],
  'Zwitserland': ['Switzerland', 'ch'],
};

/**
 * The Buitenland page names the country but not the place — that only ever
 * appears inside the free-text caption, in whatever form the editor felt like
 * ("Kransjka Gora", "Soi Buakhao, Pattaya Live", "Vanaf Hotel Hecht Basel").
 * Nominatim answers 3 in 16 of those raw; given the place name it answers 9 in
 * 9. So the captions are read once, here, by hand.
 *
 * `null` means the caption names no fixed place at all. Most of those are
 * aggregator channels — Virtual Railfan, EarthCam, PTZ TV — that cycle through
 * dozens of locations. A single pin would have to lie about where they are.
 */
const FOREIGN = {
  'Sydney Live Camera': ['Sydney'],
  'Webcams Lokeren': ['Lokeren'],
  'Stadhuis Sint-Niklaas': ['Stadhuis Sint-Niklaas'],
  'Diverse (weer-)beelden': null,
  'Zwin Natuurpark': ['Zwin, Knokke-Heist'],
  'Live stream Zoo': ['The Belize Zoo'],
  'Harbour Village (Coral Reef)': ['Kralendijk, Bonaire', ''],
  'G.O.R. Airport cams': null,
  'Maaxcam Ao Vivo': null,
  'Traincam Brasil': null,
  'Canmore (Alberta)': ['Canmore'],
  'Town of Collingwood': ['Collingwood, Ontario'],
  'Peace Bridge Authority': ['Peace Bridge, Fort Erie'],
  'Port au Basques': ['Channel-Port aux Basques'],
  'Absolute Stream': null,
  'Island of Hvar Live': ['Hvar'],
  'Saan TV': null,
  'Handelskade en pontjesbrug': ['Willemstad, Curacao', ''],
  'Show me Caribbean streams': null,
  'Nature Live Camera': null,
  'Afar TV (Vulcano)': null,
  'Earthcam op YouTube': null,
  'Railway streams': null,
  'Tripwebcam streams': null,
  'Berlin Tiergarten Skyline': ['Tiergarten, Berlin'],
  'Visit Bremen': ['Bremen'],
  'Livespotting cams': null,
  // Labelled Duitsland, but the Rhine falls are Swiss.
  'Watervallen Schaffhausen': ['Rheinfall, Schaffhausen', 'ch', 'Switzerland'],
  'Stadt Naumburg': ['Naumburg (Saale)'],
  'De Rijn bij Stadt Rees': ['Rees'],
  'Rijn vallei via Viewatch': null,
  '360Pano Tallinn': ['Tallinn'],
  "Wildcamera's RMK.ee": null,
  'Agdao, Davao City': ['Davao City'],
  'Muikku LIVE - Kuopion Tori': ['Kuopio'],
  'Levi Ski Resort': ['Levi, Kittilä'],
  'Port of Helsinki': ['Helsinki'],
  'City of Rovaniemi': ['Rovaniemi'],
  'Apukka Aurora Cam': ['Apukka, Rovaniemi'],
  'Vision Environnement': null,
  'Greenland Airports': null,
  'MBL Iceland streams': null,
  'Live from Ireland': null,
  'Temple Bar Dublin': ['Temple Bar, Dublin'],
  'Havenbeelden Dublin': ['Dublin Port'],
  'I Love You Venice': ['Venezia'],
  'Webcam DI T&T': null,
  'Liguria Live Rail': null,
  'Paesaggi Digitali': null,
  'Scenari Digitali': null,
  'Umbria Webcam': null,
  'Weather cams Sicily': null,
  'See Jamaica': null,
  'The Dramatic (Railcams)': null,
  'Tokyo Shinjuku Live': ['Shinjuku, Tokyo'],
  'Healing Nowon Live': ['Nowon-gu, Seoul'],
  'Namibia Cam': null,
  'Live Norway': null,
  'Norway Live': null,
  'Sør-Varanger Kirkenes': ['Kirkenes'],
  'NorthCape Seafishing': ['Nordkapp'],
  'Alpengasthof Tannenalm': null,
  'Views from the sky': null,
  'Kamery Internetowe': null,
  'Lisbon Airport Wings': ['Aeroporto Humberto Delgado, Lisboa'],
  'Madeira Web Live': ['Funchal'],
  'Madeira Airport Live': ['Aeroporto da Madeira'],
  'Portal Netmadeira': null,
  'Playocean Live': null,
  'Webcam Romania': null,
  'See Transylvania': null,
  'Lensk LR': ['Lensk'],
  'Smotriomsk streams': null,
  'Mobotix St. Petersburg': ['Sankt-Peterburg'],
  'Kransjka Gora': ['Kranjska Gora'],
  'ISS Station live': null,                       // not a place on this planet
  'Asafegi Girona Centre': ['Girona'],
  'Balearen - Vision Digital': null,
  'Benicam Benidorm webcam': ['Benidorm'],
  'Benidorm Live': ['Benidorm'],
  'Camping Cap-Blanch': ['Cap Blanch, Altea'],
  'Gran Canaria Live': ['Las Palmas de Gran Canaria'],
  'Lanzarote webcam': ['Arrecife, Lanzarote'],
  'Vaya Webcams': null,
  'WifiGomera': ['San Sebastián de la Gomera'],
  'Taoyuan Travel': ['Taoyuan'],
  'The Real Samui Webcams': ['Ko Samui'],
  'Soi Buakhao, Pattaya Live': ['Pattaya'],
  'Slow TV Live': null,
  'Vanaf Hotel Mozart': null,
  'Ammanford (Wales)': ['Ammanford'],
  'Coast Cams 24/7': null,
  'Dorset Council': ['Dorchester, Dorset'],
  'Isle of Wight': ['Isle of Wight'],
  'Manchester Airport': ['Manchester Airport'],
  'North Yorkshire Moors Railway': ['Pickering, North Yorkshire'],
  'Oxford Martin School': ['Oxford Martin School'],
  'Pembrokeshire Broad Haven': ['Broad Haven, Pembrokeshire'],
  'Port isaac (Cornwall)': ['Port Isaac'],
  'Railcam UK Live': null,
  'Solent Ships': ['Cowes, Isle of Wight'],
  'Atlantic City Boardwalk': ['Atlantic City, New Jersey'],
  'Three Rivers Parks': ['Plymouth, Minnesota'],
  'Boston and Maine Live': null,
  'Breckenridge Mainstreet': ['Breckenridge, Colorado'],
  'BLC Streams': null,
  'Carolina Webcam Streaming': null,
  'Charlevoix Cams': ['Charlevoix, Michigan'],
  'City of Coldwater': ['Coldwater, Michigan'],
  "Clearwater - Jimmy's Crowsnest": ['Clearwater Beach, Florida'],
  'Hamptons Cams': ['Southampton, New York'],
  'City of Hollywood': ['Hollywood, Florida'],
  'ABC13 Houston': ['Houston, Texas'],
  'Jonesborough Historic Town': ['Jonesborough, Tennessee'],
  'Los Angeles Airportcam': ['Los Angeles International Airport'],
  'Leavenworth Washington': ['Leavenworth, Washington'],
  'Official Live Trains': null,
  "Go Martha's Vineyard": ["Martha's Vineyard"],
  'SeaTac Airport (Mount Rainier)': ['Seattle-Tacoma International Airport'],
  'Myrtle Beach': ['Myrtle Beach, South Carolina'],
  'Newburyport.com': ['Newburyport, Massachusetts'],
  'Pacifica Pier and Beach': ['Pacifica Pier, California'],
  'Port Angeles/Fairchild Airport': ['Port Angeles, Washington'],
  'Port Everglades trafficcams': ['Port Everglades, Florida'],
  'PTZ TV Livestreams': null,
  'San Diego Webcam(s)': ['San Diego, California'],
  'San Diego Zoo': ['San Diego Zoo'],
  'St. Augustine Live': ['St. Augustine, Florida'],
  'Steel Highway Railcams': null,
  'Stream Time Live': null,
  'Sugarloaf Mountain': ['Sugarloaf Mountain, Maine'],
  'Tehachapi Live Trains': ['Tehachapi, California'],
  'UND Dept. of Atmospheric Sciences': ['University of North Dakota, Grand Forks'],
  'Virtual Railfan': null,
  'White Sands Beach Resort': null,
  'Winter Garden': ['Winter Garden, Florida'],
  'Sint Pieterplein': ["Piazza San Pietro"],
  'Saint John': ['Cruz Bay, Saint John, U.S. Virgin Islands', ''],
  'South Africa webcams': null,
  'Allen Birdcams': null,
  'Med Mediateknik cams': null,
  'Vanaf Hotel Hecht Basel': ['Basel'],
  'Luzern live': ['Luzern'],
  'Zürich Hauptbahnhof': ['Zürich Hauptbahnhof'],
};

/**
 * Where each camera should be looked up, and under which country it belongs.
 * Returns null for anything we have decided not to place.
 */
/** Labels the geocoder spells differently, and labels that name no place at all. */
const NL_ALIAS = { 'Petten aan Zee': 'Petten' };
const NL_NOT_A_PLACE = new Set(['Evenement in beeld', 'Treinenradar', 'Vliegtuigradar',
  'Scheepvaartradar', 'Cruiseschepen in Nederland', 'IJmuiden Amsterdam Rotterdam']);

/**
 * One camera in the index is run by the people who keep the index, and both
 * its caption and its channel handle say so. Every other camera here is named
 * for what it looks at, and the handle is not something this can rewrite
 * without breaking the link — so it is left out rather than carried as the one
 * piece of branding in the set.
 */
const OPERATOR_BRANDED = /bekijkhet/i;

/** One predicate for both stages, so the place table holds exactly what emit asks for. */
function included(row) {
  return Boolean(playableKind(row)) && !OPERATOR_BRANDED.test(row.desc) && !OPERATOR_BRANDED.test(row.url);
}

function lookupPlan(row) {
  if (row.region !== 'bu') {
    if (NL_NOT_A_PLACE.has(row.place)) return null;
    const place = NL_ALIAS[row.place] || row.place;
    // Dutch pages give a real place label. The caption often names a landmark
    // inside it — a bridge, a pier, a square — which puts the pin where the
    // camera actually is instead of on the village centre.
    return {
      country: 'Netherlands',
      city: place,
      cc: 'nl',
      queries: [`${row.desc}, ${place}`, place],
    };
  }
  const country = COUNTRIES[row.place];
  const manual = FOREIGN[row.desc];
  if (!country || manual === undefined || manual === null) return null;
  const [query, ccOverride, countryOverride] = manual;
  return {
    country: countryOverride || country[0],
    city: query.split(',')[0].trim(),
    // '' is a deliberate override meaning "search unfiltered", so test for
    // undefined rather than falsiness.
    cc: ccOverride === undefined ? country[1] : ccOverride,
    queries: [query],
  };
}

/** OpenStreetMap Nominatim, one request a second, as their policy asks. */
async function geocodeOnce(query, cc) {
  // Nominatim has no countrycodes entry for some overseas territories (bq, cw,
  // vi all answer empty), so those are looked up unfiltered on a query that
  // names the island itself.
  const filter = cc ? `&countrycodes=${cc}` : '';
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}` +
    `${filter}&format=json&limit=1`;
  const body = await fetchText(url, 0, NOMINATIM_UA);
  try {
    const hits = JSON.parse(body);
    if (!Array.isArray(hits) || !hits.length) return null;
    return {
      lat: Number(hits[0].lat),
      lng: Number(hits[0].lon),
      display_name: hits[0].display_name,
    };
  } catch { return null; }
}

/** Sorted for a stable diff — as a replacer, a key array would strip the values. */
function writePlaces(places) {
  const sorted = {};
  for (const k of Object.keys(places).sort()) sorted[k] = places[k];
  fs.writeFileSync(PLACES, JSON.stringify(sorted, null, 1) + '\n');
}

async function geocode() {
  const rows = JSON.parse(fs.readFileSync(HARVEST, 'utf8'));
  const places = fs.existsSync(PLACES) ? JSON.parse(fs.readFileSync(PLACES, 'utf8')) : {};

  const wanted = new Set();
  for (const row of rows) {
    if (!included(row)) continue;
    const plan = lookupPlan(row);
    if (!plan) continue;
    for (const q of plan.queries) wanted.add(`${plan.cc}|${q}`);
  }

  // Drop keys left behind by an earlier caption, so the committed file stays
  // exactly the set this generator asks for.
  for (const key of Object.keys(places)) if (!wanted.has(key)) delete places[key];

  const todo = [...wanted].filter((k) => !(k in places));
  console.error(`  ${wanted.size} zoektermen, ${todo.length} nog op te halen (${wanted.size - todo.length} uit cache)`);

  let done = 0;
  for (const key of todo) {
    const [cc, ...rest] = key.split('|');
    places[key] = await geocodeOnce(rest.join('|'), cc);
    done++;
    if (done % 25 === 0) {
      writePlaces(places);
      console.error(`  ${done}/${todo.length}`);
    }
    await sleep(1100);
  }

  writePlaces(places);
  const hits = Object.values(places).filter(Boolean).length;
  console.error(`  klaar: ${hits}/${Object.keys(places).length} zoektermen hebben een coördinaat`);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Classification and emission
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * What OSIRIS can do with a link.
 *
 *   'hls'      — a token-free .m3u8 we can play in place.
 *   'youtube'  — a channel live link. /api/cctv/resolve turns it into the
 *                broadcast that is on air now; nothing is baked.
 *   'iframe'   — a provider embed page that stands on its own.
 *   'external' — a link out. Either the stream is locked to the operator's own
 *                page by an expiring token or a Referer check, so copying it
 *                would ship a dead URL, or the site asks not to be read around
 *                its advertising (see AD_WALLED_HOSTS).
 *
 * Anything else is a long-tail page we cannot read, and returns null.
 */
/**
 * Sites that answer an ad-blocker by replacing the camera with a notice: the
 * advertising is what keeps them online, please switch the blocker off.
 *
 * Playing their playlist here would do the very thing that notice objects to —
 * take the picture and leave the page, and the advertising on it, unloaded.
 * That these particular playlists carry no token is an accident of how each
 * site was set up, not permission. So they link out, exactly like the ones
 * whose token we cannot hold: a way through to the camera rather than a copy
 * of it.
 *
 * Determined by fetching each host's front page and looking for the notice.
 * Kept as a list rather than probed at generation time so the decision is
 * reviewable, and so a site that is briefly unreachable cannot quietly promote
 * itself back to being replayed here.
 */
const AD_WALLED_HOSTS = new Set([
  'webcam-aalsmeer.nl', 'webcam-airport.nl', 'webcam-blokzijl.nl', 'webcam-delfzijl.nl',
  'webcam-enkhuizen.nl', 'webcam-harlingen.nl', 'webcam-hoekvanholland.nl',
  'webcam-leeuwarden.nl', 'webcam-lelystad.nl', 'webcam-monnickendam.nl',
  'webcam-rotterdam.nl', 'webcam-zaanzicht.nl', 'webcams-ameland.nl',
  'webcams-texel.nl', 'webcams-vlissingen.nl', 'webcamvlieland.nl',
]);

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function playableKind(row) {
  const url = row.url;
  if (row.hls) return AD_WALLED_HOSTS.has(hostOf(url)) ? 'external' : 'hls';
  if (/(^|\.)youtube\.com|(^|\.)youtu\.be/.test(new URL(url).hostname)) return 'youtube';
  if (/rtsp\.me\/embed\/|ipcamlive\.com/.test(url)) return 'iframe';
  if (row.tokened) return 'external';                       // Wowza, ~20 min token
  if (/bouw\.live|netcamviewer\.nl/.test(url)) return 'external';  // hotlink-protected
  return null;
}

/**
 * A YouTube channel's "/streams" tab lists past broadcasts; "/live" is the one
 * on air. They differ by a path segment, and only the second is something
 * parseYouTubeUrl recognises as a live channel — which is what puts the camera
 * through /api/cctv/resolve instead of leaving it as a bare link.
 */
function youtubeLiveUrl(url) {
  const u = new URL(url);
  if (/\/watch$|\/live\/|\/embed\//.test(u.pathname) || u.searchParams.get('v')) return url;
  const segments = u.pathname.split('/').filter(Boolean);
  if (!segments.length) return url;
  if (segments[segments.length - 1] === 'live') return url;
  const handle = segments[0];
  return `https://www.youtube.com/${handle}/live`;
}

function ipcamlivePlayer(url) {
  const alias = new URL(url).pathname.split('/').filter(Boolean).pop();
  return `https://www.ipcamlive.com/player/player.php?alias=${alias}&autoplay=1`;
}

function slug(s) {
  return s
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 46);
}

const AMERICAS = new Set(['United States', 'Canada', 'Brazil', 'Belize', 'Jamaica',
  'Curaçao', 'Bonaire', 'US Virgin Islands']);
const EUROPE = new Set(['Belgium', 'Germany', 'Estonia', 'Finland', 'France', 'Greece',
  'Iceland', 'Ireland', 'Italy', 'Norway', 'Austria', 'Poland', 'Portugal', 'Romania',
  'Slovenia', 'Spain', 'Czechia', 'United Kingdom', 'Vatican City', 'Sweden',
  'Switzerland', 'Denmark', 'Croatia']);

function bucket(country) {
  if (country === 'Netherlands') return 'NETHERLANDS';
  if (EUROPE.has(country)) return 'EUROPE';
  if (AMERICAS.has(country)) return 'AMERICAS';
  return 'REST';
}

function build() {
  const rows = JSON.parse(fs.readFileSync(HARVEST, 'utf8'));
  const places = JSON.parse(fs.readFileSync(PLACES, 'utf8'));
  const cams = [];
  const ids = new Set();
  const dropped = { unreadable: 0, unplaced: [], noPlan: 0, branded: 0 };

  for (const row of rows) {
    const kind = playableKind(row);
    if (!kind) { dropped.unreadable++; continue; }
    if (!included(row)) { dropped.branded++; continue; }

    const plan = lookupPlan(row);
    if (!plan) { dropped.noPlan++; continue; }

    let hit = null;
    for (const q of plan.queries) {
      hit = places[`${plan.cc}|${q}`];
      if (hit) break;
    }
    if (!hit) { dropped.unplaced.push(`${plan.country} — ${row.place} — ${row.desc}`); continue; }

    let id = `pubcam-${slug(plan.country)}-${slug(plan.city)}-${slug(row.desc)}`;
    for (let n = 2; ids.has(id); n++) id = `pubcam-${slug(plan.country)}-${slug(plan.city)}-${slug(row.desc)}-${n}`;
    ids.add(id);

    const cam = {
      id,
      lat: Number(hit.lat.toFixed(6)),
      lng: Number(hit.lng.toFixed(6)),
      name: row.desc,
      city: plan.city,
      country: plan.country,
    };
    if (kind === 'hls') { cam.stream_url = row.hls; cam.stream_type = 'hls'; cam.external_url = row.url; }
    else if (kind === 'iframe') {
      cam.stream_url = row.url.includes('ipcamlive') ? ipcamlivePlayer(row.url) : row.url;
      cam.stream_type = 'iframe';
      cam.external_url = row.url;
    } else if (kind === 'youtube') cam.external_url = youtubeLiveUrl(row.url);
    else cam.external_url = row.url;
    cam.source = 'Public Webcam';

    cams.push({ ...cam, _bucket: bucket(plan.country) });
  }

  cams.sort((a, b) => a.country.localeCompare(b.country) || a.city.localeCompare(b.city) || a.name.localeCompare(b.name));
  return { cams, dropped };
}

const ORDER = ['id', 'lat', 'lng', 'name', 'city', 'country', 'feed_url', 'stream_url', 'stream_type', 'external_url', 'source'];

function literal(cam) {
  const parts = ORDER.filter((k) => cam[k] !== undefined)
    .map((k) => `${k}: ${typeof cam[k] === 'number' ? cam[k] : JSON.stringify(cam[k]).replace(/'/g, "\\'").replace(/^"|"$/g, "'")}`);
  return `  { ${parts.join(', ')} },`;
}

function emit() {
  const { cams, dropped } = build();
  const buckets = { NETHERLANDS: [], EUROPE: [], AMERICAS: [], REST: [] };
  for (const c of cams) { const b = c._bucket; delete c._bucket; buckets[b].push(c); }

  const kinds = cams.reduce((a, c) => {
    const k = c.stream_type || (/youtube\.com/.test(c.external_url || '') ? 'youtube' : 'link');
    a[k] = (a[k] || 0) + 1; return a;
  }, {});

  const blocks = Object.entries(buckets).map(([name, list]) => {
    const lines = [];
    let country = null;
    for (const cam of list) {
      if (cam.country !== country) {
        country = cam.country;
        lines.push(`  // ── ${country} (${list.filter((c) => c.country === country).length}) ──`);
      }
      lines.push(literal(cam));
    }
    return `export const ${name}_PUBLIC_WEBCAMS: CctvCamera[] = [\n${lines.join('\n')}\n];`;
  });

  const header = `import type { CctvCamera } from './types';

/**
 * OSIRIS — publicly broadcast webcams (GENERATED).
 *
 * Open data, in the plainest sense: every camera here is one its operator
 * publishes themselves, on their own site or their own channel. What the web
 * does not have is a catalogue of them, so these were gathered by reading a
 * public index of such cameras — a list of pages rather than of feeds, with no
 * coordinates and no stream URLs, across 383 different hosts. This file is
 * what is left after reading those pages, and only what OSIRIS can actually
 * show. Regenerate with scratch/scrape_public_webcams.js.
 *
 * The 26 Rijkswaterstaat motorway cameras that index also lists are skipped:
 * netherlands.ts already fetches those live from the RWS API.
 *
 * Four shapes come out of it:
 *
 *   HLS      — a Wowza platform shared by a family of Dutch webcam sites,
 *              where the playlist carries no token. streamlock.net sends
 *              Access-Control-Allow-Origin: *, so these play straight from the
 *              browser and need no proxy entry.
 *   YouTube  — the operator broadcasts on their own channel. The link is the
 *              channel's /live URL, never a video id: these run for months and
 *              come back under a new id after every restart, so the id is
 *              resolved per request by /api/cctv/resolve rather than baked.
 *   iframe   — a provider embed page that stands on its own.
 *   link     — external_url alone, which puts the viewer into the viewer's
 *              external state: a way through to the camera rather than a copy
 *              of it. Three things land here.
 *
 * The third of those is worth spelling out, because it is a decision and not a
 * limitation. Most of the Wowza family answer an ad-blocker by replacing the
 * camera with a notice: the advertising is what keeps them online, please
 * switch the blocker off. Replaying their playlist here does the very thing
 * that notice objects to — takes the picture and leaves the page, and the
 * advertising on it, unloaded. That those particular playlists carry no token
 * is an accident of how each site was set up, not permission. So they link out
 * too, and only the handful of sites that ask nothing of their visitors are
 * played in place. The other two are a Wowza token that expires inside twenty
 * minutes, and a Referer check the browser cannot satisfy from here.
 *
 * external_url always points at the operator who runs the camera.
 *
 * Coordinates were resolved via OpenStreetMap Nominatim, country-filtered, and
 * cached in scratch/public-webcams-places.json so regenerating does not ask
 * again. Dutch cameras are looked up on their caption first ("Sint
 * Servaasbrug, Maastricht") and fall back to the village. Cameras whose caption
 * names no fixed place — aggregator channels cycling through dozens of
 * locations — are left out rather than pinned somewhere they are not.
 */
`;

  fs.writeFileSync(OUT, `${header}\n${blocks.join('\n\n')}\n`);

  console.error(`  ${cams.length} camera's geschreven naar ${path.relative(process.cwd(), OUT)}`);
  console.error(`    per soort: ${JSON.stringify(kinds)}`);
  for (const [b, l] of Object.entries(buckets)) console.error(`    ${b.padEnd(12)} ${l.length}`);
  console.error(`\n  overgeslagen: ${dropped.unreadable} niet uit te lezen, ${dropped.noPlan} zonder vaste plaats, ${dropped.branded} met de naam van de index erin`);
  if (dropped.unplaced.length) {
    console.error(`  ${dropped.unplaced.length} zonder coördinaat:`);
    for (const d of dropped.unplaced) console.error(`    - ${d}`);
  }
}

if (require.main === module) {
  const stage = process.argv[2];
  const stages = { harvest, geocode, emit };
  if (!stages[stage]) {
    console.error('gebruik: node scratch/scrape_public_webcams.js <harvest|geocode|emit>');
    process.exit(1);
  }
  Promise.resolve(stages[stage]()).catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { normalizePlace, clean, decodeEntities, fetchText, sleep, HARVEST, PLACES, OUT };
