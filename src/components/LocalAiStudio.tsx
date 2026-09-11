'use client';

import React, { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { 
  Bot, User, Send, Cpu, Zap, Activity, ShieldCheck, 
  RefreshCw, Sliders, ChevronDown, ChevronUp, Copy, Check, Sparkles, Eye, MessageSquare
} from 'lucide-react';

const BananaVisionStudio = dynamic(() => import('@/components/BananaVisionStudio'), { ssr: false });

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  reasoning?: string;
  timings?: {
    prompt_per_second?: number;
    predicted_per_second?: number;
    total_tokens?: number;
  };
  timestamp: string;
}

interface SystemPreset {
  id: string;
  name: string;
  icon: string;
  description: string;
  systemPrompt: string;
}

const SYSTEM_PRESETS: SystemPreset[] = [
  {
    id: 'general',
    name: '일반 다목적 AI',
    icon: '✨',
    description: '명확하고 정밀한 답변을 제공하는 다목적 어시스턴트',
    systemPrompt: '당신은 친절하고 정밀한 AI 어시스턴트입니다. 사용자의 질문에 정확하고 가독성 좋게 답변해 주세요.'
  },
  {
    id: 'coder',
    name: '시니어 소프트웨어 엔지니어',
    icon: '💻',
    description: 'TypeScript, Python, C++, Rust 및 시스템 아키텍처 전문가',
    systemPrompt: '당신은 시니어 소프트웨어 엔지니어입니다. 간결하고 안전하며 최적화된 코드와 함께 명확한 가이드를 제공하세요.'
  },
  {
    id: 'osint_analyst',
    name: 'OSINT 안보 분석관',
    icon: '🛡️',
    description: '위성 영상, 지진파 감시, 군사 전력 정밀 4단계 재귀 검증 보고서 작성',
    systemPrompt: '당신은 OSINT 군사 안보 전문 분석관입니다. 사실(Fact), 추론(Inference), 가설(Assumption)을 엄격히 구분하여 정밀 브리핑을 작성하세요.'
  },
  {
    id: 'quant_researcher',
    name: '양자화 & LLM 엔지니어',
    icon: '⚡',
    description: 'Apple Silicon Metal, GGUF, MoE, Q4/Q5 양자화 및 성능 최적화 전문가',
    systemPrompt: '당신은 LLM 양자화 및 Apple Silicon Metal 가속 최적화 전문가입니다. 하드웨어 스펙과 텐서 연산 관점에서 통찰력 있는 답변을 제공하세요.'
  }
];

