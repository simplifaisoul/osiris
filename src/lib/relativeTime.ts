/** Compact relative-time label ("now", "40s ago", "15m ago", "3h ago", "2d ago").
 * Returns "never" for null or unparseable input. `now` is injectable for testing. */
export function relativeTime(iso: string | null, now: number = Date.now()): string {
  if (!iso) return 'never';
  const then = Date.parse(iso);
  if (isNaN(then)) return 'never';

  const seconds = Math.max(0, Math.floor((now - then) / 1000));
  if (seconds < 5) return 'now';
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
