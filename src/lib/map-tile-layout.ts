/**
 * OSIRIS — where a preview tile sits relative to the marker it belongs to.
 *
 * Two layers pin live frames to markers past zoom 13: CCTV cameras, and the
 * live TV news feeds. They want different tile sizes but exactly the same
 * placement behaviour, and that behaviour has one subtlety worth keeping in a
 * single place:
 *
 *   The set of tiles to show is chosen when the map settles, and the tiles are
 *   then repositioned on every frame of a pan. If those two passes disagreed
 *   about where a tile lands, the overlap check would run against coordinates
 *   nothing is ever drawn at — which is what once let a tile clamped back
 *   inside the viewport come to rest on top of its neighbour.
 *
 * So both passes call this, and neither does placement arithmetic of its own.
 */

export interface TileGeometry {
  width: number;
  /** Frame height. 16:9 against `width`, so nothing is letterboxed. */
  imageHeight: number;
  /** Caption strip under the frame. */
  labelHeight: number;
  /** Clearance between the tile and its marker; the connector crosses it. */
  gap: number;
}

export interface TilePlacement {
  x: number;
  y: number;
  /** True when the tile had no room above its marker and sits below instead. */
  flipped: boolean;
  /**
   * False when the tile had to be clamped back inside the viewport, which
   * moves it off its marker. The caller drops the connector rather than draw a
   * line pointing at empty map.
   */
  anchored: boolean;
}

/** Keeps a tile clear of the viewport edge, and of the layer rail on the left. */
const EDGE = 60;
/**
 * More at the top and bottom, where the app's own chrome is: the header at one
 * end, the view controls and the ticker at the other. All of it draws over the
 * previews, so a tile placed underneath is simply hidden.
 */
const EDGE_TOP = 96;
const EDGE_BOTTOM = 156;

export function tileHeight(geom: TileGeometry): number {
  return geom.imageHeight + geom.labelHeight;
}

/** Where the tile for a marker at `pt` ends up inside a `width`×`height` canvas. */
export function layoutTile(
  pt: { x: number; y: number },
  viewport: { width: number; height: number },
  geom: TileGeometry,
): TilePlacement {
  const h = tileHeight(geom);
  const maxX = viewport.width - geom.width - EDGE;
  const maxY = viewport.height - h - EDGE_BOTTOM;

  /* Above the marker by default; below it when there is no room, so a marker
     near the top of the screen still gets a visible tile. */
  const above = pt.y - h - geom.gap;
  const flipped = above < EDGE_TOP;
  const wantX = pt.x - geom.width / 2;
  const wantY = flipped ? pt.y + geom.gap : above;

  const x = Math.min(Math.max(wantX, EDGE), Math.max(EDGE, maxX));
  const y = Math.min(Math.max(wantY, EDGE_TOP), Math.max(EDGE_TOP, maxY));

  return {
    x,
    y,
    flipped,
    anchored: Math.abs(x - wantX) < 1 && Math.abs(y - wantY) < 1,
  };
}

/** Whether two placed tiles would visually collide. */
export function tilesOverlap(a: TilePlacement, b: TilePlacement, geom: TileGeometry): boolean {
  return Math.abs(a.x - b.x) < geom.width + 8
    && Math.abs(a.y - b.y) < tileHeight(geom) + geom.gap;
}
