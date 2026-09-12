'use client';

import { Check, X, Undo2, MousePointerClick } from 'lucide-react';
import type { DrawMode, DrawProgress } from '@/lib/draw';
import { formatArea, formatDistance } from '@/lib/geo';

/**
 * ⚡ 번개의 눈동자 (LIGHTNING EYE) — 지도 상 작전 드로잉 계측 HUD
 *
 * 작전관이 마우스로 클릭하는 즉시 지도 위에 실시간 거리/면적/반경을 표출하며
 * 이전 취소(Undo) / 구역 폐합 완료(Finish) / 취소(Cancel)를 지원합니다.
 */

interface DrawHudProps {
  mode: DrawMode;
  progress: DrawProgress | null;
  onUndo: () => void;
  onFinish: () => void;
  onCancel: () => void;
}

const TITLE: Record<DrawMode, string> = {
  polygon: '다각형 작전구역',
  rectangle: '직사각형 관심구역',
  circle: '사거리·반경 구역',
  line: '기동·비행 경로',
};

/** What to do next, given how far along the shape is. */
function step(mode: DrawMode, vertices: number): string {
  if (vertices === 0) {
    return {
      polygon: '작전 구역의 첫 번째 꼭짓점을 클릭하십시오',
      rectangle: '직사각형의 첫 번째 모서리를 클릭하십시오',
      circle: '중심점을 클릭하십시오',
      line: '기동 경로의 시작점을 클릭하십시오',
    }[mode];
  }
  switch (mode) {
    case 'rectangle': return '대각선 반대편 모서리를 클릭하여 완성하십시오';
    case 'circle': return '외부 지점을 클릭하여 반경을 설정하십시오';
    case 'polygon':
      return vertices < 3
        ? `다음 꼭짓점을 클릭하십시오 — ${3 - vertices}개 추가 필요`
        : '꼭짓점을 추가하거나 구역 완료를 클릭하십시오';
    case 'line':
      return vertices < 2 ? '다음 경유지를 클릭하십시오' : '경유지를 추가하거나 경로 완료를 클릭하십시오';
  }
}

export default function DrawHud({ mode, progress, onUndo, onFinish, onCancel }: DrawHudProps) {
  const vertices = progress?.vertices ?? 0;
  const canFinish = progress?.closable ?? false;
  const selfCompleting = mode === 'rectangle' || mode === 'circle';

  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-[500] flex justify-center px-3">
      <div className="pointer-events-auto flex flex-col gap-2 rounded-xl border border-[var(--border-cyan)] bg-[var(--bg-panel)]/95 px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.45),0_0_8px_var(--cyan-glow)] backdrop-blur-2xl">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--cyan-primary)]" />
            <span className="text-[11px] font-mono font-bold tracking-[0.2em] text-[var(--cyan-primary)]">
              {TITLE[mode]}
            </span>
          </span>

          <span className="flex items-center gap-1.5 text-[12px] text-[var(--text-primary)]">
            <MousePointerClick className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            {step(mode, vertices)}
          </span>

          {/* Running measurement */}
          {progress && (progress.areaKm2 > 0 || progress.lengthKm > 0) && (
            <span className="ml-1 flex items-center gap-2 border-l border-[var(--border-secondary)] pl-3 text-[12px] font-mono tabular-nums text-white">
              {progress.radiusKm != null && progress.radiusKm > 0 && (
                <span>반경 {formatDistance(progress.radiusKm)}</span>
              )}
              {progress.areaKm2 > 0 && <span>{formatArea(progress.areaKm2)}</span>}
              {progress.areaKm2 === 0 && progress.lengthKm > 0 && (
                <span>{formatDistance(progress.lengthKm)}</span>
              )}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onUndo}
            disabled={vertices === 0}
            className="flex items-center gap-1.5 rounded-md border border-[var(--border-secondary)] px-2.5 py-1.5 text-[11px] font-mono text-[var(--text-secondary)] transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30"
          >
            <Undo2 className="h-3 w-3" /> 이전 점 취소
          </button>

          {!selfCompleting && (
            <button
              onClick={onFinish}
              disabled={!canFinish}
              className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[11px] font-mono transition-colors ${
                canFinish
                  ? 'border-[var(--alert-green)]/50 bg-[var(--alert-green)]/15 text-[var(--alert-green)] hover:bg-[var(--alert-green)]/25'
                  : 'border-[var(--border-secondary)] text-[var(--text-muted)] opacity-40'
              }`}
            >
              <Check className="h-3 w-3" />
              {mode === 'line' ? '경로 완료' : '구역 완료'}
            </button>
          )}

          <button
            onClick={onCancel}
            className="flex items-center gap-1.5 rounded-md border border-[var(--border-secondary)] px-2.5 py-1.5 text-[11px] font-mono text-[var(--text-secondary)] transition-colors hover:border-[var(--alert-red)]/40 hover:text-[var(--alert-red)]"
          >
            <X className="h-3 w-3" /> 취소
          </button>

          <span className="ml-auto pl-2 text-[10px] font-mono text-[var(--text-muted)]">
            {vertices}개 지점 연결
            {!selfCompleting && ' · 또는 지도 더블클릭 시 완료'}
          </span>
        </div>
      </div>
    </div>
  );
}
