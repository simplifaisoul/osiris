import { describe, it, expect, vi } from 'vitest';
import { createRateLimiter } from './rateLimit';

describe('createRateLimiter', () => {
  it('does not wait on the first acquire for a source', async () => {
    const wait = vi.fn().mockResolvedValue(undefined);
    const limiter = createRateLimiter(() => 1000, wait);
    await limiter.acquire('a', 5000);
    expect(wait).not.toHaveBeenCalled();
  });

  it('waits for the remaining interval on a second acquire within the window', async () => {
    let now = 1000;
    const wait = vi.fn().mockResolvedValue(undefined);
    const limiter = createRateLimiter(() => now, wait);
    await limiter.acquire('a', 5000);
    now = 3000; // 2000ms elapsed, 3000ms remaining
    await limiter.acquire('a', 5000);
    expect(wait).toHaveBeenCalledWith(3000);
  });

  it('does not wait if the interval has already fully elapsed', async () => {
    let now = 1000;
    const wait = vi.fn().mockResolvedValue(undefined);
    const limiter = createRateLimiter(() => now, wait);
    await limiter.acquire('a', 5000);
    now = 6000; // 5000ms elapsed, exactly the interval
    await limiter.acquire('a', 5000);
    expect(wait).not.toHaveBeenCalled();
  });

  it('tracks each source independently', async () => {
    let now = 1000;
    const wait = vi.fn().mockResolvedValue(undefined);
    const limiter = createRateLimiter(() => now, wait);
    await limiter.acquire('a', 5000);
    now = 1100;
    await limiter.acquire('b', 5000);
    expect(wait).not.toHaveBeenCalled();
  });
});
