import { modeForRouteType, type TransitFeed, type TransitMode } from './transit';
import { TRANSIT_ROUTES_JSON } from './transit-routes.generated';

/**
 * Route names and modes for the live-transit feeds, from their timetables
 * (see tools/generate-transit-feeds.mjs --routes). Server side only: the
 * table is too big to send to a browser, and each vehicle carries its own.
 */

interface FeedRoutes {
  /** The mode most of the feed's routes are. */
  d?: TransitMode;
  /** route_id → [name riders use, or "" when it is the id; GTFS route_type, or -1]. */
  r: Record<string, [string, number]>;
}

/** A feed's identity in the table: its URL without scheme, case or trailing slash. */
export const feedKey = (url: string) => url.toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');

let table: Record<string, FeedRoutes> | null = null;
const routes = () => (table ??= JSON.parse(TRANSIT_ROUTES_JSON) as Record<string, FeedRoutes>);

/** What the timetable says about a route: the name on the vehicle, and what kind of vehicle runs it. */
export function routeFor(feed: TransitFeed, routeId: string): { name?: string; mode?: TransitMode } | undefined {
  const entry = routes()[feedKey(feed.url)]?.r[routeId];
  if (!entry) return undefined;
  const [name, type] = entry;
  const mode = modeForRouteType(type >= 0 ? type : undefined);
  return { ...(name ? { name } : {}), ...(mode !== 'unknown' ? { mode } : {}) };
}

/** The mode most of a feed's routes are, from its timetable. */
export function timetableModeFor(feed: TransitFeed): TransitMode | undefined {
  return routes()[feedKey(feed.url)]?.d;
}
