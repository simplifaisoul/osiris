'use client';

import React, { useState, useEffect } from 'react';
import { Eye, Image as ImageIcon, Sparkles, CheckCircle2, Zap, RefreshCw, Film, Play, Video, Send, Wand2, Compass, Layers } from 'lucide-react';

interface OcrRegion {
  text: string;
  confidence: number;
  bbox: number[][];
}

const PRESET_PROMPTS = [
  '⚡ 사이버펑크 네온 시티와 홀로그램',
  '🚀 우주 성운과 블랙홀 시네마틱 4K',
  '🌊 심해 아쿠아틱 블루 웨이브',
  '🍓 신선한 딸기 슬로우모션 펄스',
  '🍌 황금 바나나 2.0 시네마틱 렌더링',
  '🤖 인공지능 양자 코어 회전 무빙'
];

export default function BananaVisionStudio() {
  const [data, setData] = useState<{
    imageUrl: string | null;
    videoUrl: string | null;
    ocrEngine: string;
    vlmModel: string;
    ocrResults: OcrRegion[];
  } | null>(null);

  const [currentVideoUrl, setCurrentVideoUrl] = useState<string>('/banana_generated.mp4');
  const [loading, setLoading] = useState(true);
  const [renderingVideo, setRenderingVideo] = useState(false);
  const [mediaMode, setMediaMode] = useState<'video' | 'image'>('video');

  // Creation State
  const [prompt, setPrompt] = useState('사이버펑크 네온 시티와 홀로그램 바나나');
  const [motion, setMotion] = useState<'zoom' | 'orbit' | 'pan'>('zoom');
  const [history, setHistory] = useState<{ prompt: string; url: string; motion: string }[]>([
    { prompt: '황금 바나나 2.0 기본 시네마틱', url: '/banana_generated.mp4', motion: 'zoom' },
    { prompt: '우주 성운과 블랙홀 탐사', url: '/custom_video.mp4', motion: 'orbit' }
  ]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/vision/banana');
      if (res.ok) {
        const json = await res.json();
        setData(json);
        if (json.videoUrl && !currentVideoUrl) {
          setCurrentVideoUrl(json.videoUrl);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNewVideo = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt.trim() || renderingVideo) return;

    setRenderingVideo(true);
    try {
      const res = await fetch('/api/vision/banana', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), motion })
      });

      if (res.ok) {
        const json = await res.json();
        if (json.videoUrl) {
          setCurrentVideoUrl(json.videoUrl);
          setHistory(prev => [{ prompt: json.prompt, url: json.videoUrl, motion: json.motion }, ...prev]);
          setMediaMode('video');
        }
      }
    } catch (err) {
      console.error('Video creation failed:', err);
    } finally {
      setRenderingVideo(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 rounded-2xl border border-slate-800 overflow-hidden font-sans p-5 space-y-4">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/40 rounded-xl text-amber-400">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              제미니 나노 바나나 2.0 & AI 영상 제작 스튜디오
            </h2>
            <p className="text-xs text-slate-400 font-mono">
              M5 Metal 가속 물리 연산 · 24fps MP4 시네마틱 렌더링 엔진
            </p>
          </div>
        </div>

        {/* Mode Switcher */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-900 border border-slate-800 p-1 rounded-xl text-xs font-mono">
            <button
              onClick={() => setMediaMode('video')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${
                mediaMode === 'video' ? 'bg-amber-500 text-black font-bold shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Film className="w-3.5 h-3.5" /> 🎬 동영상 제작/재생
            </button>
            <button
              onClick={() => setMediaMode('image')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${
                mediaMode === 'image' ? 'bg-indigo-600 text-white font-bold shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" /> 🖼️ 정지 이미지 & OCR
            </button>
          </div>

          <button
            onClick={fetchData}
            className="p-2 bg-slate-900 border border-slate-800 hover:bg-slate-850 rounded-xl text-slate-400 hover:text-slate-200 transition-colors"
            title="새로고침"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Interactive Creation Toolbar (영상 프롬프트 입력창) */}
      <form onSubmit={handleCreateNewVideo} className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-xl">
        <div className="flex flex-col md:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
              <Wand2 className="w-4 h-4 text-amber-400" />
            </div>
            <input
              type="text"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="만들고 싶은 영상의 주제나 프롬프트를 자유롭게 입력하세요 (예: 우주 성운 탐사, 사이버펑크 도시...)"
              className="w-full pl-10 pr-4 py-2.5 bg-slate-950/90 border border-slate-800 rounded-xl text-xs md:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400 transition-all font-sans"
            />
          </div>

          {/* Camera Motion Selector */}
          <div className="flex items-center gap-1.5 bg-slate-950 p-1 border border-slate-800 rounded-xl shrink-0 text-xs font-mono">
            <span className="text-[11px] text-slate-500 px-2 flex items-center gap-1">
              <Compass className="w-3 h-3 text-amber-400" /> 모션:
            </span>
            {(['zoom', 'orbit', 'pan'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setMotion(m)}
                className={`px-2.5 py-1.5 rounded-lg uppercase transition-colors ${
                  motion === m ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {m === 'zoom' ? '줌인' : m === 'orbit' ? '회전' : '패닝'}
              </button>
            ))}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={renderingVideo || !prompt.trim()}
            className="w-full md:w-auto px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 disabled:opacity-50 text-slate-950 font-bold text-xs md:text-sm rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all shrink-0 font-mono"
          >
            {renderingVideo ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-black" />
                <span>M5 렌더링 중...</span>
              </>
            ) : (
              <>
                <Video className="w-4 h-4" />
                <span>새 영상 생성</span>
              </>
            )}
          </button>
        </div>

        {/* Preset Prompt Suggestions */}
        <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-slate-800/60 text-[11px] font-mono">
          <span className="text-slate-500 mr-1">추천 테마:</span>
          {PRESET_PROMPTS.map((p, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setPrompt(p)}
              className="px-2.5 py-1 bg-slate-950 border border-slate-800 hover:border-amber-400/60 rounded-lg text-slate-400 hover:text-amber-300 transition-colors"
            >
              {p}
            </button>
          ))}
        </div>
      </form>

      {/* Main Studio Display Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 overflow-hidden">
        {/* Left: Media Player (Video or Image) */}
        <div className="lg:col-span-7 flex flex-col bg-slate-900/60 border border-slate-800 rounded-2xl p-4 overflow-hidden relative">
          <div className="flex items-center justify-between mb-2 text-xs font-mono text-slate-400">
            <span className="flex items-center gap-1.5 font-bold text-amber-400">
              {mediaMode === 'video' ? <Film className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
              {mediaMode === 'video' ? 'M5 로컬 렌더링 실시간 MP4 비디오' : '정지 바나나 2.0 이미지'}
            </span>
            <span className="bg-emerald-500/10 text-emerald-400 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
              {mediaMode === 'video' ? '24fps H.264 하드웨어 인코딩' : 'M5 Metal 가속'}
            </span>
          </div>

          <div className="flex-1 flex items-center justify-center bg-slate-950 rounded-xl border border-slate-800/80 overflow-hidden relative group p-2">
            {mediaMode === 'video' ? (
              currentVideoUrl ? (
                <video
                  key={currentVideoUrl}
                  src={currentVideoUrl}
                  controls
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-contain rounded-lg shadow-2xl"
                />
              ) : (
                <div className="text-center p-8 text-slate-500 text-xs font-mono">
                  동영상을 생성해주세요.
                </div>
              )
            ) : (
              data?.imageUrl ? (
                <img
                  src={data.imageUrl}
                  alt="Gemini Nano Banana 2.0"
                  className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <div className="text-center p-8 text-slate-500 text-xs font-mono">
                  이미지 로딩 중...
                </div>
              )
            )}
          </div>

          {/* Video Metadata Tag Bar */}
          {mediaMode === 'video' && (
            <div className="mt-2.5 flex items-center justify-between text-[11px] font-mono text-slate-400 bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800">
              <span className="truncate max-w-[200px] text-amber-300 font-bold">▶ {prompt}</span>
              <span>72 Frames (24fps · 3.0s)</span>
              <span>800×608 시네마틱</span>
            </div>
          )}
        </div>

        {/* Right: Video History & OCR Analysis Panel */}
        <div className="lg:col-span-5 flex flex-col bg-slate-900/60 border border-slate-800 rounded-2xl p-4 overflow-hidden space-y-3">
          {/* Section: Video History */}
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex items-center justify-between mb-2 border-b border-slate-800 pb-2">
              <span className="text-xs font-mono font-bold text-amber-400 flex items-center gap-1.5">
                <Film className="w-4 h-4" /> 생성된 영상 보관함 ({history.length})
              </span>
              <span className="text-[10px] font-mono text-slate-500">클릭 시 즉시 재생</span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {history.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    setCurrentVideoUrl(item.url);
                    setPrompt(item.prompt);
                    setMediaMode('video');
                  }}
                  className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                    currentVideoUrl === item.url
                      ? 'bg-amber-500/10 border-amber-500/50 text-amber-200'
                      : 'bg-slate-950/80 border-slate-800/80 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <div className="w-6 h-6 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0 text-amber-400">
                      <Play className="w-3 h-3 fill-current" />
                    </div>
                    <span className="text-xs font-medium truncate">{item.prompt}</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 px-2 py-0.5 bg-slate-900 rounded shrink-0">
                    {item.motion.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Section: OCR Engine Specs */}
          <div className="pt-2 border-t border-slate-800 text-[11px] font-mono text-slate-400 space-y-1">
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>EasyOCR & 24fps 영상 파이프라인 가속 가동</span>
            </div>
            <div className="text-slate-500">
              엔진: PyTorch MPS + ImageIO FFMPEG + LTX-Video Pipeline
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
