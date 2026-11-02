import type { TransitFeed } from './transit';

/**
 * OSIRIS — live transit feeds that need a (free) key.
 *
 * Each is switched on by setting its environment variable on the server; the
 * key never leaves the server. Without the variable the feed is not listed,
 * not read and not shown. Unlike the generated keyless catalogue, these could
 * not be checked live when they were added, for want of the keys: every URL
 * and header is the operator's documented one, and the reader reports a
 * refused key as an error on the layer rather than silently showing nothing.
 *
 * `bbox` is the operator's service area, `center` where its ring sits and
 * `core` where a click on the ring flies to.
 */
export const KEYED_TRANSIT_FEEDS: TransitFeed[] = [
  // ── United States ──
  {
    id: 'wmata-bus', provider: 'WMATA Metrobus', country: 'US', region: 'Washington, DC',
    url: 'https://api.wmata.com/gtfs/bus-gtfsrt-vehiclepositions.pb',
    bbox: [-77.6, 38.6, -76.7, 39.2], center: [-77.03, 38.9], core: [-77.2, 38.8, -76.9, 39.0],
    license: 'https://developer.wmata.com/license', vehiclesAtProbe: 0, defaultMode: 'bus',
    key: { env: 'TRANSIT_WMATA_KEY', header: 'api_key', signup: 'https://developer.wmata.com/' },
  },
  {
    id: 'wmata-rail', provider: 'WMATA Metrorail', country: 'US', region: 'Washington, DC',
    url: 'https://api.wmata.com/gtfs/rail-gtfsrt-vehiclepositions.pb',
    bbox: [-77.6, 38.6, -76.7, 39.2], center: [-77.03, 38.9], core: [-77.2, 38.8, -76.9, 39.0],
    license: 'https://developer.wmata.com/license', vehiclesAtProbe: 0, defaultMode: 'metro',
    key: { env: 'TRANSIT_WMATA_KEY', header: 'api_key', signup: 'https://developer.wmata.com/' },
  },
  {
    id: '511-sf-bay', provider: '511 SF Bay (all Bay Area operators)', country: 'US', region: 'San Francisco Bay Area',
    url: 'https://api.511.org/transit/vehiclepositions?agency=RG',
    bbox: [-123.1, 36.9, -121.4, 38.6], center: [-122.42, 37.77], core: [-122.55, 37.65, -122.15, 37.9],
    license: 'https://511.org/open-data/terms', vehiclesAtProbe: 0, defaultMode: 'bus',
    key: { env: 'TRANSIT_511_KEY', query: 'api_key', signup: 'https://511.org/open-data/token' },
  },
  {
    id: 'trimet-portland', provider: 'TriMet', country: 'US', region: 'Portland, OR',
    url: 'https://developer.trimet.org/ws/V1/VehiclePositions',
    bbox: [-123.2, 45.2, -122.3, 45.7], center: [-122.68, 45.52], core: [-122.85, 45.43, -122.5, 45.6],
    license: 'https://developer.trimet.org/terms_of_use.shtml', vehiclesAtProbe: 0, defaultMode: 'bus',
    key: { env: 'TRANSIT_TRIMET_KEY', query: 'appID', signup: 'https://developer.trimet.org/appid/registration/' },
  },
  // ── Canada ──
  {
    id: 'translink-vancouver', provider: 'TransLink', country: 'CA', region: 'Vancouver, BC',
    url: 'https://gtfsapi.translink.ca/v3/gtfsposition',
    bbox: [-123.4, 49.0, -122.2, 49.5], center: [-123.1, 49.27], core: [-123.25, 49.17, -122.8, 49.32],
    license: 'https://www.translink.ca/about-us/doing-business-with-translink/app-developer-resources', vehiclesAtProbe: 0, defaultMode: 'bus',
    key: { env: 'TRANSIT_TRANSLINK_KEY', query: 'apikey', signup: 'https://developer.translink.ca/' },
  },
  {
    id: 'stm-montreal', provider: 'STM', country: 'CA', region: 'Montréal, QC',
    url: 'https://api.stm.info/pub/od/gtfs-rt/ic/v2/vehiclePositions',
    bbox: [-74.0, 45.4, -73.4, 45.75], center: [-73.6, 45.5], core: [-73.75, 45.45, -73.5, 45.6],
    license: 'https://www.stm.info/en/about/developers', vehiclesAtProbe: 0, defaultMode: 'bus',
    key: { env: 'TRANSIT_STM_KEY', header: 'apiKey', signup: 'https://portail.developpeurs.stm.info/' },
  },
  // ── Europe ──
  {
    id: 'nta-ireland', provider: 'National Transport Authority (all of Ireland)', country: 'IE', region: 'Ireland',
    url: 'https://api.nationaltransport.ie/gtfsr/v2/Vehicles',
    bbox: [-10.7, 51.3, -5.9, 55.5], center: [-6.26, 53.35], core: [-6.45, 53.25, -6.1, 53.45],
    license: 'https://developer.nationaltransport.ie/', vehiclesAtProbe: 0, defaultMode: 'bus',
    key: { env: 'TRANSIT_NTA_KEY', header: 'x-api-key', signup: 'https://developer.nationaltransport.ie/' },
  },
  {
    id: 'sl-stockholm', provider: 'SL (via Trafiklab)', country: 'SE', region: 'Stockholm',
    url: 'https://opendata.samtrafiken.se/gtfs-rt/sl/VehiclePositions.pb',
    bbox: [17.4, 58.9, 19.3, 60.3], center: [18.07, 59.33], core: [17.85, 59.25, 18.25, 59.42],
    license: 'https://www.trafiklab.se/api/gtfs-datasets/gtfs-regional/', vehiclesAtProbe: 0, defaultMode: 'bus',
    key: { env: 'TRANSIT_TRAFIKLAB_KEY', query: 'key', signup: 'https://developer.trafiklab.se/' },
  },
  // ── Australia and New Zealand ──
  ...([
    ['tfnsw-buses', 'Transport for NSW buses', 'v1/gtfs/vehiclepos/buses', 'bus'],
    ['tfnsw-sydneytrains', 'Sydney Trains', 'v2/gtfs/vehiclepos/sydneytrains', 'rail'],
    ['tfnsw-metro', 'Sydney Metro', 'v2/gtfs/vehiclepos/metro', 'metro'],
    ['tfnsw-ferries', 'Sydney Ferries', 'v1/gtfs/vehiclepos/ferries/sydneyferries', 'ferry'],
    ['tfnsw-lightrail', 'Sydney Light Rail', 'v1/gtfs/vehiclepos/lightrail/innerwest', 'tram'],
  ] as const).map(([id, provider, path, mode]): TransitFeed => ({
    id, provider, country: 'AU', region: 'Sydney, NSW',
    url: `https://api.transport.nsw.gov.au/${path}`,
    bbox: [149.9, -35.0, 152.0, -32.6], center: [151.21, -33.87], core: [150.9, -34.0, 151.35, -33.7],
    license: 'https://opendata.transport.nsw.gov.au/data-licence', vehiclesAtProbe: 0, defaultMode: mode,
    key: { env: 'TRANSIT_TFNSW_KEY', header: 'Authorization', prefix: 'apikey ', signup: 'https://opendata.transport.nsw.gov.au/' },
  })),
  {
    id: 'metlink-wellington', provider: 'Metlink', country: 'NZ', region: 'Wellington',
    url: 'https://api.opendata.metlink.org.nz/v1/gtfs-rt/vehiclepositions',
    bbox: [174.6, -41.4, 175.6, -40.7], center: [174.78, -41.29], core: [174.7, -41.35, 174.95, -41.1],
    license: 'https://opendata.metlink.org.nz/', vehiclesAtProbe: 0, defaultMode: 'bus',
    key: { env: 'TRANSIT_METLINK_KEY', header: 'x-api-key', signup: 'https://opendata.metlink.org.nz/' },
  },
  {
    id: 'at-auckland', provider: 'Auckland Transport', country: 'NZ', region: 'Auckland',
    url: 'https://api.at.govt.nz/realtime/legacy/vehiclelocations',
    // Without this Accept header the endpoint answers in JSON.
    headers: { Accept: 'application/x-protobuf' },
    bbox: [174.4, -37.3, 175.3, -36.3], center: [174.76, -36.85], core: [174.6, -36.95, 174.9, -36.75],
    license: 'https://dev-portal.at.govt.nz/', vehiclesAtProbe: 0, defaultMode: 'bus',
    key: { env: 'TRANSIT_AT_KEY', header: 'Ocp-Apim-Subscription-Key', signup: 'https://dev-portal.at.govt.nz/' },
  },
];
