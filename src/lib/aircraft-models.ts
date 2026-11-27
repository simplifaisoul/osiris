import type * as ThreeNS from 'three';
import type { BuiltModel } from './satellite-models';

/**
 * OSIRIS — what an aircraft looks like
 *
 * The transponder (and the registry behind /api/aircraft) gives an ICAO type
 * code: A20N, B788, CRJ9, AT76, H60. Each code names a design with a published
 * length and wingspan, and designs fall into a few families that share a
 * shape: a narrow-body twin, a wide-body twin, a four-engined jumbo, a regional
 * jet with its engines at the back, a high-winged turboprop, a light single, a
 * helicopter, a fighter. One generator builds them all from a family's
 * proportions, scaled to the type's real length and span, so the card can show
 * a recognisable model of the aircraft being followed. They are built for
 * OSIRIS from simple shapes: illustrations of the type, not replicas.
 *
 * Frame: +X is the nose, +Y up, +Z the right wing; metres. three.js is passed
 * in, so this file adds nothing to the page until a model is opened.
 */

type Three = typeof ThreeNS;

export type AircraftFamily =
  | 'narrowbody' | 'widebody' | 'quad' | 'regional' | 'rearjet' | 'turboprop' | 'single-prop'
  | 'light-high' | 'light-low' | 'helicopter' | 'fighter' | 'airlifter';

export interface AircraftSpec {
  family: AircraftFamily;
  /** What the model shows, for the card. */
  label: string;
  lengthM: number;
  /** Wingspan, or rotor diameter for a helicopter. */
  spanM: number;
  /** Whether the length and span are this type's own, so the card may show them. */
  trueSize: boolean;
  /** Propeller-driven airlifter (C-130, A400M) rather than a jet one. */
  props?: boolean;
  /** Twin fins (F-15, F/A-18, F-35, F-22). */
  twinFin?: boolean;
  /** A military type painted grey, though its family is not. */
  military?: boolean;
}

