import type { GeolocationProvider } from './types';
import { geminiProvider } from './gemini';
import { geoinferProvider } from './geoinfer';
import { anthropicProvider } from './anthropic';

const providers: GeolocationProvider[] = [
  geminiProvider,
  geoinferProvider,
  anthropicProvider,
];

export function getProvider(id: string): GeolocationProvider | undefined {
  return providers.find(p => p.id === id);
}

export function getAvailableProviders(): GeolocationProvider[] {
  return providers.filter(p => p.isConfigured());
}

export function getAllProviders(): GeolocationProvider[] {
  return providers;
}