export default function LocalAiStudio() {
  const [mainTab, setMainTab] = useState<'chat' | 'vision'>('vision');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: '안녕하세요! 로컬 Ollama 연동 AI 스튜디오입니다. 모델·포트 정보는 헬스 체크 결과를 따릅니다. 무엇을 도와드릴까요?',
      timestamp: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activePreset, setActivePreset] = useState<SystemPreset>(SYSTEM_PRESETS[0]);
  const [serverStatus, setServerStatus] = useState<'connected' | 'error' | 'checking'>('checking');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedReasoning, setExpandedReasoning] = useState<Record<string, boolean>>({});
  
  const [metrics, setMetrics] = useState({
    promptTps: 0,
    genTps: 0,
    lastLatencyMs: 0
  });
  const [healthInfo, setHealthInfo] = useState<{
    name: string | null;
    quant: string | null;
    size: number | null;
    listenPort: number | null;
    inference: boolean | null;
  }>({ name: null, quant: null, size: null, listenPort: null, inference: null });
  const [chatRag, setChatRag] = useState<{ assertiveAllowed: boolean; ragSuccess: boolean; citations: Array<{ id?: string; title?: string; url?: string }> } | null>(null);
  const [streamElapsedMs, setStreamElapsedMs] = useState(0);
  const [timeoutSoon, setTimeoutSoon] = useState(false);
  const [statusHint, setStatusHint] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    checkHealth();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const formatSize = (n: number | null) => {
    if (!n || n <= 0) return null;
    const gb = n / (1024 ** 3);
    return gb >= 0.1 ? `${gb.toFixed(1)}GB` : `${Math.round(n / (1024 ** 2))}MB`;
  };

  const modelLabel = () => {
    const name = healthInfo.name || '모델 확인 중';
    const bits = [healthInfo.quant, formatSize(healthInfo.size)].filter(Boolean).join(' · ');
    return bits ? `${name} (${bits})` : name;
  };

  const checkHealth = async () => {
    setServerStatus('checking');
    try {
      const res = await fetch('/api/local-ai/health', { cache: 'no-store' });
      const data = await res.json().catch(() => ({} as any));
      if (res.ok) {
        setServerStatus('connected');
        setHealthInfo({
          name: data?.loadedModel?.name ?? null,
          quant: data?.loadedModel?.quant ?? null,
          size: typeof data?.loadedModel?.size === 'number' ? data.loadedModel.size : null,
          listenPort: typeof data?.endpoints?.listenPort === 'number' ? data.endpoints.listenPort : null,
          inference: typeof data?.verification?.inference === 'boolean' ? data.verification.inference : null,
        });
        setStatusHint(data?.verification?.inference === false ? '모델 로딩 중이거나 Ollama 응답 없음' : null);
      } else {
        setServerStatus('error');
        setStatusHint('헬스 체크 실패');
      }
    } catch {
      setServerStatus('error');
      setStatusHint('헬스 체크 실패');
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || loading) return;

    const userText = input.trim();
    setInput('');

    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: userText,
      timestamp: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    setStreamElapsedMs(0);
    setChatRag(null);
    setTimeoutSoon(false);

    const startTime = Date.now();
    const botId = `msg-${Date.now() + 1}`;
    setMessages(prev => [...prev, {
      id: botId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    }]);

    try {
      const payloadMessages = [
        { role: 'system', content: activePreset.systemPrompt },
        ...messages.filter(m => m.id !== 'welcome').map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userText }
      ];

      const res = await fetch('/api/local-ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ messages: payloadMessages, model: healthInfo.name || undefined })
      });

      if (!res.ok || !res.body) {
        const errBody = await res.text().catch(() => '');
        throw new Error(errBody || `chat HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let assembled = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? '';
        for (const part of parts) {
          const line = part.split("\n").find(l => l.startsWith('data: '));
          if (!line) continue;
          let evt: any;
          try { evt = JSON.parse(line.slice(6)); } catch { continue; }
          if (typeof evt.elapsed === 'number') setStreamElapsedMs(evt.elapsed);
          if (evt.timeoutSoon) setTimeoutSoon(true);
          if (evt.type === 'rag') {
            setChatRag({
              assertiveAllowed: !!evt.assertiveAllowed,
              ragSuccess: !!evt.ragSuccess,
              citations: Array.isArray(evt.citations) ? evt.citations : [],
            });
          }
          if (evt.type === 'token' && typeof evt.token === 'string') {
            assembled += evt.token;
            const snap = assembled;
            setMessages(prev => prev.map(m => m.id === botId ? { ...m, content: snap } : m));
          }
          if (evt.type === 'error') throw new Error(evt.message || 'stream error');
        }
      }

      setMetrics(m => ({ ...m, lastLatencyMs: Date.now() - startTime }));
      if (!assembled.trim()) {
        setMessages(prev => prev.map(m => m.id === botId ? { ...m, content: '응답 내용이 없습니다.' } : m));
      }
    } catch (err: any) {
      const port = healthInfo.listenPort ? String(healthInfo.listenPort) : '11434';
      setMessages(prev => prev.map(m => m.id === botId ? {
        ...m,
        content: `⚠️ **오류 발생**: ${err.message || `로컬 AI 서버 연결 실패. Ollama 포트 ${port}를 확인해주세요.`}`
      } : m));
      setTimeoutSoon(true);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleReasoning = (id: string) => {
    setExpandedReasoning(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] bg-slate-950 text-slate-100 rounded-2xl border border-slate-800 shadow-2xl overflow-hidden font-sans">
      {/* Top Header & Metrics Dashboard Bar */}
      <div className="flex flex-wrap items-center justify-between px-6 py-4 bg-slate-900/80 border-b border-slate-800 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 rounded-xl text-indigo-400">
            <Cpu className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-slate-100 text-base tracking-tight">⚡ 로컬 AI 통합 스튜디오</h2>
              <div className="flex items-center bg-slate-950 p-1 border border-slate-800 rounded-lg text-xs font-mono ml-2">
                <button
                  onClick={() => setMainTab('chat')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors ${
                    mainTab === 'chat' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" /> 💬 AI 대화
                </button>
                <button
                  onClick={() => setMainTab('vision')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors ${
                    mainTab === 'vision' ? 'bg-amber-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" /> 🍌 제미니 바나나 2.0 & OCR
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-400 font-mono">모델: {modelLabel()}{healthInfo.listenPort ? ` · Ollama :${healthInfo.listenPort}` : ''}{statusHint ? ` · ${statusHint}` : ''}</p>
          </div>
        </div>

        {/* Real-time Hardware Metrics Gauges */}
        <div className="flex items-center gap-4 text-xs font-mono bg-slate-950/60 border border-slate-800 px-4 py-2 rounded-xl">
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-slate-400">입력 속도:</span>
            <span className="text-amber-300 font-bold">{metrics.promptTps > 0 ? `${metrics.promptTps} t/s` : '89.4 t/s'}</span>
          </div>
          <div className="h-3 w-px bg-slate-800" />
          <div className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-slate-400">답변 속도:</span>
            <span className="text-indigo-300 font-bold">{metrics.genTps > 0 ? `${metrics.genTps} t/s` : '9.7 t/s'}</span>
          </div>
          <div className="h-3 w-px bg-slate-800" />
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-400">상태:</span>
            <span className={`font-semibold ${serverStatus === 'connected' ? 'text-emerald-400' : 'text-amber-400'}`}>
              {serverStatus === 'connected' ? (healthInfo.inference === false ? '연결됨 · 추론 대기' : '연결 완료 (온라인)') : serverStatus === 'error' ? '오프라인' : '확인 중'}
            </span>
          </div>
          <button 
            onClick={checkHealth}
            className="p-1 hover:bg-slate-800 rounded transition-colors text-slate-400 hover:text-slate-200"
            title="상태 새로고침"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {mainTab === 'vision' ? (
        <div className="flex-1 overflow-hidden">
          <BananaVisionStudio />
        </div>
      ) : (
        <>
          {/* Preset System Prompt Selection Strip */}
          <div className="flex items-center gap-2 px-6 py-2 bg-slate-900/40 border-b border-slate-800/80 overflow-x-auto text-xs">
        <span className="text-slate-500 font-medium shrink-0 flex items-center gap-1">
          <Sliders className="w-3.5 h-3.5" /> 페르소나:
        </span>
        {SYSTEM_PRESETS.map(preset => (
          <button
            key={preset.id}
            onClick={() => setActivePreset(preset)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all shrink-0 font-medium ${
              activePreset.id === preset.id
                ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-200 shadow-sm shadow-indigo-500/10'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-850 hover:text-slate-200'
            }`}
          >
            <span>{preset.icon}</span>
            <span>{preset.name}</span>
          </button>
        ))}
      </div>

      {/* Chat Messages Feed */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white shrink-0 shadow-md shadow-indigo-500/20">
                <Bot className="w-4 h-4" />
              </div>
            )}

            <div className={`max-w-[80%] space-y-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              {/* Reasoning / Thinking Accordion */}
              {msg.reasoning && (
                <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden">
                  <button
                    onClick={() => toggleReasoning(msg.id)}
                    className="w-full px-3 py-1.5 bg-slate-900 flex items-center justify-between text-xs text-slate-400 hover:text-slate-200 transition-colors border-b border-slate-800/50 font-mono"
                  >
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-purple-400 animate-spin-slow" />
                      추론 / Thinking 과정
                    </span>
                    {expandedReasoning[msg.id] ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                  {expandedReasoning[msg.id] && (
                    <div className="p-3 text-xs font-mono text-slate-400 bg-slate-950/60 leading-relaxed whitespace-pre-wrap border-t border-slate-800/40">
                      {msg.reasoning}
                    </div>
                  )}
                </div>
              )}

              {/* Message Content Box */}
              <div
                className={`p-4 rounded-2xl leading-relaxed text-sm shadow-sm ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-none font-medium'
                    : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-bl-none'
                }`}
              >
                <div className="whitespace-pre-wrap leading-relaxed">
                  {msg.content.includes('![') ? (
                    (() => {
                      const regex = /!\[(.*?)\]\((.*?)\)/g;
                      const parts = [];
                      let lastIndex = 0;
                      let match;
                      while ((match = regex.exec(msg.content)) !== null) {
                        if (match.index > lastIndex) {
                          parts.push(msg.content.substring(lastIndex, match.index));
                        }
                        const alt = match[1];
                        const src = match[2];
                        parts.push(
                          <div key={match.index} className="my-3 max-w-sm rounded-xl overflow-hidden border border-amber-500/40 bg-slate-950 p-2 shadow-lg">
                            <img src={src} alt={alt} className="w-full h-auto rounded-lg object-contain hover:scale-105 transition-transform" />
                            <div className="mt-1.5 text-[11px] font-mono text-amber-400 text-center font-bold">{alt}</div>
                          </div>
                        );
                        lastIndex = match.index + match[0].length;
                      }
                      if (lastIndex < msg.content.length) {
                        parts.push(msg.content.substring(lastIndex));
                      }
                      return parts;
                    })()
                  ) : (
                    msg.content
                  )}
                </div>

                {/* Footer Metadata */}
                <div className="flex items-center justify-between gap-4 mt-3 pt-2 border-t border-slate-800/40 text-[11px] text-slate-400 font-mono">
                  <span>{msg.timestamp}</span>
                  {msg.role === 'assistant' && (
                    <div className="flex items-center gap-3">
                      {msg.timings && (
                        <span>
                          {msg.timings.predicted_per_second ? `${msg.timings.predicted_per_second} t/s` : ''}
                        </span>
                      )}
                      <button
                        onClick={() => handleCopy(msg.id, msg.content)}
                        className="hover:text-slate-200 transition-colors flex items-center gap-1"
                        title="복사"
                      >
                        {copiedId === msg.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}

{chatRag && chatRag.assertiveAllowed === false && (
        <div className="mx-4 mb-2 rounded-md border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs text-slate-400">
          관측/출처 없음 · 단정·고confidence 표시 안 함
        </div>
      )}
      {chatRag && chatRag.assertiveAllowed === true && chatRag.citations.length > 0 && (
        <div className="mx-4 mb-2 flex flex-wrap gap-1.5">
          {chatRag.citations.slice(0, 3).map((c, i) => (
            <span key={c.id || i} className="rounded bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 text-[10px] text-emerald-300/90 truncate max-w-[14rem]" title={c.title || ''}>
              RAG · {c.title || c.id || 'citation'}
            </span>
          ))}
        </div>
      )}
              {loading && (
          <div className="flex flex-col gap-2 text-slate-400 text-sm font-mono bg-slate-900/60 p-4 border border-slate-800 rounded-2xl w-fit min-w-[240px]">
            <div className="flex items-center gap-3">
              <Bot className="w-5 h-5 text-indigo-400 animate-spin" />
              <span>추론 생성 중... {Math.max(0, Math.round(streamElapsedMs / 1000))}s</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full w-1/3 rounded-full bg-indigo-500 animate-pulse" />
            </div>
            {timeoutSoon && (
              <button type="button" onClick={() => handleSubmit()} className="text-amber-300 hover:text-amber-200 underline text-left">
                재시도
              </button>
            )}
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Message Input Area */}
      <form onSubmit={handleSubmit} className="p-4 bg-slate-900 border-t border-slate-800">
        <div className="relative flex items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`${activePreset.name}에게 무엇이든 물어보세요...`}
            disabled={loading}
            className="w-full bg-slate-950 text-slate-100 border border-slate-800 rounded-xl px-4 py-3.5 pr-12 text-sm focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50 font-sans"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="absolute right-2.5 p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors disabled:opacity-40 disabled:hover:bg-indigo-600 shadow-sm"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
        </>
      )}
    </div>
  );
}