/** Type code → family, name, length and span in metres (published figures, rounded). */
const TYPES: Record<string, [AircraftFamily, string, number, number, Partial<AircraftSpec>?]> = {
  A318: ['narrowbody', 'Airbus A318', 31.4, 34.1], A319: ['narrowbody', 'Airbus A319', 33.8, 35.8],
  A320: ['narrowbody', 'Airbus A320', 37.6, 35.8], A321: ['narrowbody', 'Airbus A321', 44.5, 35.8],
  A19N: ['narrowbody', 'Airbus A319neo', 33.8, 35.8], A20N: ['narrowbody', 'Airbus A320neo', 37.6, 35.8],
  A21N: ['narrowbody', 'Airbus A321neo', 44.5, 35.8],
  B736: ['narrowbody', 'Boeing 737-600', 31.2, 34.3], B737: ['narrowbody', 'Boeing 737-700', 33.6, 35.8],
  B738: ['narrowbody', 'Boeing 737-800', 39.5, 35.8], B739: ['narrowbody', 'Boeing 737-900', 42.1, 35.8],
  B37M: ['narrowbody', 'Boeing 737 MAX 7', 35.6, 35.9], B38M: ['narrowbody', 'Boeing 737 MAX 8', 39.5, 35.9],
  B39M: ['narrowbody', 'Boeing 737 MAX 9', 42.2, 35.9], B3XM: ['narrowbody', 'Boeing 737 MAX 10', 43.8, 35.9],
  B752: ['narrowbody', 'Boeing 757-200', 47.3, 38.1], B753: ['narrowbody', 'Boeing 757-300', 54.4, 38.1],
  BCS1: ['narrowbody', 'Airbus A220-100', 35.0, 35.1], BCS3: ['narrowbody', 'Airbus A220-300', 38.7, 35.1],
  C919: ['narrowbody', 'COMAC C919', 38.9, 35.8],
  A306: ['widebody', 'Airbus A300-600', 54.1, 44.8], A310: ['widebody', 'Airbus A310', 46.7, 43.9],
  A332: ['widebody', 'Airbus A330-200', 58.8, 60.3], A333: ['widebody', 'Airbus A330-300', 63.7, 60.3],
  A338: ['widebody', 'Airbus A330-800', 58.8, 64.0], A339: ['widebody', 'Airbus A330-900', 63.7, 64.0],
  A359: ['widebody', 'Airbus A350-900', 66.8, 64.8], A35K: ['widebody', 'Airbus A350-1000', 73.8, 64.8],
  B762: ['widebody', 'Boeing 767-200', 48.5, 47.6], B763: ['widebody', 'Boeing 767-300', 54.9, 47.6],
  B764: ['widebody', 'Boeing 767-400', 61.4, 51.9], B772: ['widebody', 'Boeing 777-200', 63.7, 60.9],
  B77L: ['widebody', 'Boeing 777-200LR', 63.7, 64.8], B77W: ['widebody', 'Boeing 777-300ER', 73.9, 64.8],
  B778: ['widebody', 'Boeing 777-8', 70.9, 71.8], B779: ['widebody', 'Boeing 777-9', 76.7, 71.8],
  B788: ['widebody', 'Boeing 787-8', 56.7, 60.1], B789: ['widebody', 'Boeing 787-9', 62.8, 60.1],
  B78X: ['widebody', 'Boeing 787-10', 68.3, 60.1], MD11: ['widebody', 'McDonnell Douglas MD-11', 61.6, 51.7],
  A343: ['quad', 'Airbus A340-300', 63.7, 60.3], A346: ['quad', 'Airbus A340-600', 75.4, 63.5],
  A388: ['quad', 'Airbus A380', 72.7, 79.8], B744: ['quad', 'Boeing 747-400', 70.7, 64.4],
  B748: ['quad', 'Boeing 747-8', 76.3, 68.4], B742: ['quad', 'Boeing 747-200', 70.6, 59.6],
  K35R: ['quad', 'Boeing KC-135R Stratotanker', 41.5, 39.9, { military: true }], E3TF: ['quad', 'Boeing E-3 Sentry', 46.6, 44.4, { military: true }],
  E170: ['regional', 'Embraer E170', 29.9, 26.0], E75L: ['regional', 'Embraer E175', 31.7, 26.0],
  E75S: ['regional', 'Embraer E175', 31.7, 26.0], E175: ['regional', 'Embraer E175', 31.7, 26.0],
  E190: ['regional', 'Embraer E190', 36.2, 28.7], E195: ['regional', 'Embraer E195', 38.7, 28.7],
  E290: ['regional', 'Embraer E190-E2', 36.3, 33.7], E295: ['regional', 'Embraer E195-E2', 41.5, 35.1],
  E135: ['rearjet', 'Embraer ERJ-135', 26.3, 20.0], E145: ['rearjet', 'Embraer ERJ-145', 29.9, 20.0],
  E35L: ['rearjet', 'Embraer Legacy 600', 26.3, 21.2],
  CRJ2: ['rearjet', 'Bombardier CRJ200', 26.8, 21.2], CRJ7: ['rearjet', 'Bombardier CRJ700', 32.5, 23.2],
  CRJ9: ['rearjet', 'Bombardier CRJ900', 36.2, 24.9], CRJX: ['rearjet', 'Bombardier CRJ1000', 39.1, 26.2],
  CL30: ['rearjet', 'Bombardier Challenger 300', 20.9, 19.5], CL35: ['rearjet', 'Bombardier Challenger 350', 20.9, 21.0],
  CL60: ['rearjet', 'Bombardier Challenger 600', 20.9, 19.6], GLEX: ['rearjet', 'Bombardier Global Express', 30.3, 28.7],
  GL7T: ['rearjet', 'Bombardier Global 7500', 33.8, 31.7], GLF4: ['rearjet', 'Gulfstream IV', 26.9, 23.7],
  GLF5: ['rearjet', 'Gulfstream V', 29.4, 28.5], GLF6: ['rearjet', 'Gulfstream G650', 30.4, 30.4],
  C56X: ['rearjet', 'Cessna Citation Excel', 15.8, 17.2], C68A: ['rearjet', 'Cessna Citation Latitude', 18.9, 22.0],
  C700: ['rearjet', 'Cessna Citation Longitude', 22.3, 20.6], C525: ['rearjet', 'Cessna CitationJet', 13.0, 14.3],
  E55P: ['rearjet', 'Embraer Phenom 300', 15.6, 16.2], E50P: ['rearjet', 'Embraer Phenom 100', 12.8, 12.3],
  F2TH: ['rearjet', 'Dassault Falcon 2000', 20.2, 21.4], FA7X: ['rearjet', 'Dassault Falcon 7X', 23.2, 26.2],
  FA8X: ['rearjet', 'Dassault Falcon 8X', 24.5, 26.3], LJ45: ['rearjet', 'Learjet 45', 17.7, 14.6],
  PC24: ['rearjet', 'Pilatus PC-24', 16.9, 17.0],
  AT43: ['turboprop', 'ATR 42', 22.7, 24.6], AT45: ['turboprop', 'ATR 42-500', 22.7, 24.6],
  AT72: ['turboprop', 'ATR 72', 27.2, 27.1], AT75: ['turboprop', 'ATR 72-500', 27.2, 27.1],
  AT76: ['turboprop', 'ATR 72-600', 27.2, 27.1], DH8A: ['turboprop', 'De Havilland Dash 8-100', 22.3, 25.9],
  DH8C: ['turboprop', 'De Havilland Dash 8-300', 25.7, 27.4], DH8D: ['turboprop', 'De Havilland Dash 8-400', 32.8, 28.4],
  SF34: ['turboprop', 'Saab 340', 19.7, 21.4], D328: ['turboprop', 'Dornier 328', 21.3, 21.0],
  PC12: ['single-prop', 'Pilatus PC-12', 14.4, 16.3], C208: ['single-prop', 'Cessna 208 Caravan', 11.5, 15.9],
  TBM9: ['single-prop', 'Daher TBM 900', 10.7, 12.8], TBM7: ['single-prop', 'Daher TBM 700', 10.6, 12.7],
  C150: ['light-high', 'Cessna 150', 7.3, 10.2], C152: ['light-high', 'Cessna 152', 7.3, 10.2],
  C172: ['light-high', 'Cessna 172 Skyhawk', 8.3, 11.0], C182: ['light-high', 'Cessna 182 Skylane', 8.8, 11.0],
  C206: ['light-high', 'Cessna 206', 8.6, 11.0],
  P28A: ['light-low', 'Piper PA-28', 7.3, 10.7], P28B: ['light-low', 'Piper PA-28', 7.3, 10.7],
  PA32: ['light-low', 'Piper PA-32', 8.4, 11.0], SR20: ['light-low', 'Cirrus SR20', 7.9, 11.7],
  SR22: ['light-low', 'Cirrus SR22', 7.9, 11.7], DA40: ['light-low', 'Diamond DA40', 8.1, 11.9],
  BE36: ['light-low', 'Beechcraft Bonanza', 8.4, 10.2], M20P: ['light-low', 'Mooney M20', 7.5, 11.0],
  H60: ['helicopter', 'Sikorsky UH-60 Black Hawk', 19.8, 16.4, { military: true }], S76: ['helicopter', 'Sikorsky S-76', 16.0, 13.4],
  S92: ['helicopter', 'Sikorsky S-92', 20.9, 17.2], EC35: ['helicopter', 'Airbus H135', 12.2, 10.2],
  EC45: ['helicopter', 'Airbus H145', 13.6, 11.0], EC30: ['helicopter', 'Airbus H130', 12.6, 10.7],
  AS50: ['helicopter', 'Airbus H125', 12.9, 10.7], AS65: ['helicopter', 'Airbus AS365 Dauphin', 13.7, 11.9],
  A139: ['helicopter', 'Leonardo AW139', 16.7, 13.8], A169: ['helicopter', 'Leonardo AW169', 14.7, 12.1],
  B06: ['helicopter', 'Bell 206', 11.9, 10.2], B407: ['helicopter', 'Bell 407', 12.7, 10.7],
  B429: ['helicopter', 'Bell 429', 13.1, 11.0], R44: ['helicopter', 'Robinson R44', 11.7, 10.1],
  R22: ['helicopter', 'Robinson R22', 8.8, 7.7], H64: ['helicopter', 'Boeing AH-64 Apache', 17.7, 14.6, { military: true }],
  CH47: ['helicopter', 'Boeing CH-47 Chinook', 30.1, 18.3, { military: true }],
  F15: ['fighter', 'McDonnell Douglas F-15', 19.4, 13.0, { twinFin: true }],
  F16: ['fighter', 'General Dynamics F-16', 15.1, 9.4], F18H: ['fighter', 'Boeing F/A-18 Super Hornet', 18.3, 13.6, { twinFin: true }],
  F18S: ['fighter', 'Boeing F/A-18 Super Hornet', 18.3, 13.6, { twinFin: true }], F35: ['fighter', 'Lockheed Martin F-35', 15.7, 10.7, { twinFin: true }],
  F22: ['fighter', 'Lockheed Martin F-22', 18.9, 13.6, { twinFin: true }], EUFI: ['fighter', 'Eurofighter Typhoon', 16.0, 11.0],
  RFAL: ['fighter', 'Dassault Rafale', 15.3, 10.9], GRIF: ['fighter', 'Saab Gripen', 14.1, 8.4],
  T38: ['fighter', 'Northrop T-38 Talon', 14.1, 7.7], HAWK: ['fighter', 'BAE Hawk', 12.4, 9.9],
  C17: ['airlifter', 'Boeing C-17 Globemaster III', 53.0, 51.8], C5M: ['airlifter', 'Lockheed C-5 Galaxy', 75.3, 67.9],
  C130: ['airlifter', 'Lockheed C-130 Hercules', 29.8, 40.4, { props: true }],
  C30J: ['airlifter', 'Lockheed C-130J Hercules', 29.8, 40.4, { props: true }],
  A400: ['airlifter', 'Airbus A400M Atlas', 45.1, 42.4, { props: true }], IL76: ['airlifter', 'Ilyushin Il-76', 46.6, 50.5],
};

