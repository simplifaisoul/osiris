import { describe, it, expect } from 'vitest';
import { createHealthTracker } from './health';

describe('createHealthTracker', () => {
  it('reports unknown status for a source with no recorded activity', () => {
    const tracker = createHealthTracker(() => 1000);
    const health = tracker.get('never-seen');
    expect(health.status).toBe('unknown');
    expect(health.lastSuccessAt).toBeNull();
    expect(health.lastErrorAt).toBeNull();
    expect(health.consecutiveFailures).toBe(0);
  });

  it('reports ok after a successful fetch and records latency/timestamp', () => {
    const tracker = createHealthTracker(() => 5000);
    tracker.recordSuccess('a', 120);
    const health = tracker.get('a');
    expect(health.status).toBe('ok');
    expect(health.lastLatencyMs).toBe(120);
    expect(health.lastSuccessAt).toBe(new Date(5000).toISOString());
    expect(health.consecutiveFailures).toBe(0);
  });

  it('reports degraded after 1 or 2 consecutive failures', () => {
    const tracker = createHealthTracker(() => 1000);
    tracker.recordFailure('a');
    expect(tracker.get('a').status).toBe('degraded');
    expect(tracker.get('a').consecutiveFailures).toBe(1);

    tracker.recordFailure('a');
    expect(tracker.get('a').status).toBe('degraded');
    expect(tracker.get('a').consecutiveFailures).toBe(2);
  });

  it('reports down after 3 or more consecutive failures', () => {
    const tracker = createHealthTracker(() => 1000);
    tracker.recordFailure('a');
    tracker.recordFailure('a');
    tracker.recordFailure('a');
    expect(tracker.get('a').status).toBe('down');
    expect(tracker.get('a').consecutiveFailures).toBe(3);
  });

  it('resets consecutiveFailures and returns to ok after a success', () => {
    const tracker = createHealthTracker(() => 1000);
    tracker.recordFailure('a');
    tracker.recordFailure('a');
    tracker.recordFailure('a');
    tracker.recordSuccess('a', 50);
    const health = tracker.get('a');
    expect(health.status).toBe('ok');
    expect(health.consecutiveFailures).toBe(0);
  });

  it('records lastErrorAt on failure without clearing lastSuccessAt history', () => {
    let now = 1000;
    const tracker = createHealthTracker(() => now);
    tracker.recordSuccess('a', 10);
    now = 2000;
    tracker.recordFailure('a');
    const health = tracker.get('a');
    expect(health.lastSuccessAt).toBe(new Date(1000).toISOString());
    expect(health.lastErrorAt).toBe(new Date(2000).toISOString());
  });

  it('tracks sources independently', () => {
    const tracker = createHealthTracker(() => 1000);
    tracker.recordFailure('a');
    tracker.recordSuccess('b', 5);
    expect(tracker.get('a').status).toBe('degraded');
    expect(tracker.get('b').status).toBe('ok');
  });

  it('snapshot returns health for every source that has recorded activity', () => {
    const tracker = createHealthTracker(() => 1000);
    tracker.recordSuccess('a', 10);
    tracker.recordFailure('b');
    const snapshot = tracker.snapshot();
    const ids = snapshot.map((h) => h.sourceId).sort();
    expect(ids).toEqual(['a', 'b']);
  });
});
