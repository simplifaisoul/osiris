/**
 * OSIRIS — recovering from a code chunk that no longer exists.
 *
 * Panels such as the market chart are split into chunks that load on first
 * use. A page still running an earlier build — a tab left open across a
 * deploy, or HTML the browser kept for its four-hour cache lifetime — asks for
 * chunk names the new deploy does not have, and gets a 404. Turbopack then
 * throws a ChunkLoadError, and re-rendering cannot help: the module the page
 * wants is not on the server at all. Only a reload onto the current build
 * brings it back.
 */

/** Whether an error is a lazily loaded chunk that failed to arrive. */
export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === 'ChunkLoadError'
    || /Failed to load chunk|Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed/i.test(error.message);
}

const KEY = 'osiris:chunk-reload';
/** A chunk still missing this soon after a reload is not a stale page; reloading again would loop. */
const WINDOW_MS = 60_000;

/**
 * Takes the one automatic reload a chunk failure is allowed per minute.
 * Returns false when one was already taken, or when storage is unavailable
 * and there would be no way to tell a loop from a first attempt.
 */
export function claimChunkReload(now = Date.now()): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY));
    if (last && now - last < WINDOW_MS) return false;
    sessionStorage.setItem(KEY, String(now));
    return true;
  } catch {
    return false;
  }
}