/** A family's look when the type is not in the table: name and typical size. */
const FAMILY_DEFAULTS: Record<AircraftFamily, [string, number, number]> = {
  narrowbody: ['Narrow-body airliner', 38, 35], widebody: ['Wide-body airliner', 63, 61],
  quad: ['Four-engined airliner', 70, 64], regional: ['Regional jet', 33, 27], rearjet: ['Business jet', 20, 20],
  turboprop: ['Turboprop airliner', 27, 27], 'single-prop': ['Single-engined turboprop', 12, 15],
  'light-high': ['Light aircraft', 8.3, 11], 'light-low': ['Light aircraft', 7.8, 11], helicopter: ['Helicopter', 13, 11],
  fighter: ['Fighter jet', 16, 11], airlifter: ['Military transport', 45, 45],
};

/** Families by type-code pattern, for codes the table does not list. */
const PREFIXES: [RegExp, AircraftFamily][] = [
  [/^A3[45]\d|^A38/, 'quad'], [/^A3[0-3]|^A35|^B7[6-8]|^B77|^MD1/, 'widebody'], [/^B74/, 'quad'],
  [/^A3|^B7[0-5]|^B3\dM|^BCS|^MD[89]|^B71/, 'narrowbody'],
  // The ERJ-135/140/145 carry their engines at the back; the E-Jets under the wing.
  [/^E1[34]\d/, 'rearjet'], [/^E1[5-9]\d|^E1\d[A-Z]|^E[2-9]\d\d$|^E7/, 'regional'], [/^CRJ|^C5\d|^C6\d|^C7\d|^CL\d|^GL|^F[29]|^FA\d|^LJ|^E5\dP|^PRM|^HDJT|^C25/, 'rearjet'],
  [/^AT\d|^DH8|^SF34|^JS|^D32|^E12|^SW/, 'turboprop'], [/^PC12|^C20[58]|^TBM|^KODI|^PC6|^M600/, 'single-prop'],
  [/^C1\d\d$|^C2[01]\d$/, 'light-high'], [/^P[A2]\d|^SR\d|^DA\d|^BE\d|^M20/, 'light-low'],
  [/^H\d|^EC\d|^AS\d|^A1\d\d|^B[0-4]\d\d?$|^R[24]\d$|^S\d\d$|^MI\d|^UH|^CH\d|^NH9/, 'helicopter'],
  [/^F\d|^EUFI|^TYPH|^RFAL|^GRIF|^T\d\d$|^SU\d|^MIG|^J\d\d/, 'fighter'], [/^C1[37]|^C5|^A40|^IL7|^AN\d/, 'airlifter'],
];

