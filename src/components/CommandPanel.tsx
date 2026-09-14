'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageSquare, Mic, Send, X } from 'lucide-react';
import { COMMAND_HELP, parseMapCommand, type MapCommand } from '@/lib/map-commands';

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};
interface Place { name: string; context: string; lat: number; lng: number; kind: string }

export default function CommandPanel({ onCommand, onLocate }: {
  onCommand: (command: MapCommand) => string;
  onLocate: (lat: number, lng: number, zoom: number, cameras: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const speech = useRef<Recognition | null>(null);
  const pending = useRef<AbortController | null>(null);
  const [value, setValue] = useState('');
  const [messages, setMessages] = useState([{ role: 'OSIRIS', text: COMMAND_HELP }]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [cameraSearch, setCameraSearch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const say = (text: string) => setMessages(old => [...old.slice(-19), { role: 'OSIRIS', text }]);

  const open = useCallback(() => {
    const w = window as SpeechWindow;
    setVoiceAvailable(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
    if (!dialog.current?.open) dialog.current?.showModal();
    input.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !event.repeat) {
        event.preventDefault();
        open();
      }
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      pending.current?.abort();
      if (speech.current) {
        speech.current.onresult = speech.current.onerror = speech.current.onend = null;
        speech.current.abort();
      }
    };
  }, [open]);

  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); }, [messages]);

  const stop = () => {
    pending.current?.abort();
    pending.current = null;
    if (speech.current) {
      speech.current.onresult = speech.current.onerror = speech.current.onend = null;
      speech.current.abort();
      speech.current = null;
    }
    setBusy(false);
    setListening(false);
    setPlaces([]);
  };

  const submit = async () => {
    const text = value.trim();
    if (!text) return;
    stop();
    setValue('');
    setMessages(old => [...old.slice(-19), { role: 'YOU', text }]);
    const command = parseMapCommand(text);
    if (!command) { say(`I didn’t recognize that command. ${COMMAND_HELP}`); return; }
    if (command.type === 'help') { say(COMMAND_HELP); return; }
    if (command.type !== 'locate') {
      say(onCommand(command));
      if (command.type === 'panel') dialog.current?.close();
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setCameraSearch(command.cameras);
    try {
      const response = await fetch(`/api/geosearch?q=${encodeURIComponent(command.query)}`, { signal: controller.signal });
      if (!response.ok) throw new Error('Search unavailable');
      const data = await response.json();
      if (controller.signal.aborted) return;
      const results: Place[] = (Array.isArray(data.results) ? data.results : []).filter((p: Place) =>
        typeof p?.lat === 'number' && typeof p?.lng === 'number' && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180,
      );
      setPlaces(results.slice(0, 5));
      say(results.length ? 'Choose a destination below.' : 'No matching places found. Try a city and country.');
    } catch {
      if (!controller.signal.aborted) say('Location search is unavailable. Try again or use “go to latitude, longitude”.');
    } finally {
      if (pending.current === controller) { pending.current = null; setBusy(false); }
    }
  };

  const listen = () => {
    if (speech.current) { stop(); return; }
    const w = window as SpeechWindow;
    const Constructor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Constructor) return;
    const recognition = new Constructor();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = event => {
      setValue(event.results[0]?.[0]?.transcript || '');
      input.current?.focus();
    };
    recognition.onerror = event => say(event.error === 'not-allowed'
      ? 'Microphone access was denied. You can still type commands.'
      : 'Voice input failed. Try again or type a command.');
    recognition.onend = () => { speech.current = null; setListening(false); };
    speech.current = recognition;
    try { recognition.start(); setListening(true); }
    catch { speech.current = null; setListening(false); say('Voice input could not start. Type a command instead.'); }
  };

  return <>
    <button onClick={open}
      className="fixed top-24 right-3 z-[300] glass-panel-sm px-3 py-2 flex items-center gap-2 text-xs text-[var(--gold-primary)]"
      aria-label="Open navigation commands" title="Navigation commands (Ctrl/Cmd+K)">
      <MessageSquare size={16} /> Commands
    </button>
    <dialog ref={dialog} onClose={stop} onCancel={stop} aria-labelledby="commands-title"
      className="fixed inset-0 m-auto w-[calc(100%-24px)] max-w-lg max-h-[80dvh] rounded-lg border border-[var(--border-primary)] bg-[var(--bg-void)] text-[var(--text-primary)] p-4 backdrop:bg-black/60">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 id="commands-title" className="font-mono text-sm text-[var(--gold-primary)]">NAVIGATION COMMANDS</h2>
        <button aria-label="Close commands" onClick={() => dialog.current?.close()}><X size={18} /></button>
      </div>
      <div ref={log} role="log" aria-live="polite" className="max-h-[30dvh] overflow-y-auto space-y-3 text-sm mb-3">
        {messages.map((message, index) => <p key={index}><span className="text-[var(--gold-primary)] text-xs">{message.role}: </span>{message.text}</p>)}
      </div>
      {places.length > 0 && <div className="max-h-[20dvh] overflow-y-auto mb-3 space-y-1" aria-label="Destinations">
        {places.map((place, index) => <button key={index} className="block w-full text-left border border-[var(--border-primary)] rounded p-2 text-sm hover:bg-white/10"
          onClick={() => {
            onLocate(place.lat, place.lng, place.kind === 'country' ? 5 : place.kind === 'region' ? 7 : 12, cameraSearch);
            say(`Flying to ${place.name}${cameraSearch ? ' with cameras enabled' : ''}.`);
            setPlaces([]);
          }}>{place.name}<span className="block text-xs text-[var(--text-muted)]">{place.context}</span></button>)}
      </div>}
      <form className="flex gap-2" onSubmit={event => { event.preventDefault(); void submit(); }}>
        <input ref={input} value={value} onChange={event => setValue(event.target.value)} maxLength={300}
          aria-label="Navigation command" placeholder="Fly to London…" autoComplete="off"
          className="min-w-0 flex-1 bg-transparent rounded border border-[var(--border-primary)] p-2 text-sm" />
        {voiceAvailable && <button type="button" onClick={listen} aria-label={listening ? 'Stop listening' : 'Dictate command'} aria-pressed={listening}
          className={`p-2 rounded ${listening ? 'bg-red-700 text-white' : 'hover:bg-white/10'}`}><Mic size={18} /></button>}
        <button type="submit" aria-label="Run command" disabled={!value.trim()} className="p-2 disabled:opacity-40"><Send size={18} /></button>
      </form>
      <p role="status" className="text-xs text-[var(--text-muted)] mt-2">{busy ? 'Searching…' : listening ? 'Listening…' : 'Enter to run · Esc to close · Ctrl/Cmd+K to open'}</p>
      <p className="text-xs text-[var(--text-muted)] mt-2">{voiceAvailable
        ? 'Voice fills the box for review. Your browser may send audio to its speech service.'
        : 'Voice input is unavailable in this browser. All commands work by typing.'}</p>
    </dialog>
  </>;
}
