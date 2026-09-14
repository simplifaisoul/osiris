import { describe, it, expect, vi } from 'vitest';
import { dispatchToolCall, createToolSchema, ALL_LAYER_KEYS, VoiceToolHandlers } from './voice-tools';

describe('voice-tools', () => {
  describe('createToolSchema', () => {
    it('should create a valid tool schema', () => {
      const schema = createToolSchema();
      expect(schema.type).toBe('function');
      expect(schema.name).toBe('osiris_control');
      expect(schema.parameters).toBeDefined();
      expect(schema.parameters.properties.action.enum).toContain('fly_to');
    });
  });

  describe('dispatchToolCall', () => {
    let handlers: VoiceToolHandlers;

    beforeEach(() => {
      handlers = {
        onFlyTo: vi.fn(),
        onSetViewMode: vi.fn(),
        onToggleLayer: vi.fn(),
        onOpenPanel: vi.fn(),
        onClosePanel: vi.fn(),
        onTrackEntity: vi.fn(),
        onQueryState: vi.fn(() => ({ test: 'state' })),
        onSwitchBasemap: vi.fn(),
      };
    });

    it('should reject unknown tool names', () => {
      const result = dispatchToolCall('unknown_tool', {}, handlers);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown tool');
    });

    it('should handle fly_to action', () => {
      const result = dispatchToolCall('osiris_control', {
        action: 'fly_to',
        args: { lat: 35.6762, lng: 139.6503, zoom: 10 },
      }, handlers);
      
      expect(result.success).toBe(true);
      expect(handlers.onFlyTo).toHaveBeenCalledWith(35.6762, 139.6503, 10);
    });

    it('should validate fly_to requires lat and lng', () => {
      const result = dispatchToolCall('osiris_control', {
        action: 'fly_to',
        args: { lat: 35.6762 },
      }, handlers);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('lat and lng are required');
    });

    it('should handle set_view_mode action', () => {
      const result = dispatchToolCall('osiris_control', {
        action: 'set_view_mode',
        args: { mode: 'immersive_3d' },
      }, handlers);
      
      expect(result.success).toBe(true);
      expect(handlers.onSetViewMode).toHaveBeenCalledWith('immersive_3d');
    });

    it('should validate set_view_mode mode', () => {
      const result = dispatchToolCall('osiris_control', {
        action: 'set_view_mode',
        args: { mode: 'invalid' },
      }, handlers);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid mode');
    });

    it('should handle toggle_layer action', () => {
      const result = dispatchToolCall('osiris_control', {
        action: 'toggle_layer',
        args: { layer: 'flights', on: true },
      }, handlers);
      
      expect(result.success).toBe(true);
      expect(handlers.onToggleLayer).toHaveBeenCalledWith('flights', true);
    });

    it('should validate toggle_layer layer key', () => {
      const result = dispatchToolCall('osiris_control', {
        action: 'toggle_layer',
        args: { layer: 'invalid_layer' },
      }, handlers);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid layer');
    });

    it('should handle open_panel action', () => {
      const result = dispatchToolCall('osiris_control', {
        action: 'open_panel',
        args: { panel: 'layers' },
      }, handlers);
      
      expect(result.success).toBe(true);
      expect(handlers.onOpenPanel).toHaveBeenCalledWith('layers');
    });

    it('should handle close_panel action', () => {
      const result = dispatchToolCall('osiris_control', {
        action: 'close_panel',
        args: { panel: 'layers' },
      }, handlers);
      
      expect(result.success).toBe(true);
      expect(handlers.onClosePanel).toHaveBeenCalledWith('layers');
    });

    it('should handle track_entity action', () => {
      const result = dispatchToolCall('osiris_control', {
        action: 'track_entity',
        args: { kind: 'flight', identifier: 'UAL123' },
      }, handlers);
      
      expect(result.success).toBe(true);
      expect(handlers.onTrackEntity).toHaveBeenCalledWith('flight', 'UAL123');
    });

    it('should handle query_state action', () => {
      const result = dispatchToolCall('osiris_control', {
        action: 'query_state',
        args: {},
      }, handlers);
      
      expect(result.success).toBe(true);
      expect(result.result).toEqual({ test: 'state' });
    });

    it('should handle switch_basemap action', () => {
      const result = dispatchToolCall('osiris_control', {
        action: 'switch_basemap',
        args: { style: 'satellite' },
      }, handlers);
      
      expect(result.success).toBe(true);
      expect(handlers.onSwitchBasemap).toHaveBeenCalledWith('satellite');
    });

    it('should return error when handler not available', () => {
      const emptyHandlers = {};
      const result = dispatchToolCall('osiris_control', {
        action: 'fly_to',
        args: { lat: 35.6762, lng: 139.6503 },
      }, emptyHandlers);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Handler not available');
    });
  });

  describe('ALL_LAYER_KEYS', () => {
    it('should contain expected layer keys', () => {
      expect(ALL_LAYER_KEYS).toContain('flights');
      expect(ALL_LAYER_KEYS).toContain('military');
      expect(ALL_LAYER_KEYS).toContain('satellites');
      expect(ALL_LAYER_KEYS.length).toBeGreaterThan(0);
    });
  });
});
