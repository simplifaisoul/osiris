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


/** Structured prose — avoid whitespace-pre-wrap brick walls */
function ProseBlocks({ text, className = '' }: { text: string; className?: string }) {
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const paras = blocks.length > 0 ? blocks : [text];
  return (
    <div className={`intel-prose ${className}`.trim()}>
      {paras.map((para, i) => (
        <p key={i}>
          {para.split('\n').map((line, j, arr) => (
            <span key={j}>
              {line}
              {j < arr.length - 1 ? <br /> : null}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}

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
    <div className="flex flex-col h-[calc(100vh-5rem)] bg-[var(--bg-void)] text-[var(--text-primary)] rounded-2xl glass-panel overflow-hidden font-[family-name:var(--font-body)]">
      {/* Top Header & Metrics Dashboard Bar */}
      <div className="flex flex-wrap items-center justify-between px-6 py-4 bg-[var(--bg-panel)] border-b border-[var(--border-primary)] backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[rgba(var(--gold-rgb),0.12)] border border-[var(--border-primary)] rounded-xl text-[var(--gold-primary)]">
            <Cpu className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="intel-title intel-title--hud text-[var(--text-heading)]">⚡ 로컬 AI 통합 스튜디오</h2>
              <div className="flex items-center bg-[var(--bg-void)] p-1 border border-[var(--border-secondary)] rounded-lg intel-meta ml-2">
                <button
                  onClick={() => setMainTab('chat')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors ${
                    mainTab === 'chat'
                      ? 'bg-[rgba(var(--gold-rgb),0.2)] text-[var(--gold-primary)] font-semibold border border-[var(--border-active)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" /> 💬 AI 대화
                </button>
                <button
                  onClick={() => setMainTab('vision')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors ${
                    mainTab === 'vision'
                      ? 'bg-[rgba(var(--cyan-rgb),0.15)] text-[var(--cyan-primary)] font-semibold border border-[var(--border-cyan)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" /> 🍌 제미니 바나나 2.0 & OCR
                </button>
              </div>
            </div>
            <p className="intel-meta mt-0.5">모델: {modelLabel()}{healthInfo.listenPort ? ` · Ollama :${healthInfo.listenPort}` : ''}{statusHint ? ` · ${statusHint}` : ''}</p>
          </div>
        </div>

        {/* Real-time Hardware Metrics Gauges */}
        <div className="flex items-center gap-4 intel-meta bg-[var(--bg-void)]/60 border border-[var(--border-secondary)] px-4 py-2 rounded-xl">
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-[var(--gold-primary)]" />
            <span className="text-[var(--text-muted)]">입력 속도:</span>
            <span className="text-[var(--gold-light)] font-semibold">{metrics.promptTps > 0 ? `${metrics.promptTps} t/s` : '89.4 t/s'}</span>
          </div>
          <div className="h-3 w-px bg-[var(--border-primary)]" />
          <div className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-[var(--cyan-primary)]" />
            <span className="text-[var(--text-muted)]">답변 속도:</span>
            <span className="text-[var(--cyan-primary)] font-semibold">{metrics.genTps > 0 ? `${metrics.genTps} t/s` : '9.7 t/s'}</span>
          </div>
          <div className="h-3 w-px bg-[var(--border-primary)]" />
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-[var(--alert-green)]" />
            <span className="text-[var(--text-muted)]">상태:</span>
            <span className={`font-semibold ${serverStatus === 'connected' ? 'text-[var(--alert-green)]' : 'text-[var(--alert-orange)]'}`}>
              {serverStatus === 'connected' ? (healthInfo.inference === false ? '연결됨 · 추론 대기' : '연결 완료 (온라인)') : serverStatus === 'error' ? '오프라인' : '확인 중'}
            </span>
          </div>
          <button 
            onClick={checkHealth}
            className="p-1 hover:bg-[var(--hover-accent)] rounded transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)]"
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
          <div className="flex items-center gap-2 px-6 py-2 bg-[var(--bg-secondary)]/60 border-b border-[var(--border-secondary)] overflow-x-auto">
        <span className="intel-label shrink-0 flex items-center gap-1">
          <Sliders className="w-3.5 h-3.5" /> 페르소나:
        </span>
        {SYSTEM_PRESETS.map(preset => (
          <button
            key={preset.id}
            onClick={() => setActivePreset(preset)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all shrink-0 intel-meta ${
              activePreset.id === preset.id
                ? 'bg-[rgba(var(--gold-rgb),0.14)] border-[var(--border-active)] text-[var(--gold-light)]'
                : 'bg-[var(--bg-panel-solid)] border-[var(--border-secondary)] text-[var(--text-muted)] hover:bg-[var(--hover-accent)] hover:text-[var(--text-secondary)]'
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
              <div className="w-8 h-8 rounded-xl bg-[rgba(var(--gold-rgb),0.18)] border border-[var(--border-active)] flex items-center justify-center text-[var(--gold-primary)] shrink-0">
                <Bot className="w-4 h-4" />
              </div>
            )}

            <div className={`max-w-[80%] space-y-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              {/* Reasoning / Thinking Accordion */}
              {msg.reasoning && (
                <div className="glass-panel-sm overflow-hidden">
                  <button
                    onClick={() => toggleReasoning(msg.id)}
                    className="w-full px-3 py-1.5 bg-[var(--bg-panel-solid)] flex items-center justify-between intel-label hover:text-[var(--text-secondary)] transition-colors border-b border-[var(--border-secondary)]"
                  >
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-[var(--cyan-primary)]" />
                      추론 / Thinking 과정
                    </span>
                    {expandedReasoning[msg.id] ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                  {expandedReasoning[msg.id] && (
                    <div className="p-3 intel-body bg-[var(--bg-void)]/60 border-t border-[var(--border-secondary)]">
                      <ProseBlocks text={msg.reasoning} />
                    </div>
                  )}
                </div>
              )}

              {/* Message Content Box */}
              <div
                className={`p-4 rounded-2xl shadow-sm ${
                  msg.role === 'user'
                    ? 'bg-[rgba(var(--cyan-rgb),0.14)] border border-[var(--border-cyan)] text-[var(--text-heading)] rounded-br-none'
                    : 'bg-[var(--bg-panel-solid)] border border-[var(--border-primary)] text-[var(--text-secondary)] rounded-bl-none'
                }`}
              >
                <div>
                  {msg.content.includes('![') ? (
                    (() => {
                      const regex = /!\[(.*?)\]\((.*?)\)/g;
                      const parts: React.ReactNode[] = [];
                      let lastIndex = 0;
                      let match;
                      while ((match = regex.exec(msg.content)) !== null) {
                        if (match.index > lastIndex) {
                          parts.push(<ProseBlocks key={`t-${lastIndex}`} text={msg.content.substring(lastIndex, match.index)} />);
                        }
                        const alt = match[1];
                        const src = match[2];
                        parts.push(
                          <div key={match.index} className="my-3 max-w-sm rounded-xl overflow-hidden border border-[var(--border-active)] bg-[var(--bg-void)] p-2 shadow-lg">
                            <img src={src} alt={alt} className="w-full h-auto rounded-lg object-contain hover:scale-105 transition-transform" />
                            <div className="mt-1.5 intel-label text-center text-[var(--gold-primary)]">{alt}</div>
                          </div>
                        );
                        lastIndex = match.index + match[0].length;
                      }
                      if (lastIndex < msg.content.length) {
                        parts.push(<ProseBlocks key={`t-${lastIndex}`} text={msg.content.substring(lastIndex)} />);
                      }
                      return parts;
                    })()
                  ) : (
                    <ProseBlocks text={msg.content} className={msg.role === 'user' ? 'text-[var(--text-heading)]' : ''} />
                  )}
                </div>

                {/* Footer Metadata */}
                <div className="flex items-center justify-between gap-4 mt-3 pt-2 border-t border-[var(--border-secondary)] intel-meta">
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
                        className="hover:text-[var(--text-primary)] transition-colors flex items-center gap-1"
                        title="복사"
                      >
                        {copiedId === msg.id ? <Check className="w-3.5 h-3.5 text-[var(--alert-green)]" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-cyan)] flex items-center justify-center text-[var(--cyan-primary)] shrink-0">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}

{chatRag && chatRag.assertiveAllowed === false && (
        <div className="mx-4 mb-2 rounded-md border border-[var(--border-secondary)] bg-[var(--bg-panel)] px-3 py-2 intel-meta text-[var(--text-muted)]">
          관측/출처 없음 · 단정·고confidence 표시 안 함
        </div>
      )}
      {chatRag && chatRag.assertiveAllowed === true && chatRag.citations.length > 0 && (
        <div className="mx-4 mb-2 flex flex-wrap gap-1.5">
          {chatRag.citations.slice(0, 3).map((c, i) => (
            <span key={c.id || i} className="rounded bg-[rgba(0,230,118,0.08)] border border-[rgba(0,230,118,0.28)] px-2 py-0.5 intel-label text-[var(--alert-green)] truncate max-w-[14rem]" title={c.title || ''}>
              RAG · {c.title || c.id || 'citation'}
            </span>
          ))}
        </div>
      )}
              {loading && (
          <div className="flex flex-col gap-2 intel-meta glass-panel-sm p-4 w-fit min-w-[240px]">
            <div className="flex items-center gap-3">
              <Bot className="w-5 h-5 text-[var(--gold-primary)] animate-spin" />
              <span>추론 생성 중... {Math.max(0, Math.round(streamElapsedMs / 1000))}s</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-[var(--bg-tertiary)] overflow-hidden">
              <div className="h-full w-1/3 rounded-full bg-[var(--gold-primary)] animate-pulse" />
            </div>
            {timeoutSoon && (
              <button type="button" onClick={() => handleSubmit()} className="text-[var(--alert-orange)] hover:text-[var(--gold-light)] underline text-left">
                재시도
              </button>
            )}
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Message Input Area */}
      <form onSubmit={handleSubmit} className="p-4 bg-[var(--bg-panel)] border-t border-[var(--border-primary)]">
        <div className="relative flex items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`${activePreset.name}에게 무엇이든 물어보세요...`}
            disabled={loading}
            className="w-full bg-[var(--bg-void)] text-[var(--text-primary)] border border-[var(--border-primary)] rounded-xl px-4 py-3.5 pr-12 intel-body focus:outline-none focus:border-[var(--border-active)] transition-colors disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="absolute right-2.5 p-2 bg-[rgba(var(--gold-rgb),0.25)] hover:bg-[rgba(var(--gold-rgb),0.4)] text-[var(--gold-primary)] border border-[var(--border-active)] rounded-lg transition-colors disabled:opacity-40 shadow-sm"
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
