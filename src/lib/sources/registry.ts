import type { SourceAdapter, SourceCategory } from './types';

export interface Registry {
  registerSource(adapter: SourceAdapter<unknown>): void;
  getSource(id: string): SourceAdapter<unknown> | undefined;
  listByCategory(category: SourceCategory): SourceAdapter<unknown>[];
  listAll(): SourceAdapter<unknown>[];
}

export function createRegistry(): Registry {
  const sources = new Map<string, SourceAdapter<unknown>>();

  return {
    registerSource(adapter: SourceAdapter<unknown>): void {
      sources.set(adapter.meta.id, adapter);
    },
    getSource(id: string): SourceAdapter<unknown> | undefined {
      return sources.get(id);
    },
    listByCategory(category: SourceCategory): SourceAdapter<unknown>[] {
      return Array.from(sources.values()).filter((a) => a.meta.category === category);
    },
    listAll(): SourceAdapter<unknown>[] {
      return Array.from(sources.values());
    },
  };
}
