/**
 * OSIRIS — the view below a satellite
 *
 * The selected satellite's card carries a picture of the ground under it,
 * looking straight down from where the satellite is, the way an orbital
 * camera would. The picture is Esri World Imagery (the same tiles as the SAT
 * basemap), so it shows the place, not a live frame from that satellite.
 *
 * These are the numbers behind that picture: how much ground a lens of a given
 * width covers from a given height, and the map zoom that shows exactly that
 * much ground across the picture.
 */

export const ESRI_IMAGERY_TILES =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
/** Esri's required credit for World Imagery. */
export const ESRI_IMAGERY_CREDIT =
  'Powered by Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community';

/** Magnification steps of the view, like a camera's zoom ring. */
export const VIEW_ZOOMS = [1, 2, 4, 8] as const;

/** The lens across the picture at 1x in low orbit: from the ISS, about 490 km of ground. */
const BASE_FOV_DEG = 60;
/** Higher up, 1x shows the whole Earth with this much room around it. */
const DISK_MARGIN = 1.15;
const EARTH_RADIUS_KM = 6371.0088;
/** MapLibre's world is 512 px across at zoom 0. */
const WORLD_PX = 512;
const EQUATOR_M = 40_075_016.686;
const toRad = Math.PI / 180;

/**
 * The view's width at 1x, degrees. A fixed 60° lens from geostationary height
 * would show a small Earth in a black frame, so past the height where the
 * planet fills 60° the lens fits the Earth's disk instead.
 */
export function baseFovDeg(altKm: number): number {
  const diskDeg = (2 * Math.asin(EARTH_RADIUS_KM / (EARTH_RADIUS_KM + altKm))) / toRad;
  return Math.min(BASE_FOV_DEG, diskDeg * DISK_MARGIN);
}

/** A lens's width at a magnification: zoom divides the tangent of the half-angle. */
export function fovAtZoom(baseDeg: number, zoom: number): number {
  return (2 * Math.atan(Math.tan((baseDeg * toRad) / 2) / zoom)) / toRad;
}

/**
 * Ground width across the picture, km, along the Earth's curve. A lens wider
 * than the Earth's disk stops at the horizon on both sides.
 */
export function footprintKm(altKm: number, fovDeg: number): number {
  const half = (fovDeg * toRad) / 2;
  const R = EARTH_RADIUS_KM;
  const sinGround = ((R + altKm) / R) * Math.sin(half);
  // Angle at the Earth's centre from the point below to the edge of the view.
  const central = sinGround >= 1 ? Math.acos(R / (R + altKm)) : Math.asin(sinGround) - half;
  return 2 * R * central;
}

/** The map zoom that fits `widthKm` of ground across `widthPx` at a latitude. */
export function zoomForWidth(widthKm: number, latDeg: number, widthPx: number): number {
  const metresPerPx = (widthKm * 1000) / Math.max(widthPx, 1);
  const z = Math.log2((EQUATOR_M * Math.cos(latDeg * toRad)) / (WORLD_PX * metresPerPx));
  return Math.min(Math.max(Number.isFinite(z) ? z : 0, 0), 18);
}
