/**
 * OSIRIS — bounded work pool.
 *
 * The camera catalogue fans out to 48 regions, several of which fan out again
 * to their own sub-sources, so an uncapped `region=all` opened somewhere north
 * of sixty simultaneous TLS connections. Measured against production: every
 * upstream that failed in that storm with a 10s connect timeout — az511,
 * fl511, 511ga, drivenc, nvroads, 511la, MDOT, TripCheck, NZTA, 511in —
 * answered in 0.07-1.5s when asked on its own. The upstreams were never the
 * problem; the fan-out was starving itself, and a failure then cached an empty
 * region for a minute, which is why the same eleven regions were missing from
 * every response.
 *
 * Queued work still runs, just in an orderly line.
 */
export function createPool(limit: number) {
  if (limit < 1) throw new Error('Pool limit must be at least 1');
  let active = 0;
  const waiting: (() => void)[] = [];

  const release = () => {
    active--;
    waiting.shift()?.();
  };

  function run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        active++;
        // `finally` frees the slot on both paths, so one rejection cannot
        // strand the pool with a permanently occupied slot. Callers are still
        // responsible for bounding a task that never settles at all.
        task().then(resolve, reject).finally(release);
      };
      if (active < limit) start();
      else waiting.push(start);
    });
  }

  /** Test seam — abandons queued work so one case cannot wedge the next. */
  function reset() {
    waiting.length = 0;
    active = 0;
  }

  return { run, reset };
}
