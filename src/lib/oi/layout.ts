/**
 * OSIRIS OI: the workspace's geometry, in one place.
 *
 * The full-screen workspace puts a column on each side of a centre stage. The
 * columns grow with the screen within limits, and the globe, when it is the
 * stage, centres itself in the space between them: the page reads the same
 * numbers to set the map's padding, so the two never disagree.
 */
export interface WorkspaceLayout {
  /** Width of the left (assessment) and right (objects) columns. */
  left: number;
  right: number;
  /** Margin round the edge and between the columns and the stage. */
  gap: number;
  /** Where the columns start, under the top bar. */
  top: number;
}

export function workspaceLayout(width: number): WorkspaceLayout {
  const w = Number.isFinite(width) && width > 0 ? width : 1440;
  return {
    left: Math.round(Math.min(392, Math.max(320, w * 0.24))),
    right: Math.round(Math.min(440, Math.max(360, w * 0.27))),
    gap: 16,
    top: 84,
  };
}

/**
 * The map padding that centres the globe on the stage. Without a forecast
 * there is no right-hand column, and the stage runs to the edge.
 */
export function workspaceInsets(width: number, withRight = true): { top: number; bottom: number; left: number; right: number } {
  const l = workspaceLayout(width);
  return { top: l.top - 8, bottom: l.gap + 8, left: l.left + l.gap * 2, right: withRight ? l.right + l.gap * 2 : l.gap };
}
