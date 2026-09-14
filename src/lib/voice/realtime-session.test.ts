import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RealtimeSession, SessionState } from './realtime-session';

describe('RealtimeSession', () => {
  let mockConfig: any;
  let session: RealtimeSession;

  beforeEach(() => {
    mockConfig = {
      ephemeralKey: 'test-key',
      model: 'gpt-4o-realtime-preview',
      onStateChange: vi.fn(),
      onTranscript: vi.fn(),
      onToolCall: vi.fn(),
      onError: vi.fn(),
    };
    session = new RealtimeSession(mockConfig);
  });

  it('should initialize in idle state', () => {
    expect(session.getState()).toBe('idle');
  });

  it('should call onStateChange when state changes', () => {
    session['setState']('connecting');
    expect(mockConfig.onStateChange).toHaveBeenCalledWith('connecting');
  });

  it('should throw error when connecting if not idle', async () => {
    session['setState']('listening');
    await expect(session.connect()).rejects.toThrow('Session already active');
  });

  it('should call onError when connection fails', async () => {
    // Mock getUserMedia to fail
    vi.spyOn(navigator.mediaDevices, 'getUserMedia').mockRejectedValue(
      new Error('Microphone access denied')
    );

    await expect(session.connect()).rejects.toThrow();
    expect(mockConfig.onError).toHaveBeenCalled();
  });

  it('should clean up resources on disconnect', async () => {
    const mockTrack = { stop: vi.fn() };
    const mockStream = {
      getTracks: vi.fn(() => [mockTrack]),
    } as any;

    vi.spyOn(navigator.mediaDevices, 'getUserMedia').mockResolvedValue(mockStream);

    // Mock RTCPeerConnection
    const mockClose = vi.fn();
    global.RTCPeerConnection = vi.fn(() => ({
      createOffer: vi.fn().mockResolvedValue({ type: 'offer', sdp: 'test' }),
      setLocalDescription: vi.fn().mockResolvedValue(undefined),
      addTrack: vi.fn(),
      createDataChannel: vi.fn(() => ({
        close: mockClose,
        readyState: 'open',
      })),
      close: mockClose,
      iceGatheringState: 'complete',
    })) as any;

    await session.connect();
    await session.disconnect();

    expect(mockTrack.stop).toHaveBeenCalled();
    expect(mockClose).toHaveBeenCalled();
    expect(session.getState()).toBe('idle');
  });
});
