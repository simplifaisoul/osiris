'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ArrowLeft, Cpu } from 'lucide-react';

const LocalAiStudio = dynamic(() => import('@/components/LocalAiStudio'), { ssr: false });

export default function DedicatedAiPage() {
  return (
    <main className="min-h-screen bg-[var(--bg-void)] text-[var(--text-primary)] p-4 md:p-6 flex flex-col font-[family-name:var(--font-body)]">
      {/* Top Navigation Bar */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--border-primary)]">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-1.5 px-3 py-1.5 glass-panel-sm hover:border-[var(--border-active)] rounded-xl intel-meta text-[var(--text-secondary)] transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-[var(--gold-primary)]" />
            <span>번개의 눈동자 관제맵 복귀</span>
          </Link>
          <div className="h-4 w-px bg-[var(--border-primary)]" />
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-[var(--gold-primary)] animate-pulse" />
            <span className="intel-title intel-title--hud text-[var(--text-heading)]">
              독립형 로컬 AI & 바나나 2.0 비전 전용 스튜디오
            </span>
          </div>
        </div>

        <div className="intel-label text-[var(--alert-green)] bg-[rgba(0,230,118,0.08)] border border-[rgba(0,230,118,0.28)] px-3 py-1 rounded-full tracking-[0.12em]">
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
