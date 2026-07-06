import type { Registry } from './registry';
import { ndbcBuoys } from './adapters/ndbcBuoys';
import { noaaTsunami } from './adapters/noaaTsunami';
import { ransomwareTracker } from './adapters/ransomwareTracker';
import { shodanExposed } from './adapters/shodanExposed';
import { wigleNetworks } from './adapters/wigleNetworks';

const ALL_ADAPTERS = [
  ndbcBuoys,
  noaaTsunami,
  ransomwareTracker,
  shodanExposed,
  wigleNetworks,
];

export function registerAllSources(registry: Registry): void {
  for (const adapter of ALL_ADAPTERS) {
    registry.registerSource(adapter as Parameters<typeof registry.registerSource>[0]);
  }
}
