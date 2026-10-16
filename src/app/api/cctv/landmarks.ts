import type { CctvCamera } from './types';

/**
 * OSIRIS — world landmark cameras (EarthCam live streams).
 *
 * The traffic-authority sources cover roads; these cover the places people
 * actually mean when they ask to look somewhere. Bourbon Street, Times Square,
 * the Statue of Liberty, Abbey Road — none of which any DOT points a camera at.
 *
 * It also fills the one hole SkylineWebcams leaves in the Americas: Skyline has
 * no Louisiana at all, so before this there was nothing over New Orleans but
 * LADOTD's freeway cameras on I-610 and US-90.
 *
 * Every stream is a public EarthCam broadcast on YouTube, embedded the same way
 * the Middle East curated cameras are. Each one was checked before it was added
 * here: live at the time of writing, and `playableInEmbed` — a stream that has
 * ended is worse than no camera, because the map still shows a pin.
 *
 * Coordinates come from OpenStreetMap Nominatim, each bounding-box checked
 * against the place it claims to be, not typed from memory.
 *
 * If one goes dark, EarthCam has restarted it under a new video id rather than
 * taken it down — search their channel for the same title and swap the id.
 */
export const WORLD_LANDMARK_CAMERAS: CctvCamera[] = [
  // ── US (23) ──
  {
    id: 'earthcam-bourbon-street', lat: 29.954682, lng: -90.069172,
    name: 'Bourbon Street', city: 'New Orleans', country: 'US',
    stream_url: 'https://www.youtube.com/embed/QhFYcPBmkcI?autoplay=1&mute=1',
    stream_type: 'iframe',
    external_url: 'https://www.youtube.com/watch?v=QhFYcPBmkcI',
    source: 'EarthCam',
  },
  {
    id: 'earthcam-french-quarter-balcony', lat: 29.9574673, lng: -90.0629499,
    name: 'French Quarter Balcony', city: 'New Orleans', country: 'US',
    stream_url: 'https://www.youtube.com/embed/6lFBKxt8kIo?autoplay=1&mute=1',
    stream_type: 'iframe',
    external_url: 'https://www.youtube.com/watch?v=6lFBKxt8kIo',
    source: 'EarthCam',
  },
  {
    id: 'earthcam-times-square', lat: 40.7570095, lng: -73.9859724,
    name: 'Times Square', city: 'New York', country: 'US',
    stream_url: 'https://www.youtube.com/embed/JQ_jwk_7OVE?autoplay=1&mute=1',
    stream_type: 'iframe',
    external_url: 'https://www.youtube.com/watch?v=JQ_jwk_7OVE',
    source: 'EarthCam',
  },
  {
    id: 'earthcam-statue-of-liberty', lat: 40.68925, lng: -74.04455,
    name: 'Statue of Liberty', city: 'New York', country: 'US',
    stream_url: 'https://www.youtube.com/embed/o5Ie_LpZ9uk?autoplay=1&mute=1',
    stream_type: 'iframe',
    external_url: 'https://www.youtube.com/watch?v=o5Ie_LpZ9uk',
    source: 'EarthCam',
  },
  {
    id: 'earthcam-brooklyn-bridge', lat: 40.7062175, lng: -73.9970208,
    name: 'Brooklyn Bridge', city: 'New York', country: 'US',
    stream_url: 'https://www.youtube.com/embed/tErYxn2UM5Y?autoplay=1&mute=1',
    stream_type: 'iframe',
    external_url: 'https://www.youtube.com/watch?v=tErYxn2UM5Y',
    source: 'EarthCam',
  },
  {
    id: 'earthcam-world-trade-center', lat: 40.7129992, lng: -74.0131894,
    name: 'World Trade Center', city: 'New York', country: 'US',
    stream_url: 'https://www.youtube.com/embed/5C9oM7C2Q9k?autoplay=1&mute=1',
    stream_type: 'iframe',
    external_url: 'https://www.youtube.com/watch?v=5C9oM7C2Q9k',
    source: 'EarthCam',
  },
  {
    id: 'earthcam-9-11-memorial', lat: 40.71137, lng: -74.01327,
    name: '9/11 Memorial', city: 'New York', country: 'US',
    stream_url: 'https://www.youtube.com/embed/ZYQlLQHz2Mg?autoplay=1&mute=1',
    stream_type: 'iframe',
    external_url: 'https://www.youtube.com/watch?v=ZYQlLQHz2Mg',
    source: 'EarthCam',
  },
  {
    id: 'earthcam-lincoln-harbor', lat: 40.7616462, lng: -74.0238483,
    name: 'Lincoln Harbor', city: 'Weehawken', country: 'US',
    stream_url: 'https://www.youtube.com/embed/sixP_dAJ8D4?autoplay=1&mute=1',
    stream_type: 'iframe',
    external_url: 'https://www.youtube.com/watch?v=sixP_dAJ8D4',
    source: 'EarthCam',
  },
  {
    id: 'earthcam-washington-monument', lat: 38.8894754, lng: -77.0352426,
    name: 'Washington Monument', city: 'Washington', country: 'US',
    stream_url: 'https://www.youtube.com/embed/oDCAAfOSqvA?autoplay=1&mute=1',
    stream_type: 'iframe',
    external_url: 'https://www.youtube.com/watch?v=oDCAAfOSqvA',
    source: 'EarthCam',
  },
  {
    id: 'earthcam-liberty-bell-independence-hall', lat: 39.9488873, lng: -75.150026,
    name: 'Liberty Bell - Independence Hall', city: 'Philadelphia', country: 'US',
    stream_url: 'https://www.youtube.com/embed/F1EQEDL4ddU?autoplay=1&mute=1',
    stream_type: 'iframe',
    external_url: 'https://www.youtube.com/watch?v=F1EQEDL4ddU',
    source: 'EarthCam',
  },
  {
    id: 'earthcam-philadelphia-skyline', lat: 39.9523995, lng: -75.1629893,
    name: 'Philadelphia Skyline', city: 'Philadelphia', country: 'US',
    stream_url: 'https://www.youtube.com/embed/9mMnqO1UuIU?autoplay=1&mute=1',
    stream_type: 'iframe',
    external_url: 'https://www.youtube.com/watch?v=9mMnqO1UuIU',
    source: 'EarthCam',
  },
  {
    id: 'earthcam-flight-93-memorial-tower-of-voices', lat: 40.0617672, lng: -78.897143,
    name: 'Flight 93 Memorial - Tower of Voices', city: 'Shanksville', country: 'US',
    stream_url: 'https://www.youtube.com/embed/OSI8qWMoK5E?autoplay=1&mute=1',
    stream_type: 'iframe',
    external_url: 'https://www.youtube.com/watch?v=OSI8qWMoK5E',
    source: 'EarthCam',
  },
  {
    id: 'earthcam-midway-airport', lat: 41.7855142, lng: -87.7517243,
    name: 'Midway Airport', city: 'Chicago', country: 'US',
    stream_url: 'https://www.youtube.com/embed/EiUyBIcG4fQ?autoplay=1&mute=1',
    stream_type: 'iframe',
    external_url: 'https://www.youtube.com/watch?v=EiUyBIcG4fQ',
    source: 'EarthCam',
  },
  {
    id: 'earthcam-national-aquarium', lat: 39.2847578, lng: -76.60769,
    name: 'National Aquarium', city: 'Baltimore', country: 'US',
    stream_url: 'https://www.youtube.com/embed/KSxc-N67TU4?autoplay=1&mute=1',
    stream_type: 'iframe',
    external_url: 'https://www.youtube.com/watch?v=KSxc-N67TU4',
    source: 'EarthCam',
  },
  {
    id: 'earthcam-sanibel-island', lat: 26.4489695, lng: -82.0223137,
    name: 'Sanibel Island', city: 'Sanibel', country: 'US',
    stream_url: 'https://www.youtube.com/embed/4LTSTw4jnZc?autoplay=1&mute=1',
    stream_type: 'iframe',
    external_url: 'https://www.youtube.com/watch?v=4LTSTw4jnZc',
    source: 'EarthCam',
  },
  {
    id: 'earthcam-anglins-pier', lat: 26.19203, lng: -80.09643,
    name: 'Anglins Pier', city: 'Lauderdale-By-The-Sea', country: 'US',
    stream_url: 'https://www.youtube.com/embed/tAdTOOsrZBQ?autoplay=1&mute=1',
    stream_type: 'iframe',
    external_url: 'https://www.youtube.com/watch?v=tAdTOOsrZBQ',
    source: 'EarthCam',
  },
  {
    id: 'earthcam-wildwoods-boardwalk', lat: 38.9841969, lng: -74.8142502,
    name: 'Wildwoods Boardwalk', city: 'Wildwood', country: 'US',
    stream_url: 'https://www.youtube.com/embed/cK71xhMRtds?autoplay=1&mute=1',
    stream_type: 'iframe',
    external_url: 'https://www.youtube.com/watch?v=cK71xhMRtds',
    source: 'EarthCam',
  },
  {
    id: 'earthcam-seaside-heights', lat: 39.9427613, lng: -74.0735588,
    name: 'Seaside Heights', city: 'Seaside Heights', country: 'US',
    stream_url: 'https://www.youtube.com/embed/OBgCrw-IyhE?autoplay=1&mute=1',
    stream_type: 'iframe',
    external_url: 'https://www.youtube.com/watch?v=OBgCrw-IyhE',
    source: 'EarthCam',
  },
  {
    id: 'earthcam-pigeon-river', lat: 35.8167646, lng: -83.1432066,
    name: 'Pigeon River', city: 'Hartford', country: 'US',
    stream_url: 'https://www.youtube.com/embed/6tq8S2pp8PQ?autoplay=1&mute=1',
    stream_type: 'iframe',
    external_url: 'https://www.youtube.com/watch?v=6tq8S2pp8PQ',
    source: 'EarthCam',
  },
  {
    id: 'earthcam-madison-riverfront', lat: 38.7358933, lng: -85.3799577,
    name: 'Madison Riverfront', city: 'Madison', country: 'US',
    stream_url: 'https://www.youtube.com/embed/Ez6xC43MMTQ?autoplay=1&mute=1',
    stream_type: 'iframe',
    external_url: 'https://www.youtube.com/watch?v=Ez6xC43MMTQ',
    source: 'EarthCam',
  },
  {
    id: 'earthcam-world-s-largest-buffalo-monument', lat: 46.910544, lng: -98.708436,
    name: 'World\'s Largest Buffalo Monument', city: 'Jamestown', country: 'US',
    stream_url: 'https://www.youtube.com/embed/VWDi2Po3ZsQ?autoplay=1&mute=1',
    stream_type: 'iframe',
    external_url: 'https://www.youtube.com/watch?v=VWDi2Po3ZsQ',
    source: 'EarthCam',
  },
  {
    id: 'earthcam-council-bluffs', lat: 41.258841, lng: -95.8519484,
    name: 'Council Bluffs', city: 'Council Bluffs', country: 'US',
    stream_url: 'https://www.youtube.com/embed/qsrevo5Vdkw?autoplay=1&mute=1',
    stream_type: 'iframe',
    external_url: 'https://www.youtube.com/watch?v=qsrevo5Vdkw',
    source: 'EarthCam',
  },
  {
    id: 'earthcam-roswell', lat: 33.3943282, lng: -104.5229518,
    name: 'Roswell', city: 'Roswell', country: 'US',
    stream_url: 'https://www.youtube.com/embed/kLoFxVhRWtQ?autoplay=1&mute=1',
    stream_type: 'iframe',
    external_url: 'https://www.youtube.com/watch?v=kLoFxVhRWtQ',
    source: 'EarthCam',
  },
  // ── UK (1) ──
  {
    id: 'earthcam-abbey-road-crossing', lat: 51.53199, lng: -0.17823,
    name: 'Abbey Road Crossing', city: 'London', country: 'UK',
    stream_url: 'https://www.youtube.com/embed/zMCea32gpmg?autoplay=1&mute=1',
    stream_type: 'iframe',
    external_url: 'https://www.youtube.com/watch?v=zMCea32gpmg',
    source: 'EarthCam',
  },
  // ── Spain (2) ──
  {
    id: 'earthcam-mallorca', lat: 39.5532245, lng: 2.729031,
    name: 'Mallorca', city: 'Mallorca', country: 'Spain',
    stream_url: 'https://www.youtube.com/embed/jtdyLykT_XY?autoplay=1&mute=1',
    stream_type: 'iframe',
    external_url: 'https://www.youtube.com/watch?v=jtdyLykT_XY',
    source: 'EarthCam',
  },
  {
    id: 'earthcam-tamariu', lat: 41.9203698, lng: 3.2068515,
    name: 'Tamariu', city: 'Tamariu', country: 'Spain',
    stream_url: 'https://www.youtube.com/embed/fTh5ssC1z-c?autoplay=1&mute=1',
    stream_type: 'iframe',
    external_url: 'https://www.youtube.com/watch?v=fTh5ssC1z-c',
    source: 'EarthCam',
  },
  // ── Cayman Islands (1) ──
  {
    id: 'earthcam-seven-mile-beach', lat: 19.3387961, lng: -81.3809352,
    name: 'Seven Mile Beach', city: 'Grand Cayman', country: 'Cayman Islands',
    stream_url: 'https://www.youtube.com/embed/Xw8CoRwNfXs?autoplay=1&mute=1',
    stream_type: 'iframe',
    external_url: 'https://www.youtube.com/watch?v=Xw8CoRwNfXs',
    source: 'EarthCam',
  },
];

export async function fetchLandmarkCameras(): Promise<CctvCamera[]> {
  return WORLD_LANDMARK_CAMERAS;
}
