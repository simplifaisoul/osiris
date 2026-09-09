export type CatalogCamera = { id: string | number; [key: string]: unknown };

/** Partial retries must add cameras, not erase previously loaded regions. */
export function mergeCameraCatalog<T extends { id: string | number }>(previous: T[], incoming: T[]): T[] {
  const merged = new Map(previous.map(camera => [String(camera.id), camera]));
  for (const camera of incoming) merged.set(String(camera.id), camera);
  return [...merged.values()];
}

/** Recover slow regions without downloading the entire worldwide list again. */
export function loadCameraCatalog(onBatch: (cameras: CatalogCamera[]) => void, onError: () => void) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let attempts = 0;
  const load = async (regions: string[]) => {
    attempts++;
    let remaining = regions;
    try {
      const query = new URLSearchParams({ region: regions.join(',') });
      const response = await fetch(`/api/cctv?${query}`, { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error(`Camera catalogue HTTP ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data.cameras)) throw new Error('Invalid camera catalogue');
      if (controller.signal.aborted) return;
      if (data.cameras.length) onBatch(data.cameras);
      remaining = Array.isArray(data.pendingRegions)
        ? data.pendingRegions.filter((region: unknown): region is string => typeof region === 'string' && /^[a-z-]+$/.test(region))
        : data.cameras.length ? [] : regions;
    } catch {
      if (controller.signal.aborted) return;
      onError();
    }
    // Three attempts total, with backoff. No endless retries against dead feeds.
    if (remaining.length && attempts < 3 && !controller.signal.aborted) {
      timer = setTimeout(() => void load(remaining), attempts * 15_000);
    }
  };
  void load(['all']);
  return () => { controller.abort(); clearTimeout(timer); };
}
