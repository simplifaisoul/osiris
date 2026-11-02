/**
 * OSIRIS — Military & VIP Aircraft Classifier
 *
 * Dedicated classification logic and squawk decoders for unfiltered ADS-B feeds.
 */

export interface MilitaryFlight {
  callsign: string;
  lat: number;
  lng: number;
  alt: number;
  heading: number;
  speed_knots: number | null;
  model: string;
  icao24: string;
  registration: string;
  squawk: string;
  military_category: 'reconnaissance' | 'transport' | 'fighter' | 'tanker' | 'vip' | 'emergency' | 'patrol';
  squawk_description?: string;
  grounded: boolean;
  source: string;
  timestamp: string;
}

/** Emergency & Tactical Squawk Codes */
export const SQUAWK_CODES: Record<string, string> = {
  '7700': 'GENERAL EMERGENCY (MAYDAY)',
  '7600': 'RADIO COMMUNICATIONS FAILURE',
  '7500': 'UNLAWFUL INTERFERENCE / HIJACK',
  '7777': 'MILITARY INTERCEPTION / TACTICAL',
  '7001': 'SUDDEN EMERGENCY / RESCUE',
  '5100': 'MILITARY RECONNAISSANCE / HIGH ALTITUDE',
  '4000': 'MILITARY FAST JET / SPEED TRAFFIC',
};

/** Known Military & VIP Aircraft Models */
const RECON_MODELS = new Set(['RC135', 'E8A', 'E3CF', 'E3TF', 'EP3', 'U2', 'RQ4', 'MQ9', 'P8A', 'P3', 'RC12', 'B350', 'ALEXA']);
const TANKER_MODELS = new Set(['KC135', 'KC10', 'KC46', 'KC35', 'A332', 'C130']);
const FIGHTER_MODELS = new Set(['F16', 'F15', 'F18', 'F22', 'F35', 'A10', 'F117', 'EUFI', 'RFAL', 'TORD', 'TYP', 'GR4', 'SU30', 'SU35', 'SU57', 'MIG29', 'J20']);
const TRANSPORT_MODELS = new Set(['C17', 'C5M', 'C130', 'C30J', 'A400', 'AN124', 'AN225', 'IL76', 'C27J', 'V22', 'MV22', 'CH47', 'UH60']);
const VIP_MODELS = new Set(['VC25', 'E4B', 'C32A', 'C40B', 'GLEX', 'G550', 'G650', 'A340', 'B744', 'IL96']);

/** Callsign Regex Patterns */
const RECON_CALLSIGNS = /^(FORTE|JAKE|HOMER|PYTHON|DRAGON|SNOOP|OLIVE|COBRA|TEAL|TOPCAT|NCHO|NIGHT|SPUR)/i;
const TANKER_CALLSIGNS = /^(N2YO|SHELL|HOBO|ETHYL|KC135|BOEING|TKN|CLEAN|PETRO)/i;
const TRANSPORT_CALLSIGNS = /^(RCH|REACH|CONVOY|EVAC|C17|HERKY|ASCOT|BOXER|PAT|SAM|SPAR|EXEC)/i;
const VIP_CALLSIGNS = /^(AF1|AF2|SAM|SPAR|EXEC|NIGHTHAWK|VENUS|BAF|RRF)/i;

export function classifyMilitaryAircraft(f: any): MilitaryFlight | null {
  const lat = f.lat;
  const lon = f.lon ?? f.lng;
  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const modelUpper = (f.t || f.model || '').toUpperCase().trim();
  const flightStr = (f.flight || f.callsign || '').trim().toUpperCase();
  const squawk = String(f.squawk || '').trim();
  const hex = (f.hex || f.icao24 || '').toLowerCase().trim();
  const altRaw = f.alt_baro ?? f.alt;
  const altMeters = typeof altRaw === 'number' ? Math.round(altRaw * 0.3048) : 0;
  const speedKnots = typeof f.gs === 'number' ? Math.round(f.gs) : typeof f.speed_knots === 'number' ? f.speed_knots : null;
  const heading = Math.round(f.track ?? f.heading ?? 0);
  const isGrounded = typeof altRaw === 'number' && altRaw < 100;

  let milCat: MilitaryFlight['military_category'] = 'patrol';

  if (SQUAWK_CODES[squawk]?.includes('EMERGENCY') || SQUAWK_CODES[squawk]?.includes('HIJACK')) {
    milCat = 'emergency';
  } else if (VIP_MODELS.has(modelUpper) || VIP_CALLSIGNS.test(flightStr)) {
    milCat = 'vip';
  } else if (RECON_MODELS.has(modelUpper) || RECON_CALLSIGNS.test(flightStr)) {
    milCat = 'reconnaissance';
  } else if (TANKER_MODELS.has(modelUpper) || TANKER_CALLSIGNS.test(flightStr)) {
    milCat = 'tanker';
  } else if (FIGHTER_MODELS.has(modelUpper)) {
    milCat = 'fighter';
  } else if (TRANSPORT_MODELS.has(modelUpper) || TRANSPORT_CALLSIGNS.test(flightStr)) {
    milCat = 'transport';
  }

  return {
    callsign: flightStr || hex.toUpperCase() || 'MILITARY',
    lat: Math.round(lat * 100000) / 100000,
    lng: Math.round(lon * 100000) / 100000,
    alt: altMeters,
    heading,
    speed_knots: speedKnots,
    model: modelUpper || 'Military Asset',
    icao24: hex,
    registration: f.r || f.registration || 'N/A',
    squawk,
    military_category: milCat,
    squawk_description: SQUAWK_CODES[squawk] || undefined,
    grounded: isGrounded,
    source: f.source || 'adsb.fi/mil',
    timestamp: new Date().toISOString(),
  };
}
