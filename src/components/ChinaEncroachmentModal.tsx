'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Shield, AlertTriangle, Crosshair, Globe, FileText, ChevronRight, ExternalLink } from 'lucide-react';
import { CHINA_ENCROACHMENT_SITES, ChinaEncroachmentSite } from '@/lib/china-encroachment';

interface ChinaEncroachmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSiteId?: string | null;
}

export default function ChinaEncroachmentModal({
  isOpen,
  onClose,
  initialSiteId,
}: ChinaEncroachmentModalProps) {
  const [selectedSiteId, setSelectedSiteId] = useState<string>(
    initialSiteId || CHINA_ENCROACHMENT_SITES[0].id
  );
  const [activeDialecticTab, setActiveDialecticTab] = useState<'thesis' | 'antithesis' | 'synthesis' | 'audit'>('antithesis');
  const [selectedPhotoView, setSelectedPhotoView] = useState<'sat' | 'recon'>('sat');

  if (!isOpen) return null;

  const currentSite = CHINA_ENCROACHMENT_SITES.find(s => s.id === selectedSiteId) || CHINA_ENCROACHMENT_SITES[0];

  const getThreatBadge = (level: string) => {
    switch (level) {
      case 'CRITICAL':
        return <span className="px-2 py-0.5 bg-red-950/80 border border-red-500/80 text-red-300 rounded text-xs font-mono font-bold animate-pulse">CRITICAL THREAT (최고 위협)</span>;
      case 'HIGH':
        return <span className="px-2 py-0.5 bg-amber-950/80 border border-amber-500/80 text-amber-300 rounded text-xs font-mono font-bold">HIGH THREAT (고위협)</span>;
      default:
        return <span className="px-2 py-0.5 bg-yellow-950/80 border border-yellow-500/80 text-yellow-300 rounded text-xs font-mono font-bold">MODERATE (경계 구역)</span>;
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[1000] flex items-center justify-center p-2 md:p-6 bg-black/85 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-6xl max-h-[92vh] flex flex-col bg-[#080d18] border-2 border-amber-500/50 rounded-2xl shadow-[0_0_40px_rgba(245,158,11,0.25)] overflow-hidden text-slate-100"
        >
          {/* ── HEADER ── */}
          <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-amber-950/50 via-slate-900 to-black border-b border-amber-500/30">
            <div className="flex items-center gap-3">
              <span className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/40 text-amber-400">
                <Globe className="w-6 h-6" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg md:text-xl font-bold font-mono text-amber-300 tracking-wide">
                    중국 서해·남중국해 인공구조물 및 요새화 인공섬 OSINT 정밀 분석
                  </h2>
                  <span className="px-2 py-0.5 bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 text-[10px] font-mono rounded">
                    천재들의 질문법 (Dialectic OSINT) 적용
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  미 국방부(DoD) · 일본 방위성(MOD) · 이스라엘 INSS · CSIS AMTI · 대한민국 국립해양조사원 공식 보고서 교차 검증
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* ── BODY (2-Column: Left site list, Right detail) ── */}
          <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
            {/* LEFT: Site Selection Drawer */}
            <div className="w-full md:w-80 border-r border-slate-800 bg-slate-950/60 p-3 overflow-y-auto space-y-2">
              <div className="px-2 py-1 text-[11px] font-mono text-amber-400/80 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Crosshair className="w-3.5 h-3.5" />
                <span>관제 대상 인공 구조물 (8개 거점)</span>
              </div>

              {CHINA_ENCROACHMENT_SITES.map(site => {
                const isSelected = site.id === selectedSiteId;
                const isYellowSea = site.region === 'YELLOW_SEA';
                return (
                  <button
                    key={site.id}
                    onClick={() => {
                      setSelectedSiteId(site.id);
                      setActiveDialecticTab('antithesis');
                    }}
                    className={`w-full text-left p-2.5 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500/15 border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
                        : 'bg-slate-900/40 border-slate-800/80 hover:bg-slate-800/50 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                        isYellowSea ? 'bg-cyan-950 text-cyan-300 border border-cyan-600/40' : 'bg-orange-950 text-orange-300 border border-orange-600/40'
                      }`}>
                        {isYellowSea ? '서해 한중 잠정조치수역' : '동남아 남중국해'}
                      </span>
                      <span className="text-[10px] font-mono text-red-400 font-bold">
                        {site.threat_level}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-slate-100 truncate">
                      {site.name}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">
                      {site.chinese_name} · {site.facility_type_label}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* RIGHT: Detail Dossier */}
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-4 md:p-6 space-y-5 bg-gradient-to-b from-slate-950/40 to-slate-900/40">
              {/* Site Title Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-bold font-mono text-white">
                      {currentSite.name}
                    </h3>
                    <span className="text-sm font-mono text-slate-400">
                      ({currentSite.chinese_name})
                    </span>
                  </div>
                  <div className="text-xs font-mono text-amber-400/90 mt-1 flex items-center gap-2">
                    <span>좌표: {currentSite.lat.toFixed(4)}°N, {currentSite.lng.toFixed(4)}°E</span>
                    <span>·</span>
                    <span>{currentSite.region_label}</span>
                  </div>
                </div>
                <div>
                  {getThreatBadge(currentSite.threat_level)}
                </div>
              </div>

              {/* Photos & Visual Proof Section (Satellite vs Recon) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Photo Viewer (7 cols) */}
                <div className="lg:col-span-7 flex flex-col space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedPhotoView('sat')}
                        className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                          selectedPhotoView === 'sat'
                            ? 'bg-amber-500 text-black shadow-[0_0_10px_rgba(245,158,11,0.5)]'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        🛰️ 고해상도 위성 판독 실사 (Satellite Ortho)
                      </button>
                      <button
                        onClick={() => setSelectedPhotoView('recon')}
                        className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                          selectedPhotoView === 'recon'
                            ? 'bg-cyan-500 text-black shadow-[0_0_10px_rgba(6,182,212,0.5)]'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        🛩️ 항공 정찰 실사 뷰 (Airborne Recon)
                      </button>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">
                      실제 수집 고해상도 사진
                    </span>
                  </div>

                  <div className="relative aspect-video rounded-xl overflow-hidden border border-slate-700 bg-black shadow-inner group">
                    <img
                      src={selectedPhotoView === 'sat' ? currentSite.satellite_image : currentSite.recon_image}
                      alt={currentSite.name}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute top-2 left-2 px-2 py-1 bg-black/75 backdrop-blur-sm rounded border border-white/20 text-[10px] font-mono text-emerald-400">
                      [CLASSIFIED/OSINT VERIFIED] {selectedPhotoView === 'sat' ? '광학 위성 실사' : '초계기 정찰 실사'}
                    </div>
                  </div>
                </div>

                {/* Technical Specifications (5 cols) */}
                <div className="lg:col-span-5 bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-3">
                  <div className="text-xs font-mono font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-slate-800">
                    <Shield className="w-4 h-4 text-amber-400" />
                    <span>시설물 정밀 제원 및 무장 스펙</span>
                  </div>

                  <div className="space-y-2 text-xs font-mono">
                    <div>
                      <span className="text-slate-400">시설물 유형:</span>
                      <span className="text-slate-200 ml-1.5 font-bold">{currentSite.facility_type_label}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">외형 규격:</span>
                      <span className="text-slate-200 ml-1.5">{currentSite.specifications.dimensions}</span>
                    </div>
                    {currentSite.runway_length_m && (
                      <div>
                        <span className="text-slate-400">활주로 길이:</span>
                        <span className="text-cyan-400 ml-1.5 font-bold">{currentSite.runway_length_m.toLocaleString()}m (군용 대형기 대응)</span>
                      </div>
                    )}
                    <div>
                      <span className="text-slate-400">주둔 규모:</span>
                      <span className="text-slate-200 ml-1.5">{currentSite.specifications.personnel_or_capacity}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">감시·레이더:</span>
                      <span className="text-amber-300 ml-1.5">{currentSite.specifications.radar_systems}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">무장·미사일:</span>
                      <span className="text-red-400 ml-1.5">{currentSite.specifications.weapon_systems}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">건조·배치 연도:</span>
                      <span className="text-slate-300 ml-1.5">{currentSite.specifications.construction_year}</span>
                    </div>
                  </div>

                  {/* Sources Tag */}
                  <div className="pt-2 border-t border-slate-800/80 text-[10px] font-mono text-slate-400">
                    <span className="text-slate-500 font-bold">검증 출처:</span> {currentSite.sources.map(s => s.org).join(' · ')}
                  </div>
                </div>
              </div>

              {/* ── 천재들의 질문법 (Dialectic OSINT 4-Stage Analysis) ── */}
              <div className="bg-slate-900/80 border-2 border-amber-500/40 rounded-xl p-4 md:p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono font-bold text-amber-300">
                      ⚡ 천재들의 질문법: 4단계 변증법적 OSINT 정밀 검증
                    </span>
                  </div>

                  {/* 4 Tabs */}
                  <div className="flex items-center gap-1.5 bg-black/60 p-1 rounded-lg border border-slate-800">
                    <button
                      onClick={() => setActiveDialecticTab('thesis')}
                      className={`px-2.5 py-1 rounded text-xs font-mono transition-all cursor-pointer ${
                        activeDialecticTab === 'thesis'
                          ? 'bg-slate-700 text-white font-bold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      [1. 명제] 중국 공식 주장
                    </button>
                    <button
                      onClick={() => setActiveDialecticTab('antithesis')}
                      className={`px-2.5 py-1 rounded text-xs font-mono transition-all cursor-pointer ${
                        activeDialecticTab === 'antithesis'
                          ? 'bg-amber-600 text-black font-bold shadow-[0_0_8px_rgba(245,158,11,0.5)]'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      [2. 반명제] 국가기관·위성 판독
                    </button>
                    <button
                      onClick={() => setActiveDialecticTab('synthesis')}
                      className={`px-2.5 py-1 rounded text-xs font-mono transition-all cursor-pointer ${
                        activeDialecticTab === 'synthesis'
                          ? 'bg-slate-600 text-slate-100 font-bold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      [3. 종합] INFERENCE
                    </button>
                    <button
                      onClick={() => setActiveDialecticTab('audit')}
                      className={`px-2.5 py-1 rounded text-xs font-mono transition-all cursor-pointer ${
                        activeDialecticTab === 'audit'
                          ? 'bg-purple-600 text-white font-bold shadow-[0_0_8px_rgba(168,85,247,0.5)]'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      [4. 재귀적 감사] 국제법(UNCLOS) 위반 대조
                    </button>
                  </div>
                </div>

                {/* Tab Content Box */}
                <div className="p-4 rounded-xl bg-black/50 border border-slate-800/80 font-mono text-sm leading-relaxed text-slate-200 min-h-[90px] flex items-center">
                  {activeDialecticTab === 'thesis' && (
                    <div>
                      <div className="text-xs font-bold text-slate-400 mb-1 flex items-center gap-2 flex-wrap">
                        <span className="px-1.5 py-0.5 rounded border border-slate-600 text-[10px] text-slate-300">THESIS</span>
                        [1단계: 명제 — 중국 공식 주장]
                      </div>
                      <p className="text-slate-300">{currentSite.analysis_dialectic.thesis_china}</p>
                    </div>
                  )}
                  {activeDialecticTab === 'antithesis' && (
                    <div>
                      <div className="text-xs font-bold text-amber-400 mb-1 flex items-center gap-2 flex-wrap">
                        <span className="px-1.5 py-0.5 rounded border border-amber-700/60 text-[10px] text-amber-200">ANTITHESIS</span>
                        <span className="px-1.5 py-0.5 rounded border border-slate-600 text-[10px] text-slate-300">SOURCE</span>
                        [2단계: 반명제 — 국가기관·위성 판독]
                      </div>
                      <p className="text-amber-100">{currentSite.analysis_dialectic.antithesis_western}</p>
                    </div>
                  )}
                  {activeDialecticTab === 'synthesis' && (
                    <div>
                      <div className="text-xs font-bold text-slate-400 mb-1">📎 [3단계: 종합 — INFERENCE · 단정 아님]</div>
                      <p className="text-slate-400"><span className="inline-block mr-2 px-1.5 py-0.5 rounded border border-slate-600 text-[10px] text-slate-300">INFERENCE</span>{currentSite.analysis_dialectic.synthesis_threat}</p>
                    </div>
                  )}
                  {activeDialecticTab === 'audit' && (
                    <div>
                      <div className="text-xs font-bold text-purple-400 mb-1 flex items-center gap-2 flex-wrap">
                        <span className="px-1.5 py-0.5 rounded border border-purple-700/60 text-[10px] text-purple-200">SOURCE</span>
                        [4단계: 재귀적 감사 — UNCLOS·PCA 대조]
                      </div>
                      <p className="text-purple-100">{currentSite.analysis_dialectic.recursive_audit}</p>
                    </div>
                  )}
                </div>

                {/* Source Citations */}
                <div className="pt-2 border-t border-slate-800/60 flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-400">
                  <span className="text-slate-500 font-bold flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5" />
                    참조 보고서:
                  </span>
                  {currentSite.sources.map((src, i) => (
                    <span key={i} className="px-2 py-0.5 bg-slate-800/60 rounded border border-slate-700 text-slate-300">
                      [{src.org}] {src.report_title} ({src.date})
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── FOOTER ── */}
          <div className="px-6 py-3 bg-black/80 border-t border-slate-800 flex items-center justify-between text-xs font-mono">
            <div className="text-slate-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>번개의 눈동자 (LIGHTNING EYE) 실시간 해양 주권 및 인공구조물 감시 HUD</span>
            </div>
            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-amber-500/20 border border-amber-500/50 hover:bg-amber-500/30 text-amber-200 rounded-lg font-bold transition-all cursor-pointer"
            >
              도판 닫기 (ESC)
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
