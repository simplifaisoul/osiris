'use client';
/**
 * OSIRIS OI Assist: talking to OI.
 *
 * Dictation through the browser's own speech recognition (Chrome, Edge and
 * Safari have it; Firefox does not, and the mic button does not show there),
 * and replies read aloud through its speech synthesis. Neither touches OSIRIS:
 * recognition is the browser vendor's service, which is why the privacy page
 * names it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

interface RecognitionResult { isFinal: boolean; 0: { transcript: string } }
interface RecognitionEvent { resultIndex: number; results: ArrayLike<RecognitionResult> }
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Speech to text: what is being heard as it is heard, and the final words once the speaker stops. */
export function useDictation(onFinal: (text: string) => void) {
  const [supported] = useState(() => recognitionCtor() !== null);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const [error, setError] = useState('');
  const rec = useRef<Recognition | null>(null);
  const finalRef = useRef('');
  const onFinalRef = useRef(onFinal);
  useEffect(() => { onFinalRef.current = onFinal; });
  useEffect(() => () => rec.current?.abort(), []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor || rec.current) return;
    const r = new Ctor();
    r.lang = navigator.language || 'en-US';
    r.interimResults = true;
    r.continuous = false;
    finalRef.current = '';
    setHeard('');
    setError('');
    r.onresult = e => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalRef.current += res[0].transcript;
        else interim += res[0].transcript;
      }
      setHeard((finalRef.current + interim).trim());
    };
    r.onerror = e => setError(e.error === 'not-allowed' ? 'Microphone permission was refused.' : e.error === 'no-speech' ? 'Nothing heard.' : 'Dictation stopped.');
    r.onend = () => {
      rec.current = null;
      setListening(false);
      const text = finalRef.current.trim();
      setHeard('');
      if (text) onFinalRef.current(text);
    };
    rec.current = r;
    setListening(true);
    r.start();
  }, []);

  const stop = useCallback(() => { rec.current?.stop(); }, []);

  return { supported, listening, heard, error, start, stop };
}

/** Reads a reply aloud, bullets and all, cutting off whatever was being read before. */
export function speak(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/^- /gm, '').replace(/\s+/g, ' ').trim());
  u.rate = 1.03;
  window.speechSynthesis.speak(u);
}

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}
