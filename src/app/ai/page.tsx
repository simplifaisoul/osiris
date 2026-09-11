'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ArrowLeft, Cpu } from 'lucide-react';

const LocalAiStudio = dynamic(() => import('@/components/LocalAiStudio'), { ssr: false });

export default function DedicatedAiPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6 flex flex-col font-sans">
      {/* Top Navigation Bar */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-800 hover:bg-slate-850 rounded-xl text-xs font-mono text-slate-300 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>번개의 눈동자 관제맵 복귀</span>
          </Link>
          <div className="h-4 w-px bg-slate-800" />
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-amber-400 animate-pulse" />
            <span className="font-mono text-xs text-slate-300 font-bold">
              독립형 로컬 AI & 바나나 2.0 비전 전용 스튜디오
            </span>
          </div>
        </div>

        <div className="text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded-full">
          M5 Metal 가속 · EasyOCR · Cloudflare Direct
        </div>
      </div>

      {/* Main Studio Component */}
      <div className="flex-1 w-full max-w-7xl mx-auto h-[calc(100vh-6rem)]">
        <LocalAiStudio />
      </div>
    </main>
  );
}
