import type { Earthquake } from './contract';

export const expectedFixtureEarthquakes: Earthquake[] = [
  {
    id: 'test-us-001',
    lat: -33.8688,
    lng: 151.2093,
    depth: 12.5,
    magnitude: 5.2,
    place: '42 km E of Test Harbour',
    time: 1767222000123,
    url: 'https://earthquake.usgs.gov/earthquakes/eventpage/test-us-001',
    tsunami: 1,
    type: 'earthquake',
    felt: 27,
    alert: 'green',
  },
  {
    id: 'test-us-002',
    lat: 37.7749,
    lng: -122.4194,
    depth: -1.25,
    magnitude: null,
    place: null,
    time: 1767218400000,
    url: null,
    tsunami: 0,
    type: null,
    felt: null,
    alert: null,
  },
];
