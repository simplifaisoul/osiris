/**
 * OSIRIS — where the camera lands on load when the visitor's own city is
 * unknown: no public address to locate (reached over a VPN, a tailnet or a
 * private network), or no geolocation provider answered.
 *
 * Instead of stopping on the globe, the fly-in picks one of these. Every one
 * has dense live-camera coverage, so the landing shows the platform at work.
 */

export interface LandingCity {
  name: string;
  lat: number;
  lng: number;
}

export const LANDING_CITIES: readonly LandingCity[] = [
  { name: 'London', lat: 51.5074, lng: -0.1278 },
  { name: 'Paris', lat: 48.8566, lng: 2.3522 },
  { name: 'Amsterdam', lat: 52.3676, lng: 4.9041 },
  { name: 'Berlin', lat: 52.52, lng: 13.405 },
  { name: 'Madrid', lat: 40.4168, lng: -3.7038 },
  { name: 'Rome', lat: 41.9028, lng: 12.4964 },
  { name: 'Istanbul', lat: 41.0082, lng: 28.9784 },
  { name: 'Tokyo', lat: 35.6762, lng: 139.6503 },
  { name: 'Seoul', lat: 37.5665, lng: 126.978 },
  { name: 'Taipei', lat: 25.033, lng: 121.5654 },
  { name: 'Hong Kong', lat: 22.3193, lng: 114.1694 },
  { name: 'Bangkok', lat: 13.7563, lng: 100.5018 },
  { name: 'Sydney', lat: -33.8688, lng: 151.2093 },
  { name: 'Auckland', lat: -36.8485, lng: 174.7633 },
  { name: 'Los Angeles', lat: 34.0522, lng: -118.2437 },
  { name: 'Seattle', lat: 47.6062, lng: -122.3321 },
  { name: 'Houston', lat: 29.7604, lng: -95.3698 },
  { name: 'Miami', lat: 25.7617, lng: -80.1918 },
  { name: 'Las Vegas', lat: 36.1699, lng: -115.1398 },
  { name: 'Montreal', lat: 45.5017, lng: -73.5673 },
];

/** A random city, never `exclude` — so two visits in a row never land in the same place. */
export function randomLandingCity(exclude: string | null = null, random: () => number = Math.random): LandingCity {
  const pool = LANDING_CITIES.filter(c => c.name !== exclude);
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}

const LAST_KEY = 'osiris.landing.last';

/** randomLandingCity, remembering the pick in this browser so the next visit goes elsewhere. */
export function pickLandingCity(): LandingCity {
  let last: string | null = null;
  try {
    last = window.localStorage.getItem(LAST_KEY);
  } catch {
    /* storage blocked — any city will do */
  }
  const city = randomLandingCity(last);
  try {
    window.localStorage.setItem(LAST_KEY, city.name);
  } catch {
    /* storage blocked */
  }
  return city;
}
