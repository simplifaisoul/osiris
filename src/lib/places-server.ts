/**
 * The built-in place list on the server, read from disk once (see lib/places.ts).
 * Server code only: it reads the file the browser fetches as /places.json.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { indexPlaces, type PlaceIndex, type PlaceList } from './places';

let index: PlaceIndex | null = null;

export function serverPlaces(): PlaceIndex {
  index ??= indexPlaces(JSON.parse(readFileSync(join(process.cwd(), 'public', 'places.json'), 'utf8')) as PlaceList);
  return index;
}
