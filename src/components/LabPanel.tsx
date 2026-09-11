'use client';

/**
 * ═══════════════════════════════════════════════════════════════
 *  OSIRIS — LAB : strumenti AI serviti dal nodo locale (Delfi)
 *  Image Intel · EXIF/GPS · Face Intel · Media Lab (ritocco e generativo)
 *  Tutte le chiamate passano dalle route /api/ai/* (server-side).
 * ═══════════════════════════════════════════════════════════════
 */

import { useState, useCallback, useRef } from 'react';
import {
  Eye, MapPin, ScanFace, Wand2, Loader2, Upload, AlertTriangle, X, ExternalLink,
} from 'lucide-react';

/**
 * Console unica del nodo: questi strumenti sono una finestra su di essa, non un
 * secondo cruscotto. Il collegamento resta sempre visibile, cosi' da qui si
 * arriva a tutto il resto (voce, volto, agente, risorse) invece di duplicarlo.
 */
const PLANCIA_URL = process.env.NEXT_PUBLIC_DELFI_URL || 'http://localhost:7863';

type ToolId = 'intel' | 'exif' | 'face' | 'media';

const TOOLS: { id: ToolId; label: string; icon: typeof Eye; color: string; blurb: string }[] = [
  { id: 'intel', label: 'IMAGE INTEL', icon: Eye, color: '#00E5FF', blurb: 'Descrive la scena, legge insegne e testo' },
  { id: 'exif', label: 'EXIF / GPS', icon: MapPin, color: '#D4AF37', blurb: 'Camera, timestamp e coordinate' },
  { id: 'face', label: 'FACE INTEL', icon: ScanFace, color: '#FF9F1C', blurb: 'Età, genere, emozione stimate' },
  { id: 'media', label: 'MEDIA LAB', icon: Wand2, color: '#B57BFF', blurb: 'Ritocco e modifica generativa' },
];

interface Props {
  onClose?: () => void;
  isMobile?: boolean;
  /** Porta la mappa sulle coordinate trovate nell'EXIF. */
  onLocate?: (lat: number, lng: number) => void;
}

async function postForm(url: string, form: FormData) {
  const r = await fetch(url, { method: 'POST', body: form });
  const j = await r.json().catch(() => null);
  if (!r.ok || (j && j.error)) throw new Error((j && j.error) || `HTTP ${r.status}`);
  return j as Record<string, any>;
}

/** data:image/...;base64,... -> Blob, per rispedire la maschera al generatore. */
function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(',');
  const mime = /:(.*?);/.exec(head)?.[1] || 'image/png';
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return new Blob([buf], { type: mime });
}

