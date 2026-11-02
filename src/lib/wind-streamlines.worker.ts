import type { WindGrid } from './wind-layer';
import { createWindBaker, type WindBakeRequest } from './wind-streamlines';

/**
 * OSIRIS — the Wind layer's streamlines, made off the main thread. A full set
 * takes the best part of a tenth of a second, and while the time slider plays
 * they are remade several times a second; here that never holds up the map.
 */

type Request = WindBakeRequest & { id: number; field: WindGrid };

// The DOM typings describe a window; this file runs in a worker.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

const bake = createWindBaker();

scope.onmessage = ({ data: { id, field, ...request } }) => {
  const { vertices, count, paths, seeds } = bake(field, request);
  scope.postMessage({ id, vertices, count, paths, seeds }, [vertices.buffer, seeds.buffer]);
};
