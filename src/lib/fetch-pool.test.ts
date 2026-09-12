import { describe, expect, it } from 'vitest';
import { createPool } from './fetch-pool';

/** A task that resolves only when told to, so concurrency is observable. */
function gate() {
  let open!: (value?: unknown) => void;
  let fail!: (reason: unknown) => void;
  const promise = new Promise((resolve, reject) => { open = resolve; fail = reject; });
  return { promise, open, fail };
}

describe('createPool', () => {
  it('never runs more than the limit at once', async () => {
    const { run } = createPool(4);
    const gates = Array.from({ length: 20 }, gate);
    let active = 0;
    let peak = 0;
    const tasks = gates.map(g => run(async () => {
      peak = Math.max(peak, ++active);
      await g.promise;
      active--;
    }));

    await Promise.resolve();
    expect(peak).toBe(4);

    gates.forEach(g => g.open());
    await Promise.all(tasks);
    expect(peak).toBe(4);
  });

  it('starts queued work as slots free up, and runs everything', async () => {
    const { run } = createPool(2);
    const started: number[] = [];
    const gates = Array.from({ length: 6 }, gate);
    const tasks = gates.map((g, i) => run(async () => { started.push(i); await g.promise; return i; }));

    expect(started).toEqual([0, 1]);
    gates[0].open();
    await tasks[0];
    // The slot is freed in a finally chained after the resolve, so the next
    // task starts a microtask later than this caller resumes.
    await Promise.resolve();
    expect(started).toEqual([0, 1, 2]);

    gates.forEach(g => g.open());
    expect(await Promise.all(tasks)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  /* A stranded slot would shrink the pool to nothing over time, which is worse
     than the storm it replaced: the catalogue would simply stop refreshing. */
  it('frees its slot when a task rejects', async () => {
    const { run } = createPool(1);
    await expect(run(async () => { throw new Error('upstream down'); })).rejects.toThrow('upstream down');
    expect(await run(async () => 'next one still runs')).toBe('next one still runs');
  });

  it('surfaces each result to its own caller', async () => {
    const { run } = createPool(3);
    const results = await Promise.all([1, 2, 3, 4, 5].map(n => run(async () => n * 2)));
    expect(results).toEqual([2, 4, 6, 8, 10]);
  });
});
