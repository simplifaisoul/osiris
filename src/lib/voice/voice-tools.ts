export interface VoiceToolHandlers {
  onFlyTo?: (lat: number, lng: number, zoom?: number) => void;
  onSetViewMode?: (mode: '2d' | 'immersive_3d') => void;
  onToggleLayer?: (key: string, on?: boolean) => void;
  onOpenPanel?: (panel: string) => void;
  onClosePanel?: (panel: string) => void;
  onTrackEntity?: (kind: string, identifier: string) => void;
  onQueryState?: () => any;
  onSwitchBasemap?: (style: 'dark' | 'satellite') => void;
}

export const ALL_LAYER_KEYS = [
  'flights', 'private', 'jets', 'military', 'maritime', 'satellites',
  'balloons', 'cctv', 'live_news', 'news_intel', 'earthquakes', 'fires',
  'weather', 'radiation', 'infrastructure', 'global_incidents', 'war_alerts',
  'gps_jamming', 'day_night',
] as const;

export function createToolSchema() {
  return {
    type: 'function' as const,
    name: 'osiris_control',
    description: 'Control OSIRIS dashboard via voice commands',
    parameters: {
      type: 'object' as const,
      properties: {
        action: {
          type: 'string' as const,
          enum: ['fly_to', 'set_view_mode', 'toggle_layer', 'open_panel', 'close_panel', 'track_entity', 'query_state', 'switch_basemap'],
          description: 'The action to perform',
        },
        args: {
          type: 'object' as const,
          description: 'Arguments for the action',
          properties: {
            lat: { type: 'number' },
            lng: { type: 'number' },
            zoom: { type: 'number' },
            mode: { type: 'string', enum: ['2d', 'immersive_3d'] },
            layer: { type: 'string', enum: ALL_LAYER_KEYS },
            on: { type: 'boolean' },
            panel: { type: 'string' },
            kind: { type: 'string' },
            identifier: { type: 'string' },
            style: { type: 'string', enum: ['dark', 'satellite'] as const },
          },
        },
      },
      required: ['action'],
    },
  };
}

export function dispatchToolCall(
  toolName: string,
  args: any,
  handlers: VoiceToolHandlers
): { success: boolean; result?: any; error?: string } {
  if (toolName !== 'osiris_control') {
    return { success: false, error: `Unknown tool: ${toolName}` };
  }

  const { action, ...actionArgs } = args;

  switch (action) {
    case 'fly_to':
      if (!handlers.onFlyTo) return { success: false, error: 'Handler not available' };
      if (typeof actionArgs.lat !== 'number' || typeof actionArgs.lng !== 'number') {
        return { success: false, error: 'lat and lng are required for fly_to' };
      }
      handlers.onFlyTo(actionArgs.lat, actionArgs.lng, actionArgs.zoom);
      return { success: true };

    case 'set_view_mode':
      if (!handlers.onSetViewMode) return { success: false, error: 'Handler not available' };
      if (!['2d', 'immersive_3d'].includes(actionArgs.mode)) {
        return { success: false, error: 'Invalid mode for set_view_mode' };
      }
      handlers.onSetViewMode(actionArgs.mode);
      return { success: true };

    case 'toggle_layer':
      if (!handlers.onToggleLayer) return { success: false, error: 'Handler not available' };
      if (!ALL_LAYER_KEYS.includes(actionArgs.layer)) {
        return { success: false, error: `Invalid layer: ${actionArgs.layer}` };
      }
      handlers.onToggleLayer(actionArgs.layer, actionArgs.on);
      return { success: true };

    case 'open_panel':
      if (!handlers.onOpenPanel) return { success: false, error: 'Handler not available' };
      if (!actionArgs.panel) return { success: false, error: 'panel name required' };
      handlers.onOpenPanel(actionArgs.panel);
      return { success: true };

    case 'close_panel':
      if (!handlers.onClosePanel) return { success: false, error: 'Handler not available' };
      if (!actionArgs.panel) return { success: false, error: 'panel name required' };
      handlers.onClosePanel(actionArgs.panel);
      return { success: true };

    case 'track_entity':
      if (!handlers.onTrackEntity) return { success: false, error: 'Handler not available' };
      if (!actionArgs.kind || !actionArgs.identifier) {
        return { success: false, error: 'kind and identifier required for track_entity' };
      }
      handlers.onTrackEntity(actionArgs.kind, actionArgs.identifier);
      return { success: true };

    case 'query_state':
      if (!handlers.onQueryState) return { success: false, error: 'Handler not available' };
      const state = handlers.onQueryState();
      return { success: true, result: state };

    case 'switch_basemap':
      if (!handlers.onSwitchBasemap) return { success: false, error: 'Handler not available' };
      if (!['dark', 'satellite'].includes(actionArgs.style)) {
        return { success: false, error: 'Invalid style for switch_basemap' };
      }
      handlers.onSwitchBasemap(actionArgs.style as 'dark' | 'satellite');
      return { success: true };

    default:
      return { success: false, error: `Unknown action: ${action}` };
  }
}
