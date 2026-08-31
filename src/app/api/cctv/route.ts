import { NextResponse } from 'next/server';
import { stealthFetch } from '@/lib/stealthFetch';

export const maxDuration = 60;
import { fetchAsfinagCameras } from './asfinag';
import { fetchBulgariaCameras } from './bulgaria';
import { fetchGreeceCameras } from './greece';
import { fetchSerbiaCameras } from './serbia';
import { fetchMacedoniaCameras } from './macedonia';
import { fetchTurkeyCameras } from './turkey';
import { fetchRomaniaCameras } from './romania';
import { fetchAustraliaCameras } from './australia';
import { fetchItalyCameras } from './italy';
import { fetchCzechiaCameras } from './czechia';
import { fetchSlovakiaCameras } from './slovakia';
import { fetchGermanyCameras } from './germany';
import { fetchFranceCameras } from './france';
import { fetchSpainCameras } from './spain';
import { fetchPolandCameras } from './poland';
import { fetchJapanCameras } from './japan';
import { fetchSwitzerlandCameras } from './switzerland';
import { fetchFinlandCameras } from './finland';
import { fetchHongKongCameras } from './hongkong';
import { fetchUtahCameras } from './utah';
import { fetchIcelandCameras } from './iceland';
import { fetchTaiwanCameras } from './taiwan';
import { fetchThailandCameras } from './thailand';
import { fetchAsiaLiveCameras } from './asia-live';
import { fetchNewZealandCameras } from './newzealand';
import { fetchOregonCameras } from './oregon';
import { fetchMichiganCameras } from './michigan';
import { fetchIndianaCameras } from './indiana';
import { fetchNevadaCameras } from './nevada';
import {
  fetchLatamLiveCameras,
  fetchAfricaLiveCameras,
  fetchEuropeLiveCameras,
} from './world-live';

/**
 * OSIRIS — Worldwide CCTV Camera API v2
 * Viewport-aware: pass ?region=xx to load cameras for specific regions
 * Supports: uk, us-east, us-west, us-central, canada, europe, asia
 * Or pass ?lat=x&lng=y&radius=5 for proximity-based loading
 */

// ═══ CAMERA SOURCE DEFINITIONS ═══

