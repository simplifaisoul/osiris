export type SessionState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error';

export interface SessionConfig {
  ephemeralKey: string;
  model: string;
  onStateChange: (state: SessionState) => void;
  onTranscript: (text: string) => void;
  onToolCall: (toolName: string, args: any) => void;
  onError: (error: Error) => void;
}

export class RealtimeSession {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private audioStream: MediaStream | null = null;
  private config: SessionConfig;
  private state: SessionState = 'idle';

  constructor(config: SessionConfig) {
    this.config = config;
  }

  getState(): SessionState {
    return this.state;
  }

  private setState(newState: SessionState) {
    this.state = newState;
    this.config.onStateChange(newState);
  }

  async connect(): Promise<void> {
    if (this.state !== 'idle') {
      throw new Error('Session already active');
    }

    this.setState('connecting');

    try {
      // Get microphone access
      this.audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Create peer connection
      this.peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });

      // Add audio tracks
      this.audioStream.getTracks().forEach(track => {
        this.peerConnection?.addTrack(track, this.audioStream!);
      });

      // Create data channel for events
      this.dataChannel = this.peerConnection.createDataChannel('events');
      this.dataChannel.onmessage = this.handleDataChannelMessage.bind(this);

      // Create offer
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      // Wait for ICE gathering to complete
      await new Promise<void>((resolve) => {
        if (this.peerConnection?.iceGatheringState === 'complete') {
          resolve();
          return;
        }
        this.peerConnection?.addEventListener('icegatheringstatechange', () => {
          if (this.peerConnection?.iceGatheringState === 'complete') {
            resolve();
          }
        });
      });

      // Send SDP to OpenAI (simplified - in production, you'd use the ephemeral token endpoint)
      // For now, we'll simulate the connection
      this.setState('listening');
    } catch (error) {
      this.setState('error');
      this.config.onError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  private handleDataChannelMessage(event: MessageEvent) {
    try {
      const data = JSON.parse(event.data);
      
      if (data.type === 'conversation.item.input_audio_transcription.completed') {
        this.config.onTranscript(data.transcript || '');
      } else if (data.type === 'response.done') {
        // Handle response completion
        this.setState('listening');
      } else if (data.type === 'response.audio_transcript.done') {
        // Handle audio transcript
        this.config.onTranscript(data.transcript || '');
      } else if (data.type === 'conversation.item.function_call') {
        // Handle tool call
        this.config.onToolCall(data.name, data.arguments);
      }
    } catch (error) {
      console.error('Failed to parse data channel message:', error);
    }
  }

  async disconnect(): Promise<void> {
    this.audioStream?.getTracks().forEach(track => track.stop());
    this.dataChannel?.close();
    this.peerConnection?.close();
    
    this.audioStream = null;
    this.dataChannel = null;
    this.peerConnection = null;
    
    this.setState('idle');
  }

  sendAudio(audioData: ArrayBuffer): void {
    if (this.dataChannel?.readyState === 'open') {
      this.dataChannel.send(audioData);
    }
  }
}
