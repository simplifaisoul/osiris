'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import TacticalArSimulator from '@/components/TacticalArSimulator';
import { ShieldCheck, Target, Send, ExternalLink, Copy, Radio, Sparkles, Crosshair, Award, ArrowRight } from 'lucide-react';

function TacticalArContent() {
  const searchParams = useSearchParams();
  const role = searchParams.get('role');
  const [currentOrigin, setCurrentOrigin] = useState('');

  useEffect(() => {
    setCurrentOrigin(window.location.origin);
  }, []);

  // If a role is explicitly provided in the query string, load the simulator directly
  if (role === 'instructor') {
    return <TacticalArSimulator forcedRole="instructor" />;
  }
  if (role === 'trainee') {
    return <TacticalArSimulator forcedRole="trainee" />;
  }

  const instructorUrl = `${currentOrigin}/tactical-ar/instructor`;
  const traineeUrl = `${currentOrigin}/tactical-ar/trainee`;

  return (
    <div className="w-full min-h-screen bg-[#030712] text-white flex flex-col justify-between p-4 md:p-8 select-none">
      {/* Top Header */}
      <header className="max-w-5xl mx-auto w-full flex items-center justify-between py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 p-0.5 shadow-[0_0_20px_rgba(6,182,212,0.4)]">
            <div className="w-full h-full bg-[#0a1525] rounded-[10px] flex items-center justify-center">
              <Crosshair className="w-5 h-5 text-cyan-400 animate-pulse" />
            </div>
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-cyan-200 to-blue-400">
              번개의 눈동자 화력유도 VR 시뮬레이션 포털
            </h1>
            <p className="text-xs text-neutral-400 font-mono">
              TACTICAL COMMAND HARNESS & LIVE RECONNAISSANCE SYSTEM
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            CLOUDFLARE LIVE
          </span>
        </div>
      </header>

      {/* Main Dual Cards Selection */}
      <main className="max-w-5xl mx-auto w-full my-auto py-8">
        <div className="text-center space-y-2 mb-8">
          <span className="text-xs uppercase tracking-widest text-[#ffd700] font-bold px-3 py-1 rounded-full bg-[#ffd700]/10 border border-[#ffd700]/20 inline-block">
            전술 역할 분리 및 하네스 일치화 체계
          </span>
          <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
            접속하실 훈련 역할을 선택하십시오
          </h2>
          <p className="text-sm text-neutral-400 max-w-xl mx-auto">
            교관용과 교육생용은 물리적으로 분리되어 있으며, 교관이 모든 전술 상황을 설정한 후 <strong className="text-cyan-300">[일치화]</strong>를 누르면 교육생 화면에 동일하게 전개됩니다.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card 1: 교관 전용 관제 포털 */}
          <div className="relative group rounded-3xl bg-gradient-to-b from-[#0a182e] to-[#040c17] border border-cyan-500/40 p-6 md:p-8 shadow-2xl hover:border-cyan-400 hover:shadow-[0_0_40px_rgba(6,182,212,0.25)] transition-all flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-300 font-extrabold text-xs border border-cyan-500/40 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" /> 통제 및 채점 권한
                </span>
                <span className="text-xs font-mono text-neutral-400">/tactical-ar/instructor</span>
              </div>

              <div>
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <span>🎖️ 교관 전술 통제 센터</span>
                </h3>
                <p className="text-xs text-neutral-300 mt-2 leading-relaxed">
                  표적 배치, 9개소 순차 기동로 지정, 차체 각도(0°~315°) 조절, 기동 속도 제어, 표적지 사진 전환(산악/도심) 및 교육생 화면으로의 <strong>전술 하네스 일치화 전송</strong>을 수행합니다.
                </p>
              </div>

              <ul className="space-y-2 text-xs text-neutral-300 pt-3 border-t border-white/10 font-medium">
                <li className="flex items-center gap-2">
                  <span className="text-cyan-400">✔</span> 표적 원클릭 선정 및 지형 클릭 직접 배치 (Click-to-Place)
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-cyan-400">✔</span> 최대 9개소 전술 기동 지점 & 지점별 각도 설정
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-cyan-400">✔</span> <strong>전술 하네스 일치화 버튼</strong> (교육생 화면 즉시 일치화)
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-cyan-400">✔</span> 5대 평가 항목(식별, 보고, CFF, 안전, BDA) 실시간 채점 및 피드백
                </li>
              </ul>
            </div>

            <div className="pt-6 space-y-3">
              <a
                href="/tactical-ar/instructor"
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg hover:shadow-[0_0_20px_rgba(6,182,212,0.5)] transition active:scale-[0.99]"
              >
                <span>교관 관제실 입장하기</span>
                <ArrowRight className="w-4 h-4" />
              </a>

              <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-black/50 border border-white/10">
                <span className="text-[11px] font-mono text-cyan-200 truncate select-all">
                  {instructorUrl}
                </span>
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(instructorUrl);
                    alert('📋 교관용 홈페이지 링크가 복사되었습니다!');
                  }}
                  className="px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-neutral-200 text-xs font-bold whitespace-nowrap flex items-center gap-1 transition"
                >
                  <Copy className="w-3 h-3" /> 복사
                </button>
              </div>
            </div>
          </div>

          {/* Card 2: 교육생 전용 관측소 */}
          <div className="relative group rounded-3xl bg-gradient-to-b from-[#141b2b] to-[#080d17] border border-emerald-500/40 p-6 md:p-8 shadow-2xl hover:border-emerald-400 hover:shadow-[0_0_40px_rgba(16,185,129,0.25)] transition-all flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-extrabold text-xs border border-emerald-500/40 flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5" /> 순수 실전 관측 & 채점 수신
                </span>
                <span className="text-xs font-mono text-neutral-400">/tactical-ar/trainee</span>
              </div>

              <div>
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <span>👨‍🎓 교육생 실전 관측 훈련장</span>
                </h3>
                <p className="text-xs text-neutral-300 mt-2 leading-relaxed">
                  표적 제어 권한이 일체 차단된 <strong>순수 실전 관측 모드</strong>입니다. 교관이 하네스 일치화 전송한 전술 표적을 3배율 전술 망원 조준경으로 관측하고 5단계 화력유도 절차를 훈련합니다.
                </p>
              </div>

              <ul className="space-y-2 text-xs text-neutral-300 pt-3 border-t border-white/10 font-medium">
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400">✔</span> 🚫 표적 드래그/이동/설정 원천 차단 (조작 권한 격리)
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400">✔</span> 3배율 광학 망원 조준경 & 방위각/거리 레이저 측정
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400">✔</span> JFIRE 규정 5단계 절차 훈련 (식별→보고→사격요구→안전→BDA)
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-400">✔</span> 교관 실시간 평가 점수판(85점) 및 피드백 자동 수신
                </li>
              </ul>
            </div>

            <div className="pt-6 space-y-3">
              <a
                href="/tactical-ar/trainee"
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg hover:shadow-[0_0_20px_rgba(16,185,129,0.5)] transition active:scale-[0.99]"
              >
                <span>교육생 훈련장 입장하기</span>
                <ArrowRight className="w-4 h-4" />
              </a>

              <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-black/50 border border-white/10">
                <span className="font-mono text-[11px] text-emerald-200 truncate select-all">
                  {traineeUrl}
                </span>
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(traineeUrl);
                    alert('📋 교육생용 홈페이지 링크가 복사되었습니다!');
                  }}
                  className="px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-neutral-200 text-xs font-bold whitespace-nowrap flex items-center gap-1 transition"
                >
                  <Copy className="w-3 h-3" /> 복사
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer Status Bar */}
      <footer className="max-w-5xl mx-auto w-full py-4 border-t border-white/10 flex flex-col md:flex-row items-center justify-between text-xs text-neutral-400 gap-2">
        <span>© 번개의 눈동자 Defense Systems · Tactical Command Harness Engine</span>
        <div className="flex items-center gap-4 font-mono text-[11px]">
          <span>SERVER: <strong className="text-emerald-400">LIVE (Port 3000)</strong></span>
          <span>TUNNEL: <strong className="text-cyan-400">trycloudflare.com</strong></span>
        </div>
      </footer>
    </div>
  );
}

export default function TacticalArPage() {
  return (
    <Suspense fallback={<div className="w-full min-h-screen bg-black flex items-center justify-center text-cyan-400 font-mono text-sm">LOADING TACTICAL VR...</div>}>
      <TacticalArContent />
    </Suspense>
  );
}