/** Which model draws an aircraft, from its ICAO type code and, failing that, the feed's category. */
export function aircraftModelSpec(typeCode: string | null | undefined, opts: { helicopter?: boolean } = {}): AircraftSpec {
  const code = (typeCode ?? '').trim().toUpperCase();
  const known = TYPES[code];
  if (known) {
    const [family, label, lengthM, spanM, extra] = known;
    return { family, label, lengthM, spanM, trueSize: true, ...extra };
  }
  const family = opts.helicopter ? 'helicopter' : PREFIXES.find(([re]) => re.test(code))?.[1] ?? 'narrowbody';
  const [label, lengthM, spanM] = FAMILY_DEFAULTS[family];
  return { family, label, lengthM, spanM, trueSize: false, props: family === 'airlifter' && /^C1[3]|^A40/.test(code) };
}

/**
 * The fuselage skin: white, a row of cabin windows down each side and the
 * cockpit glazing at the nose. u runs around the fuselage (0 the right side,
 * 0.25 the belly, 0.5 the left side, 0.75 the crown) and v along it, tail 0
 * to nose 1; the canvas is drawn upside down because textures flip on upload.
 */
function fuselageTexture(THREE: Three, windows: boolean): ThreeNS.Texture {
  const W = 512, H = 1024;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e4e7eb';
  g.fillRect(0, 0, W, H);
  const at = (u: number, v: number) => [u * W, (1 - v) * H] as const;
  g.fillStyle = '#1c2430';
  if (windows) {
    for (const u of [0.56, 0.94]) {
      for (let v = 0.24; v < 0.86; v += 0.0115) { const [x, y] = at(u, v); g.fillRect(x - 3, y - 4, 6, 7); }
    }
  }
  // Cockpit panes across the top of the nose.
  for (const [u0, u1] of [[0.55, 0.63], [0.66, 0.84], [0.87, 0.95]]) {
    const [x0, y0] = at(u0, 0.945);
    const [x1, y1] = at(u1, 0.92);
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

interface Family {
  /** Fuselage radius, nose and tail-cone lengths, all as fractions of length. */
  r: number; nose: number; tail: number;
  /** Wing root leading edge, from the nose, as a fraction of length; height on the fuselage, −1 bottom to 1 top. */
  wingAt: number; wingY: number;
  rootChord: number; tipChord: number; sweep: number; dihedral: number;
  engines: 'wing' | 'rear' | 'prop-wing' | 'nose' | 'none';
  /** Engine positions as fractions of the half span. */
  engineAt: number[];
  nacelleR: number; nacelleL: number;
  tTail: boolean; finH: number; finChord: number; stabSpan: number;
  windows: boolean;
  colour?: number;
}

const FAMILIES: Record<Exclude<AircraftFamily, 'helicopter' | 'fighter'>, Family> = {
  narrowbody: { r: 0.052, nose: 0.1, tail: 0.24, wingAt: 0.36, wingY: -0.55, rootChord: 0.17, tipChord: 0.05, sweep: 27, dihedral: 5, engines: 'wing', engineAt: [0.34], nacelleR: 0.028, nacelleL: 0.11, tTail: false, finH: 0.16, finChord: 0.14, stabSpan: 0.36, windows: true },
  widebody: { r: 0.046, nose: 0.09, tail: 0.24, wingAt: 0.36, wingY: -0.55, rootChord: 0.2, tipChord: 0.045, sweep: 31, dihedral: 6, engines: 'wing', engineAt: [0.32], nacelleR: 0.03, nacelleL: 0.1, tTail: false, finH: 0.16, finChord: 0.13, stabSpan: 0.34, windows: true },
  quad: { r: 0.048, nose: 0.1, tail: 0.24, wingAt: 0.36, wingY: -0.55, rootChord: 0.21, tipChord: 0.05, sweep: 34, dihedral: 6, engines: 'wing', engineAt: [0.34, 0.6], nacelleR: 0.024, nacelleL: 0.085, tTail: false, finH: 0.17, finChord: 0.13, stabSpan: 0.33, windows: true },
  regional: { r: 0.049, nose: 0.1, tail: 0.25, wingAt: 0.37, wingY: -0.55, rootChord: 0.17, tipChord: 0.055, sweep: 25, dihedral: 5, engines: 'wing', engineAt: [0.32], nacelleR: 0.033, nacelleL: 0.12, tTail: false, finH: 0.17, finChord: 0.15, stabSpan: 0.36, windows: true },
  rearjet: { r: 0.058, nose: 0.13, tail: 0.27, wingAt: 0.42, wingY: -0.6, rootChord: 0.18, tipChord: 0.06, sweep: 26, dihedral: 3, engines: 'rear', engineAt: [], nacelleR: 0.034, nacelleL: 0.16, tTail: true, finH: 0.17, finChord: 0.16, stabSpan: 0.36, windows: true },
  turboprop: { r: 0.052, nose: 0.1, tail: 0.27, wingAt: 0.38, wingY: 0.85, rootChord: 0.095, tipChord: 0.055, sweep: 3, dihedral: 1, engines: 'prop-wing', engineAt: [0.3], nacelleR: 0.03, nacelleL: 0.17, tTail: true, finH: 0.2, finChord: 0.16, stabSpan: 0.3, windows: true },
  'single-prop': { r: 0.07, nose: 0.14, tail: 0.32, wingAt: 0.36, wingY: -0.6, rootChord: 0.15, tipChord: 0.08, sweep: 2, dihedral: 5, engines: 'nose', engineAt: [], nacelleR: 0, nacelleL: 0, tTail: true, finH: 0.2, finChord: 0.17, stabSpan: 0.42, windows: true },
  'light-high': { r: 0.075, nose: 0.12, tail: 0.38, wingAt: 0.3, wingY: 0.95, rootChord: 0.18, tipChord: 0.15, sweep: 0, dihedral: 1.5, engines: 'nose', engineAt: [], nacelleR: 0, nacelleL: 0, tTail: false, finH: 0.2, finChord: 0.2, stabSpan: 0.42, windows: false },
  'light-low': { r: 0.075, nose: 0.12, tail: 0.38, wingAt: 0.3, wingY: -0.7, rootChord: 0.19, tipChord: 0.12, sweep: 2, dihedral: 6, engines: 'nose', engineAt: [], nacelleR: 0, nacelleL: 0, tTail: false, finH: 0.19, finChord: 0.2, stabSpan: 0.42, windows: false },
  airlifter: { r: 0.068, nose: 0.1, tail: 0.27, wingAt: 0.33, wingY: 0.95, rootChord: 0.16, tipChord: 0.06, sweep: 25, dihedral: -3, engines: 'wing', engineAt: [0.3, 0.55], nacelleR: 0.026, nacelleL: 0.1, tTail: true, finH: 0.22, finChord: 0.16, stabSpan: 0.36, windows: false, colour: 0x8c949d },
};

/** Builds the model for one aircraft spec, centred on its bounding box. */
export function buildAircraftModel(THREE: Three, spec: AircraftSpec): BuiltModel & { tick: (dt: number) => void } {
  const disposables: { dispose: () => void }[] = [];
  const keep = <T extends { dispose: () => void }>(x: T) => { disposables.push(x); return x; };
  const military = spec.military === true || spec.family === 'fighter' || spec.family === 'airlifter';
  const paint = keep(new THREE.MeshStandardMaterial({ color: military ? 0x7f8790 : 0xe4e7eb, metalness: 0.1, roughness: 0.55 }));
  const wingMat = keep(new THREE.MeshStandardMaterial({ color: military ? 0x7d858e : 0xc3c8cf, metalness: 0.35, roughness: 0.45, side: THREE.DoubleSide }));
  const metal = keep(new THREE.MeshStandardMaterial({ color: 0xd8dce1, metalness: 0.8, roughness: 0.3 }));
  const dark = keep(new THREE.MeshStandardMaterial({ color: 0x1a1d22, metalness: 0.3, roughness: 0.6 }));
  const glass = keep(new THREE.MeshStandardMaterial({ color: 0x1b2a3c, metalness: 0.9, roughness: 0.1 }));
  const tailMat = keep(new THREE.MeshStandardMaterial({ color: military ? 0x7d858e : 0x1f3554, metalness: 0.3, roughness: 0.45, side: THREE.DoubleSide }));

  const root = new THREE.Group();
  const spinners: { obj: ThreeNS.Object3D; axis: 'x' | 'y'; rate: number }[] = [];
  const add = <T extends ThreeNS.Object3D>(o: T, x = 0, y = 0, z = 0) => { o.position.set(x, y, z); root.add(o); return o; };
  const mesh = (geo: ThreeNS.BufferGeometry, mat: ThreeNS.Material) => new THREE.Mesh(keep(geo), mat);

  const L = spec.lengthM, S = spec.spanM;

  /** A body of revolution along X, nose at +L/2: radius profile from a list of [x fraction tail→nose, radius]. */
  const body = (profile: [number, number][], mat: ThreeNS.Material, upsweep = 0, yScale = 1) => {
    const pts = profile.map(([f, r]) => new THREE.Vector2(Math.max(r, 0.001), (f - 0.5) * L));
    const geo = new THREE.LatheGeometry(pts, 32);
    geo.rotateZ(-Math.PI / 2);
    // Lift the tail cone, as on a real fuselage, and make room for a taller upper deck.
    const p = geo.getAttribute('position') as ThreeNS.BufferAttribute;
    const uv = geo.getAttribute('uv') as ThreeNS.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const f = p.getX(i) / L + 0.5;
      p.setY(i, p.getY(i) * yScale + (f < 0.28 ? upsweep * ((0.28 - f) / 0.28) : 0));
      // Along the body by length, not by profile point, so the skin is not bunched up.
      uv.setY(i, f);
    }
    geo.computeVertexNormals();
    return mesh(geo, mat);
  };

  /** A tapered, swept surface: root at z = 0 out to z = ±half; leading edge at x = 0 at the root. */
  const surface = (half: number, rootChord: number, tipChord: number, sweepDeg: number, thick: number, side: 1 | -1, mat: ThreeNS.Material) => {
    const tipLe = -Math.tan((sweepDeg * Math.PI) / 180) * half;
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(tipLe, side * half);
    shape.lineTo(tipLe - tipChord, side * half);
    shape.lineTo(-rootChord, 0);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
    geo.translate(0, 0, -thick / 2);
    // Shape y (spanwise) becomes z; the extrusion becomes the thickness.
    geo.rotateX(Math.PI / 2);
    return mesh(geo, mat);
  };

  /** A vertical fin: root chord along X at y = 0, up to height h. */
  const fin = (h: number, rootChord: number, tipChord: number, sweepDeg: number, thick: number, mat: ThreeNS.Material) => {
    const tipLe = -Math.tan((sweepDeg * Math.PI) / 180) * h;
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(tipLe, h);
    shape.lineTo(tipLe - tipChord, h);
    shape.lineTo(-rootChord, 0);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
    geo.translate(0, 0, -thick / 2);
    return mesh(geo, mat);
  };

  const cyl = (rFront: number, rBack: number, len: number, mat: ThreeNS.Material) => {
    const geo = new THREE.CylinderGeometry(rFront, rBack, len, 24);
    geo.rotateZ(-Math.PI / 2);
    return mesh(geo, mat);
  };

  /** A propeller of `blades` blades, radius r, turning about X. */
  const propeller = (r: number, blades: number) => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.SphereGeometry(r * 0.18, 16, 12), metal));
    for (let i = 0; i < blades; i++) {
      const b = mesh(new THREE.BoxGeometry(r * 0.04, r, r * 0.13), dark);
      b.position.y = r / 2;
      const arm = new THREE.Group();
      arm.rotation.x = (i / blades) * Math.PI * 2;
      arm.add(b);
      g.add(arm);
    }
    spinners.push({ obj: g, axis: 'x', rate: 18 });
    return g;
  };

  if (spec.family === 'helicopter') {
    const r = L * 0.11;
    // Cabin pod, tail boom, fin, rotors and skids.
    add(body([[0, r * 0.35], [0.2, r * 0.9], [0.55, r], [0.85, r * 0.85], [1, 0.01]], paint, 0, 1.05), L * 0.2);
    add(cyl(r * 0.22, r * 0.12, L * 0.55, paint), -L * 0.22, r * 0.25);
    add(fin(r * 1.1, r * 0.9, r * 0.5, 30, r * 0.08, tailMat), -L * 0.45, r * 0.25);
    add(mesh(new THREE.SphereGeometry(r * 0.75, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2.4), glass), L * 0.33, r * 0.05).rotation.z = -1.0;
    add(cyl(r * 0.12, r * 0.12, r * 0.6, metal), L * 0.12, r * 1.15).rotation.z = Math.PI / 2;
    const rotor = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group();
      arm.rotation.y = (i / 4) * Math.PI * 2;
      const blade = mesh(new THREE.BoxGeometry(S / 2, r * 0.03, r * 0.22), dark);
      blade.position.x = S / 4;
      arm.add(blade);
      rotor.add(arm);
    }
    add(rotor, L * 0.12, r * 1.45);
    spinners.push({ obj: rotor, axis: 'y', rate: 12 });
    const tailRotor = new THREE.Group();
    tailRotor.add(propeller(r * 0.6, 2));
    tailRotor.rotation.y = Math.PI / 2;
    add(tailRotor, -L * 0.47, r * 0.7, r * 0.15);
    for (const z of [1, -1]) {
      add(cyl(r * 0.05, r * 0.05, L * 0.5, metal), L * 0.15, -r * 1.05, z * r * 0.75);
    }
  } else if (spec.family === 'fighter') {
    const r = L * 0.045;
    add(body([[0, r * 0.75], [0.12, r * 1.05], [0.5, r * 1.1], [0.78, r * 0.75], [1, 0.01]], paint, 0, 0.85));
    add(mesh(new THREE.SphereGeometry(r * 0.75, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass), L * 0.27, r * 0.55).scale.set(2.4, 0.9, 0.9);
    // Cropped delta wing and tail planes.
    for (const side of [1, -1] as const) {
      add(surface(S / 2, L * 0.4, L * 0.06, 42, r * 0.18, side, wingMat), L * 0.12, -r * 0.1);
      add(surface(S * 0.22, L * 0.14, L * 0.05, 40, r * 0.12, side, wingMat), -L * 0.32, 0);
    }
    if (spec.twinFin) {
      for (const z of [1, -1]) add(fin(L * 0.13, L * 0.13, L * 0.05, 40, r * 0.1, tailMat), -L * 0.3, r * 0.4, z * r * 0.9).rotation.x = z * 0.35;
    } else {
      add(fin(L * 0.15, L * 0.15, L * 0.05, 42, r * 0.1, tailMat), -L * 0.3, r * 0.4);
    }
    add(cyl(r * 0.7, r * 0.55, L * 0.05, dark), -L * 0.52, 0);
  } else {
    const fam = { ...FAMILIES[spec.family] };
    if (fam.colour) paint.color.setHex(fam.colour);
    const r = L * fam.r;
    const tex = keep(fuselageTexture(THREE, fam.windows && !military));
    const skin = keep(new THREE.MeshStandardMaterial({ map: tex, metalness: 0.1, roughness: 0.55, color: military ? 0x8c949d : 0xffffff }));
    // Tail cone, constant barrel, rounded nose.
    const n = fam.nose, t = fam.tail;
    const profile: [number, number][] = [[0, r * 0.12], [t * 0.45, r * 0.55], [t, r * 0.97], [t + 0.02, r]];
    for (let i = 0; i <= 8; i++) {
      const f = i / 8;
      profile.push([1 - n + n * f, r * Math.sqrt(Math.max(0, 1 - f * f)) * (1 - 0.1 * f)]);
    }
    const yScale = spec.family === 'quad' && spec.lengthM > 70 && spec.spanM > 75 ? 1.22 : 1;
    add(body(profile, skin, r * 0.5, yScale));

    // Wings, from the fuselage side outward.
    const half = S / 2;
    const wingX = L / 2 - fam.wingAt * L;
    const wingY = fam.wingY * r * yScale;
    const wingThick = Math.max(0.12, fam.rootChord * L * 0.1);
    const wings: ThreeNS.Mesh[] = [];
    for (const side of [1, -1] as const) {
      const w = add(surface(half, fam.rootChord * L, fam.tipChord * L, fam.sweep, wingThick, side, wingMat), wingX, wingY);
      w.rotation.x = -side * (fam.dihedral * Math.PI) / 180;
      wings.push(w);
    }
    // A wing's leading edge at a fraction of the half span, and its height there.
    const wingPoint = (f: number) => ({
      x: wingX - Math.tan((fam.sweep * Math.PI) / 180) * half * f,
      y: wingY + Math.tan((fam.dihedral * Math.PI) / 180) * half * f,
      chord: (fam.rootChord + (fam.tipChord - fam.rootChord) * f) * L,
    });

    // Tail: fin, and the tailplane low on the fuselage or on top of the fin.
    const finRoot = fam.finChord * L;
    const finX = -L / 2 + finRoot * 1.05;
    const finY = r * 0.45;
    add(fin(fam.finH * L, finRoot, finRoot * 0.45, 38, Math.max(0.1, r * 0.08), tailMat), finX, finY);
    const stabHalf = (fam.stabSpan * S) / 2;
    const stabY = fam.tTail ? finY + fam.finH * L : r * 0.35;
    const stabX = fam.tTail ? finX - Math.tan((38 * Math.PI) / 180) * fam.finH * L - finRoot * 0.05 : finX + finRoot * 0.15;
    for (const side of [1, -1] as const) {
      add(surface(stabHalf, finRoot * 0.75, finRoot * 0.3, 32, Math.max(0.06, r * 0.05), side, wingMat), stabX, stabY);
    }

    // Engines.
    const nr = fam.nacelleR * L, nl = fam.nacelleL * L;
    if (fam.engines === 'wing' && !(spec.props && spec.family === 'airlifter')) {
      for (const f of fam.engineAt) {
        for (const side of [1, -1]) {
          const p = wingPoint(f);
          const high = fam.wingY > 0;
          const y = p.y + (high ? -nr * 1.25 : -nr * 1.15);
          add(cyl(nr, nr * 0.82, nl, metal), p.x + nl * 0.35, y, side * half * f);
          add(cyl(nr * 0.86, nr * 0.86, nl * 0.02, dark), p.x + nl * 0.86, y, side * half * f);
          add(mesh(new THREE.BoxGeometry(nl * 0.5, nr * 0.9, nr * 0.25), wingMat), p.x - nl * 0.05, y + nr * (high ? 1.1 : 0.9), side * half * f);
        }
      }
    } else if (fam.engines === 'prop-wing' || (spec.props && spec.family === 'airlifter')) {
      for (const f of fam.engineAt) {
        for (const side of [1, -1]) {
          const p = wingPoint(f);
          const pr = spec.family === 'airlifter' ? L * 0.085 : L * 0.075;
          add(cyl(nr * 0.9, nr * 0.7, nl, paint), p.x - nl * 0.25, p.y - nr * 0.35, side * half * f);
          add(propeller(pr, 6), p.x + nl * 0.27, p.y - nr * 0.35, side * half * f);
        }
      }
    } else if (fam.engines === 'rear') {
      for (const side of [1, -1]) {
        const x = -L / 2 + L * 0.27;
        add(cyl(nr, nr * 0.8, nl, metal), x, r * 0.45, side * (r + nr * 1.25));
        add(cyl(nr * 0.86, nr * 0.86, nl * 0.02, dark), x + nl * 0.5, r * 0.45, side * (r + nr * 1.25));
        add(mesh(new THREE.BoxGeometry(nl * 0.4, nr * 0.4, nr * 1.3), wingMat), x, r * 0.45, side * (r + nr * 0.3));
      }
    } else if (fam.engines === 'nose') {
      add(propeller(L * 0.11, spec.family === 'single-prop' ? 4 : 2), L / 2 + 0.05);
    }

    // Wing struts on a high-winged light aircraft.
    if (spec.family === 'light-high') {
      for (const side of [1, -1]) {
        const x = wingX - fam.rootChord * L * 0.4;
        const a = new THREE.Vector3(x, -r * 0.6, side * r * 0.9);
        const b = new THREE.Vector3(x, wingY, side * half * 0.5);
        const dir = b.clone().sub(a);
        const strut = mesh(new THREE.CylinderGeometry(0.035, 0.035, dir.length(), 8), metal);
        strut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
        strut.position.copy(a).add(b).multiplyScalar(0.5);
        root.add(strut);
      }
    }
  }

  // Centre the model on its bounding box.
  const box = new THREE.Box3().setFromObject(root);
  const centre = box.getCenter(new THREE.Vector3());
  for (const c of root.children) c.position.sub(centre);
  const size = box.getSize(new THREE.Vector3());
  const wrapper = new THREE.Group();
  wrapper.add(root);

  return {
    object: wrapper,
    spanM: Math.max(size.x, size.y, size.z),
    tick: (dt: number) => { for (const s of spinners) s.obj.rotation[s.axis] += s.rate * dt; },
    dispose: () => { for (const d of disposables) d.dispose(); },
  };
}