// ── UK: Transport for London JamCams (~900) ──
async function fetchTfLCameras(): Promise<any[]> {
  try {
    const res = await stealthFetch('https://api.tfl.gov.uk/Place/Type/JamCam', { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data || []).map((cam: any) => {
      const imgProp = cam.additionalProperties?.find((p: any) => p.key === 'imageUrl');
      const camId = cam.id?.replace('JamCams_', '') || '';
      return {
        id: `tfl-${cam.id}`, lat: cam.lat, lng: cam.lon,
        name: cam.commonName || 'London JamCam', city: 'London', country: 'UK',
        feed_url: imgProp?.value || `https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/${camId}.jpg`,
        source: 'TfL',
      };
    }).filter((c: any) => c.lat && c.lng);
  } catch (e) { return []; }
}

// ── US-WEST: WSDOT Washington State (~500) ──
async function fetchWSDOTCameras(): Promise<any[]> {
  try {
    const res = await stealthFetch('https://data.wsdot.wa.gov/log/public/cameras.json', { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data || []).map((cam: any) => ({
      id: `wsdot-${cam.CameraID}`, lat: cam.CameraLocation?.Latitude, lng: cam.CameraLocation?.Longitude,
      name: cam.Title || 'WSDOT Camera', city: 'Washington', country: 'US',
      feed_url: cam.ImageURL || '', source: 'WSDOT',
    })).filter((c: any) => c.lat && c.lng && c.feed_url);
  } catch (e) { return []; }
}

// ── US-WEST: Caltrans California ──
async function fetchCaltransCameras(): Promise<any[]> {
  try {
    const res = await stealthFetch('https://caltrans-gis.dot.ca.gov/arcgis/rest/services/CHhighway/CCTV/FeatureServer/0/query?where=1%3D1&outFields=*&f=json', { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return [];
    const data = await res.json();
    const cams = [];
    for (const feature of (data?.features || [])) {
      const p = feature.attributes;
      const lat = p.latitude;
      const lng = p.longitude;
      const url = p.currentImageURL;
      if (!lat || !lng || !url) continue;
      cams.push({
        id: `cal-${p.OBJECTID}`,
        lat,
        lng,
        name: p.locationName || 'Caltrans',
        city: p.nearbyPlace || p.county || 'California',
        country: 'US',
        feed_url: url,
        source: 'Caltrans'
      });
    }
    return cams;
  } catch (e) {
    return [];
  }
}

// ── CANADA: Ottawa, Toronto, Montreal, Quebec ──
async function fetchCanadaCameras(): Promise<any[]> {
  const cams: any[] = [];

  // Ottawa Municipal Cameras (Comprehensive)
  try {
    const res = await stealthFetch('https://traffic.ottawa.ca/beta/camera_list', { signal: AbortSignal.timeout(12000) });
    if (res.ok) {
      const data = await res.json();
      for (const cam of (data || [])) {
        if (!cam.latitude || !cam.longitude) continue;
        cams.push({
          id: `ottawa-muni-${cam.id}`, lat: cam.latitude, lng: cam.longitude,
          name: cam.description || 'Ottawa Traffic Camera', city: 'Ottawa', country: 'Canada',
          feed_url: `https://traffic.ottawa.ca/map/camera?id=${cam.number || cam.id}`, source: 'City of Ottawa',
        });
      }
    }
  } catch (e) { /* silent */ }

  // Quebec 511 (Comprehensive - covers Montreal, Quebec City, highways)
  try {
    const res = await stealthFetch('https://ws.mapserver.transports.gouv.qc.ca/swtq?service=wfs&version=2.0.0&request=getfeature&typename=ms:infos_cameras&outfile=Camera&srsname=EPSG:4326&outputformat=geojson', { signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      const data = await res.json();
      for (const feature of (data.features || [])) {
        const coords = feature.geometry?.coordinates;
        const p = feature.properties;
        if (!coords || !p || !p.IDEcamera) continue;
        
        cams.push({
          id: `quebec511-${p.IDEcamera}`, lat: coords[1], lng: coords[0],
          name: p.DescriptionLocalisationEn || p.DescriptionLocalisationFr || 'Quebec 511 Camera', city: p.NomRegionDiffusion || 'Quebec', country: 'Canada',
          stream_url: p.URL_FLUX_DONNEE ? p.URL_FLUX_DONNEE.replace('FenetreVideo.html', 'camera.ashx') + '&format=mp4' : `https://www.quebec511.info/Carte/Fenetres/camera.ashx?id=${p.IDEcamera}&format=mp4`,
          stream_type: 'mp4',
          source: 'Quebec 511',
        });
      }
    }
  } catch (e) { /* silent */ }

  // Ontario 511 (MTO Highway Cameras)
  try {
    const res = await stealthFetch('https://511on.ca/api/v2/get/cameras', { signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      const data = await res.json();
      for (const cam of (data || [])) {
        if (!cam.latitude || !cam.longitude) continue;
        cams.push({
          id: `on-${cam.id || cams.length}`, lat: cam.latitude, lng: cam.longitude,
          name: cam.description || cam.name || 'Ontario Camera', city: 'Ontario', country: 'Canada',
          feed_url: cam.imageUrl || cam.url || '', source: '511 Ontario',
        });
      }
    }
  } catch (e) { /* silent */ }

  // Ville de Montréal municipal cameras
  try {
    const res = await stealthFetch('https://ville.montreal.qc.ca/circulation/sites/ville.montreal.qc.ca.circulation/files/cameras.json', { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = await res.json();
      for (const cam of (data || [])) {
        cams.push({
          id: `mtl-muni-${cams.length}`, lat: cam.latitude || cam.lat, lng: cam.longitude || cam.lng,
          name: cam.description || cam.name || 'Montréal Camera', city: 'Montréal', country: 'Canada',
          feed_url: cam.url || cam.imageUrl || '', source: 'Ville MTL',
        });
      }
    }
  } catch (e) { /* silent */ }

  // Curated Toronto cameras (fallback if 511ON fails)
  const curated = [
    { id: 'tor-1', lat: 43.6532, lng: -79.3832, name: 'Yonge / Dundas Square', city: 'Toronto', country: 'Canada', feed_url: 'https://511on.ca/api/v2/get/cameras', source: '511 Ontario' },
    { id: 'tor-2', lat: 43.6426, lng: -79.3871, name: 'CN Tower / Lakeshore', city: 'Toronto', country: 'Canada', feed_url: 'https://511on.ca/api/v2/get/cameras', source: '511 Ontario' },
    { id: 'tor-3', lat: 43.6711, lng: -79.3868, name: 'Bloor / Yonge', city: 'Toronto', country: 'Canada', feed_url: 'https://511on.ca/api/v2/get/cameras', source: '511 Ontario' },
  ];
  cams.push(...curated);

  // Alberta 511
  try {
    const res = await stealthFetch('https://511.alberta.ca/api/v2/get/cameras', { signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      const data = await res.json();
      for (const cam of (data || [])) {
        if (!cam.Latitude || !cam.Longitude || !cam.Views?.[0]?.Url) continue;
        cams.push({
          id: `ab-${cam.Id || cams.length}`, lat: cam.Latitude, lng: cam.Longitude,
          name: cam.Location || 'Alberta Camera', city: 'Alberta', country: 'Canada',
          feed_url: cam.Views[0].Url, source: 'Alberta 511',
        });
      }
    }
  } catch (e) { /* silent */ }


  // Toronto Open Data Municipal Traffic Cameras
  try {
    const res = await stealthFetch('https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/a3309088-5fd4-4d34-8297-77c8301840ac/resource/4a568300-c7f8-496d-b150-dff6f5dc6d4f/download/traffic-camera-list-4326.geojson', { signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      const data = await res.json();
      for (const feature of (data.features || [])) {
        let coords = feature.geometry?.coordinates;
        if (Array.isArray(coords) && Array.isArray(coords[0])) coords = coords[0];
        const p = feature.properties;
        if (!coords || !p || !p.IMAGEURL) continue;
        cams.push({
          id: `tor-open-${p.REC_ID}`, lat: coords[1], lng: coords[0],
          name: `${p.MAINROAD} / ${p.CROSSROAD}`, city: 'Toronto', country: 'Canada',
          feed_url: p.IMAGEURL, source: 'City of Toronto',
        });
      }
    }
  } catch (e) { /* silent */ }

  // British Columbia HighwayCams (Live JSON API)
  try {
    const res = await stealthFetch('https://drivebc.ca/api/webcams', { signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      const data = await res.json();
      for (const cam of (data || [])) {
        if (!cam.location?.coordinates || !cam.links?.imageDisplay) continue;
        const [lng, lat] = cam.location.coordinates;
        cams.push({
          id: `bc-cam-${cam.id}`, lat, lng,
          name: cam.name || cam.caption || 'BC Highway Camera', city: 'British Columbia', country: 'Canada',
          feed_url: `https://drivebc.ca${cam.links.imageDisplay}`, source: 'DriveBC',
        });
      }
    }
  } catch (e) { /* silent */ }

  return cams.filter((c: any) => c.lat && c.lng);
}

// ── US-CENTRAL: Chicago, Houston, Dallas, Denver ──
async function fetchUSCentralCameras(): Promise<any[]> {
  const cams: any[] = [];
  // Illinois DOT
  try {
    const res = await stealthFetch('https://www.travelmidwest.com/lmiga/cameraReport.json', { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = await res.json();
      for (const cam of (data?.cameraReports || data || []).slice(0, 800)) {
        if (!cam.latitude || !cam.longitude) continue;
        cams.push({
          id: `ildot-${cams.length}`, lat: cam.latitude, lng: cam.longitude,
          name: cam.cameraName || cam.description || 'IDOT Camera', city: 'Illinois', country: 'US',
          feed_url: cam.imageUrl || cam.url || '', source: 'IDOT',
        });
      }
    }
  } catch (e) { /* silent */ }

  return cams.filter((c: any) => c.lat && c.lng);
}

// ── US-EAST: OH, DC, Florida, Georgia ──
async function fetchUSEastCameras(): Promise<any[]> {
  const cams: any[] = [];

  // Butler County, OH (from redhunt45 fork)
  cams.push(
    {
      id: 'butler-oh-hamilton', lat: 39.3988617, lng: -84.5595353,
      name: 'Hamilton, OH', city: 'Hamilton', country: 'US',
      feed_url: 'https://gsccam.butlersheriff.org/axis-cgi/jpg/image.cgi',
      external_url: 'https://gsccam.butlersheriff.org/camera/index.html#/video',
      source: 'Butler County, OH',
    },
    {
      id: 'butler-oh-129-747', lat: 39.381435, lng: -84.438423,
      name: 'OH-129 at 747', city: 'Butler County', country: 'US',
      feed_url: 'https://towercam.butlersheriff.org/axis-cgi/jpg/image.cgi',
      external_url: 'https://towercam.butlersheriff.org/aca/index.html#view',
      source: 'Butler County, OH',
    },
  );

  // Cincinnati, OH (from redhunt45 fork)
  cams.push(
    {
      id: 'cincinnati-cincyvision-yt', lat: 39.089101, lng: -84.527943,
      name: 'CincyVision YT', city: 'Cincinnati', country: 'US',
      external_url: 'https://www.youtube.com/@AaronPreslin/live',
      source: 'Cincinnati, OH',
    },
    {
      id: 'cincinnati-covington-earthcam', lat: 39.090510, lng: -84.510413,
      name: 'Cincinnati-Covington EarthCam', city: 'Covington', country: 'US',
      external_url: 'https://www.earthcam.com/usa/kentucky/covington/?cam=covington',
      source: 'Cincinnati, OH',
    },
  );
  // Florida 511
  try {
    const res = await stealthFetch('https://fl511.com/api/v2/cameras', { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = await res.json();
      for (const cam of (data || []).slice(0, 800)) {
        if (!cam.latitude || !cam.longitude) continue;
        cams.push({
          id: `fl-${cams.length}`, lat: cam.latitude, lng: cam.longitude,
          name: cam.description || 'FL-511 Camera', city: 'Florida', country: 'US',
          feed_url: cam.imageUrl || '', source: 'FL-511',
        });
      }
    }
  } catch (e) { /* silent */ }


  return cams.filter((c: any) => c.lat && c.lng);
}

// ── EUROPE: Netherlands, Germany, France ──
async function fetchEuropeCameras(): Promise<any[]> {
  const cams: any[] = [];

  // Netherlands Rijkswaterstaat
  try {
    const res = await stealthFetch('https://opendata.ndw.nu/cameras.json', { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = await res.json();
      for (const cam of (data || []).slice(0, 1000)) {
        if (!cam.lat || !cam.lng) continue;
        cams.push({
          id: `nl-${cams.length}`, lat: cam.lat, lng: cam.lng,
          name: cam.name || 'NL Camera', city: 'Netherlands', country: 'NL',
          feed_url: cam.imageUrl || '', source: 'RWS',
        });
      }
    }
  } catch (e) { /* silent */ }

  cams.push(...await fetchAsfinagCameras());

  return cams.filter((c: any) => c.lat && c.lng);
}

// ── ASIA/PACIFIC ──
async function fetchAsiaCameras(): Promise<any[]> {
  const cams: any[] = [];

  // Singapore Live Traffic Images
  try {
    const res = await stealthFetch('https://api.data.gov.sg/v1/transport/traffic-images', { signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      const data = await res.json();
      const items = data.items?.[0]?.cameras || [];
      for (const cam of items) {
        if (!cam.location?.latitude || !cam.location?.longitude || !cam.image) continue;
        cams.push({
          id: `sin-${cam.camera_id}`,
          lat: cam.location.latitude,
          lng: cam.location.longitude,
          name: `Camera ${cam.camera_id}`,
          city: 'Singapore',
          country: 'Singapore',
          feed_url: cam.image,
          source: 'LTA Singapore'
        });
      }
    }
  } catch (e) { /* silent */ }

  return cams;
}


// ── MIDDLE EAST: Israel, Lebanon ──
async function fetchMiddleEastCameras(): Promise<any[]> {
  const cams: any[] = [];
  
  // Israel Curated (Embedded)
  cams.push(
    {
      id: 'il-israel-multicam', lat: 32.0853, lng: 34.7818,
      name: 'Israel Multi-Cam (Live)', city: 'Tel Aviv', country: 'Israel',
      stream_url: 'https://www.youtube.com/embed/gmtlJ_m2r5A?autoplay=1&mute=1',
      stream_type: 'iframe',
      source: 'YouTube Live',
    },
    {
      id: 'il-jerusalem-live', lat: 31.7767, lng: 35.2345,
      name: 'Jerusalem Western Wall', city: 'Jerusalem', country: 'Israel',
      stream_url: 'https://www.youtube.com/embed/77akujLn4k8?autoplay=1&mute=1',
      stream_type: 'iframe',
      source: 'YouTube Live',
    }
  );

  // Lebanon Curated (Embedded)
  cams.push(
    {
      id: 'lb-beirut-skyline', lat: 33.8938, lng: 35.5018,
      name: 'Beirut Skyline Live', city: 'Beirut', country: 'Lebanon',
      stream_url: 'https://www.youtube.com/embed/qJf4NqPKLjI?autoplay=1&mute=1',
      stream_type: 'iframe',
      source: 'YouTube Live',
    },
    {
      id: 'lb-me-multicam', lat: 33.2721, lng: 35.2033,
      name: 'Middle East Multi-Cam (Live)', city: 'Regional', country: 'Middle East',
      stream_url: 'https://www.youtube.com/embed/oxT5R6I0N6E?autoplay=1&mute=1',
      stream_type: 'iframe',
      source: 'YouTube Live',
    }
  );

  return cams;
}

// ═══ REGION MAPPING ═══
const REGION_FETCHERS: Record<string, () => Promise<any[]>> = {
  'middle-east': fetchMiddleEastCameras,
  'uk': fetchTfLCameras,
  'us-west': async () => { const [w, c] = await Promise.all([fetchWSDOTCameras(), fetchCaltransCameras()]); return [...w, ...c]; },
  'us-east': fetchUSEastCameras,
  'us-central': fetchUSCentralCameras,
  'canada': fetchCanadaCameras,
  'europe': fetchEuropeCameras,
  'asia': fetchAsiaCameras,
  'bulgaria': fetchBulgariaCameras,
  'greece': fetchGreeceCameras,
  'serbia': fetchSerbiaCameras,
  'macedonia': fetchMacedoniaCameras,
  'turkey': fetchTurkeyCameras,
  'romania': fetchRomaniaCameras,
  'australia': fetchAustraliaCameras,
  'italy': fetchItalyCameras,
  'czechia': fetchCzechiaCameras,
  'slovakia': fetchSlovakiaCameras,
  'germany': fetchGermanyCameras,
  'france': fetchFranceCameras,
  'spain': fetchSpainCameras,
  'poland': fetchPolandCameras,
  'japan': fetchJapanCameras,
  'switzerland': fetchSwitzerlandCameras,
  'finland': fetchFinlandCameras,
  'hongkong': fetchHongKongCameras,
  'utah': fetchUtahCameras,
  'iceland': fetchIcelandCameras,
  'taiwan': fetchTaiwanCameras,
  'thailand': fetchThailandCameras,
  'asia-live': fetchAsiaLiveCameras,
  'newzealand': fetchNewZealandCameras,
  'oregon': fetchOregonCameras,
  'michigan': fetchMichiganCameras,
  'indiana': fetchIndianaCameras,
  'nevada': fetchNevadaCameras,
  'latam-live': fetchLatamLiveCameras,
  'africa-live': fetchAfricaLiveCameras,
  'europe-live': fetchEuropeLiveCameras,
};

// Determine which regions to fetch based on viewport bounds
function getRegionsForBounds(lat: number, lng: number, radius: number): string[] {
  const regions: string[] = [];
  // UK
  if (lat > 49 && lat < 61 && lng > -8 && lng < 2) regions.push('uk');
  // US-East
  if (lat > 24 && lat < 49 && lng > -85 && lng < -66) regions.push('us-east');
  // US-West
  if (lat > 24 && lat < 49 && lng > -125 && lng < -100) regions.push('us-west');
  // Utah (UDOT) — explicit, since us-west only covers WA + CA
  if (lat > 36.9 && lat < 42.1 && lng > -114.2 && lng < -108.9) regions.push('utah');
  // Oregon (ODOT) — explicit, since us-west only covers WA + CA
  if (lat > 41.9 && lat < 46.3 && lng > -124.6 && lng < -116.4) regions.push('oregon');
  // Nevada (NDOT) — explicit, since us-west only covers WA + CA
  if (lat > 34.9 && lat < 42.1 && lng > -120.1 && lng < -113.9) regions.push('nevada');
  // US-Central
  if (lat > 24 && lat < 49 && lng > -105 && lng < -80) regions.push('us-central');
  // Michigan (MDOT) — explicit, since us-central only covers Illinois
  if (lat > 41.6 && lat < 48.3 && lng > -90.5 && lng < -82.1) regions.push('michigan');
  // Indiana (INDOT TrafficWise) — explicit, since us-central only covers Illinois
  if (lat > 37.7 && lat < 41.9 && lng > -88.2 && lng < -84.6) regions.push('indiana');
  // Canada
  if (lat > 42 && lat < 70 && lng > -141 && lng < -52) regions.push('canada');
  // Europe
  const inBulgaria = lat > 41 && lat < 44.5 && lng > 22 && lng < 29.5;
  const inGreece = lat > 34.5 && lat < 41.8 && lng > 19 && lng < 30;
  const inSerbia = lat > 42 && lat < 46.5 && lng > 18.8 && lng < 23.3;
  const inMacedonia = lat > 40.8 && lat < 42.8 && lng > 20.4 && lng < 23.2;
  const inRomania = lat > 43.5 && lat < 48.5 && lng > 20 && lng < 29.8;
  const inTurkey = lat > 35.5 && lat < 42.5 && lng > 25.5 && lng < 45;
  const inItaly = lat > 36 && lat < 47.5 && lng > 6.5 && lng < 18.5;
  const inCzechia = lat > 48.5 && lat < 51.1 && lng > 12 && lng < 18.9;
  const inSlovakia = lat > 47.7 && lat < 49.6 && lng > 16.8 && lng < 22.6;
  const inGermany = lat > 47 && lat < 55.1 && lng > 5.8 && lng < 15.1;
  const inFrance = lat > 42.3 && lat < 51.1 && lng > -5 && lng < 8.3;
  const inSpain = lat > 27 && lat < 43.8 && lng > -18.2 && lng < 4.4;
  const inPoland = lat > 49.0 && lat < 55.0 && lng > 14.1 && lng < 24.1;
  const inFinland = lat > 59.5 && lat < 70.1 && lng > 20 && lng < 31.6;
  const inIceland = lat > 63.0 && lat < 67.0 && lng > -25.0 && lng < -13.0;
  const inBalkans = inBulgaria || inGreece || inSerbia || inMacedonia || inRomania || inTurkey;
  const inWesternEurope = inItaly || inCzechia || inSlovakia || inGermany || inFrance || inSpain || inPoland || inFinland || inIceland;

  if (lat > 35 && lat < 72 && lng > -11 && lng < 40 && !inBalkans && !inWesternEurope) {
    regions.push('europe');
  }
  if (inBulgaria) regions.push('bulgaria');
  if (inGreece) regions.push('greece');
  if (inSerbia) regions.push('serbia');
  if (inMacedonia) regions.push('macedonia');
  if (inRomania) regions.push('romania');
  if (inTurkey) regions.push('turkey');
  if (inItaly) regions.push('italy');
  if (inCzechia) regions.push('czechia');
  if (inSlovakia) regions.push('slovakia');
  if (inGermany) regions.push('germany');
  if (inFrance) regions.push('france');
  if (inSpain) regions.push('spain');
  if (inPoland) regions.push('poland');
  if (inFinland) regions.push('finland');
  if (inIceland) regions.push('iceland');

  // Middle East
  const inMiddleEast = lat > 29 && lat < 34.5 && lng > 34 && lng < 36.5;
  if (inMiddleEast) regions.push('middle-east');

  // Japan
  if (lat > 24 && lat < 46 && lng > 122 && lng < 154) regions.push('japan');

  // Hong Kong
  if (lat > 22.1 && lat < 22.6 && lng > 113.8 && lng < 114.4) regions.push('hongkong');

  // Taiwan
  if (lat > 21.9 && lat < 25.3 && lng > 119.5 && lng < 122.1) regions.push('taiwan');

  // Thailand — mainland through the Gulf islands
  if (lat > 5.5 && lat < 20.5 && lng > 97.3 && lng < 105.7) regions.push('thailand');

  // Asia live webcams — spans West Asia (Turkey / Levant / Gulf) through Japan and Indonesia
  if (lat > -11 && lat < 46 && lng > 25 && lng < 155) regions.push('asia-live');

  // Asia (includes Middle East, SE Asia, overriding parts of china but that's ok they can both load)
  if ((lat > -10 && lat < 60 && lng > 60 && lng < 150)) regions.push('asia');
  // Australia explicitly
  if (lat > -45 && lat < -10 && lng > 110 && lng < 155) regions.push('asia');
  // New Zealand (NZTA)
  if (lat > -47.5 && lat < -34 && lng > 166 && lng < 179) regions.push('newzealand');

  // Live webcams for regions with no traffic-authority feed of their own
  // Latin America + Caribbean (incl. Bermuda at 32.3N)
  if (lat > -56 && lat < 33 && lng > -119 && lng < -34) regions.push('latam-live');
  // Africa (Cape Verde in the west through Seychelles in the east)
  if (lat > -35 && lat < 36 && lng > -26 && lng < 57) regions.push('africa-live');
  // European gaps (Azores in the west through northern Norway)
  if (lat > 35 && lat < 72 && lng > -32 && lng < 32) regions.push('europe-live');

  return regions.length > 0 ? regions : ['uk', 'us-east']; // Default fallback
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const region = searchParams.get('region');
    const lat = parseFloat(searchParams.get('lat') || '0');
    const lng = parseFloat(searchParams.get('lng') || '0');
    const radius = parseFloat(searchParams.get('radius') || '10');

    let regionsToFetch: string[];

    if (region === 'all') {
      regionsToFetch = Object.keys(REGION_FETCHERS);
    } else if (region) {
      regionsToFetch = region.split(',').filter(r => r in REGION_FETCHERS);
    } else if (lat !== 0 || lng !== 0) {
      regionsToFetch = getRegionsForBounds(lat, lng, radius);
    } else {
      // Default: load all regions for global coverage
      regionsToFetch = Object.keys(REGION_FETCHERS);
    }

    const results = await Promise.allSettled(
      regionsToFetch.map(r => REGION_FETCHERS[r]())
    );

    const allCameras: any[] = [];
    const sources: Record<string, number> = {};

    for (const result of results) {
      if (result.status === 'fulfilled') {
        for (const cam of result.value) {
          allCameras.push(cam);
          sources[cam.source] = (sources[cam.source] || 0) + 1;
        }
      }
    }

    const cacheControl = allCameras.length < 50 
      ? 'no-store, max-age=0' 
      : 'public, s-maxage=300, stale-while-revalidate=600';

    return NextResponse.json({
      cameras: allCameras,
      total: allCameras.length,
      sources,
      regions: regionsToFetch,
      timestamp: new Date().toISOString(),
    }, {
      headers: { 'Cache-Control': cacheControl },
    });
  } catch (error) {
    console.error('CCTV fetch error:', error);
    return NextResponse.json({ cameras: [], error: 'Failed' }, { status: 500 });
  }
}