export default function LabPanel({ onClose, isMobile, onLocate }: Props) {
  const [tool, setTool] = useState<ToolId>('intel');
  const [file, setFile] = useState<File | null>(null);
  const [anteprima, setAnteprima] = useState<string | null>(null);
  const [domanda, setDomanda] = useState('');
  const [prompt, setPrompt] = useState('');
  const [area, setArea] = useState('');
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [testo, setTesto] = useState<string | null>(null);
  const [exif, setExif] = useState<Record<string, any> | null>(null);
  const [risultato, setRisultato] = useState<string | null>(null);
  const [nota, setNota] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => { setErrore(null); setTesto(null); setExif(null); setRisultato(null); setNota(null); };

  const scegli = useCallback((f: File | null) => {
    if (!f) return;
    setFile(f);
    setAnteprima(URL.createObjectURL(f));
    reset();
  }, []);

  const esegui = useCallback(async () => {
    if (!file) { setErrore('Scegli prima un\'immagine.'); return; }
    reset();
    setBusy(true);
    try {
      if (tool === 'intel') {
        const fd = new FormData();
        fd.append('file', file);
        if (domanda.trim()) fd.append('domanda', domanda.trim());
        const d = await postForm('/api/ai/vision', fd);
        setTesto(String(d.analisi || ''));
      } else if (tool === 'exif') {
        const fd = new FormData();
        fd.append('file', file);
        setExif(await postForm('/api/ai/exif', fd));
      } else if (tool === 'face') {
        const fd = new FormData();
        fd.append('image', file);           // Delfi vuole "image", non "file"
        const d = await postForm('/api/ai/face', fd);
        setTesto(
          [d.eta != null ? `Età stimata: ${d.eta}` : null,
           d.genere ? `Genere: ${d.genere}` : null,
           d.emozione ? `Emozione: ${d.emozione}` : null,
           d.etnia ? `Etnia stimata: ${d.etnia}` : null].filter(Boolean).join('\n') || JSON.stringify(d),
        );
      } else {
        if (!prompt.trim()) { setErrore('Scrivi cosa vuoi ottenere.'); setBusy(false); return; }
        if (area.trim()) {
          // area descritta => percorso GENERATIVO: prima la maschera, poi l'inpainting
          const fm = new FormData();
          fm.append('file', file); fm.append('testo', area.trim());
          const m = await postForm('/api/ai/mask', fm);
          if (m.vuota) { setErrore('Non ho trovato quell\'area: descrivila diversamente.'); setBusy(false); return; }
          const fg = new FormData();
          fg.append('file', file);
          fg.append('maschera', dataUrlToBlob(String(m.maschera)), 'mask.png');
          fg.append('prompt', prompt.trim());
          fg.append('forza', '0.95');
          const g = await postForm('/api/ai/generate', fg);
          setRisultato(String(g.immagine));
          setNota(`Rigenerata l'area «${area.trim()}» (${m.copertura}%${m.sam ? ', bordi netti con SAM' : ''}).`);
        } else {
          const fe = new FormData();
          fe.append('file', file); fe.append('prompt', prompt.trim());
          const d = await postForm('/api/ai/image-edit', fe);
          setRisultato(String(d.immagine));
          setNota(d.generativo_necessario
            ? `${d.nota} — descrivi l'area qui sopra per usare il generativo.`
            : `${d.nota || ''} Applicate: ${(d.applicate || []).join(', ') || '—'}`);
        }
      }
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'errore sconosciuto');
    }
    setBusy(false);
  }, [file, tool, domanda, prompt, area]);

  const attivo = TOOLS.find(t => t.id === tool)!;

  return (
    <div className={`flex flex-col gap-3 ${isMobile ? '' : 'w-[340px]'} text-white/90`}>
      {/* intestazione */}
      {!isMobile && (
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono tracking-[0.2em] text-[#D4AF37]">LAB — AI LOCALE</span>
          {onClose && (
            <button onClick={onClose} className="text-white/50 hover:text-white" aria-label="Chiudi">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* scelta strumento */}
      <div className="grid grid-cols-2 gap-1.5">
        {TOOLS.map(t => {
          const on = t.id === tool;
          return (
            <button
              key={t.id}
              onClick={() => { setTool(t.id); reset(); }}
              className={`flex items-center gap-2 px-2.5 py-2 rounded border text-[10px] font-mono tracking-wider transition-colors ${
                on ? 'bg-white/10 border-white/30 text-white' : 'bg-black/40 border-white/10 text-white/60 hover:text-white/90'
              }`}
              style={on ? { borderColor: t.color, color: t.color } : undefined}
            >
              <t.icon className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{t.label}</span>
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-white/45 font-mono -mt-1">{attivo.blurb}</p>

      {/* immagine */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); scegli(e.dataTransfer.files?.[0] || null); }}
        className="border border-dashed border-white/20 rounded p-3 text-center cursor-pointer hover:border-white/40 transition-colors"
      >
        {anteprima ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={anteprima} alt="immagine scelta" className="max-h-36 mx-auto rounded" />
        ) : (
          <span className="text-[11px] font-mono text-white/50 flex items-center justify-center gap-2">
            <Upload className="w-3.5 h-3.5" /> trascina o scegli un&apos;immagine
          </span>
        )}
        <input
          ref={inputRef} type="file" accept="image/*" hidden
          onChange={e => scegli(e.target.files?.[0] || null)}
        />
      </div>

      {/* ingressi specifici */}
      {tool === 'intel' && (
        <input
          value={domanda} onChange={e => setDomanda(e.target.value)}
          placeholder="domanda (facoltativa): che cosa cerco?"
          className="bg-black/50 border border-white/15 rounded px-2.5 py-2 text-[11px] font-mono outline-none focus:border-white/40"
        />
      )}
      {tool === 'media' && (
        <>
          <input
            value={prompt} onChange={e => setPrompt(e.target.value)}
            placeholder="cosa ottenere: «più contrasto» o «una giacca rossa»"
            className="bg-black/50 border border-white/15 rounded px-2.5 py-2 text-[11px] font-mono outline-none focus:border-white/40"
          />
          <input
            value={area} onChange={e => setArea(e.target.value)}
            placeholder="area da rigenerare (facoltativa): «la giacca»"
            className="bg-black/50 border border-white/15 rounded px-2.5 py-2 text-[11px] font-mono outline-none focus:border-white/40"
          />
          <p className="text-[9.5px] text-white/40 font-mono -mt-1">
            Con un&apos;area descritta usa il generativo (~30 s). Senza, solo ritocco.
          </p>
        </>
      )}

      <button
        onClick={esegui} disabled={busy}
        className="flex items-center justify-center gap-2 px-3 py-2 rounded border border-white/20 bg-white/5 hover:bg-white/10 disabled:opacity-40 text-[11px] font-mono tracking-wider"
        style={{ color: attivo.color }}
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <attivo.icon className="w-3.5 h-3.5" />}
        {busy ? 'ELABORO…' : 'ESEGUI'}
      </button>

      {errore && (
        <div className="flex items-start gap-2 text-[10.5px] font-mono text-[#FF6B6B] border border-[#FF6B6B]/30 rounded p-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> <span>{errore}</span>
        </div>
      )}

      {testo && (
        <pre className="whitespace-pre-wrap break-words text-[11px] font-mono bg-black/50 border border-white/10 rounded p-2.5 max-h-64 overflow-auto">
          {testo}
        </pre>
      )}

      {exif && (
        <div className="text-[11px] font-mono bg-black/50 border border-white/10 rounded p-2.5 space-y-1.5 max-h-72 overflow-auto">
          <div className="text-white/50">
            {String(exif.base?.formato)} · {String(exif.base?.larghezza)}×{String(exif.base?.altezza)}
          </div>
          {!exif.presente && <div className="text-white/45">Nessun metadato EXIF in questa immagine.</div>}
          {exif.sintesi && Object.entries(exif.sintesi as Record<string, string>).map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <span className="text-white/45 w-28 shrink-0">{k}</span><span className="break-all">{v}</span>
            </div>
          ))}
          {exif.gps && (
            <button
              onClick={() => onLocate?.(Number(exif.gps.lat), Number(exif.gps.lon))}
              className="mt-1 flex items-center gap-2 text-[#D4AF37] hover:underline"
            >
              <MapPin className="w-3.5 h-3.5" />
              {Number(exif.gps.lat).toFixed(5)}, {Number(exif.gps.lon).toFixed(5)} — porta la mappa qui
            </button>
          )}
        </div>
      )}

      {risultato && (
        <div className="space-y-2">
          {nota && <p className="text-[10.5px] font-mono text-white/60">{nota}</p>}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={risultato} alt="risultato" className="w-full rounded border border-white/10" />
          <a
            href={risultato} download="osiris-lab.png"
            className="inline-block text-[10.5px] font-mono text-white/70 hover:text-white underline"
          >
            scarica il risultato
          </a>
        </div>
      )}
      {!risultato && nota && <p className="text-[10.5px] font-mono text-white/60">{nota}</p>}

      {/* la plancia e' la console unica: da qui ci si torna sempre */}
      <a
        href={PLANCIA_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 flex items-center gap-1.5 text-[10px] font-mono text-white/40 hover:text-[#D4AF37] transition-colors"
      >
        <ExternalLink className="w-3 h-3" />
        serviti dal nodo locale — apri la plancia
      </a>
    </div>
  );
}
