import { describe, expect, it } from 'vitest';

const routes = [
  ['aircraft', () => import('./aircraft/route'), () => import('./aircraft/handler'), ['GET', 'maxDuration']],
  ['cctv', () => import('./cctv/route'), () => import('./cctv/handler'), ['GET', 'maxDuration']],
  ['directions', () => import('./directions/route'), () => import('./directions/handler'), ['GET', 'maxDuration']],
  ['geosearch', () => import('./geosearch/route'), () => import('./geosearch/handler'), ['GET', 'maxDuration']],
  ['infrastructure', () => import('./infrastructure/route'), () => import('./infrastructure/handler'), ['GET']],
  ['maritime', () => import('./maritime/route'), () => import('./maritime/handler'), ['GET']],
  ['markets', () => import('./markets/route'), () => import('./markets/handler'), ['GET']],
  ['markets/history', () => import('./markets/history/route'), () => import('./markets/history/handler'), ['GET']],
  ['osint/hudsonrock', () => import('./osint/hudsonrock/route'), () => import('./osint/hudsonrock/handler'), ['GET']],
  ['stats', () => import('./stats/route'), () => import('./stats/handler'), ['GET', 'maxDuration']],
] as const;

describe('API route entrypoint exports', () => {
  it.each(routes)('%s exposes only its tested handler and supported config', async (_name, loadRoute, loadHandler, allowed) => {
    const aisApiKey = process.env.AIS_API_KEY;
    delete process.env.AIS_API_KEY;

    try {
      const [route, handler] = await Promise.all([loadRoute(), loadHandler()]);
      expect(Object.keys(route).sort()).toEqual([...allowed].sort());
      expect(route.GET).toBe(handler.GET);
    } finally {
      if (aisApiKey === undefined) delete process.env.AIS_API_KEY;
      else process.env.AIS_API_KEY = aisApiKey;
    }
  });
});
