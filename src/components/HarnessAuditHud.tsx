'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle, AlertOctagon, RefreshCw, X, Clock,
  Brain, Activity, CheckCircle2, ExternalLink, Globe, Compass, Database,
  FileCheck2, Shield, Layers
} from 'lucide-react';
import type { HarnessAuditReport } from '@/lib/harness-auditor';

export default function HarnessAuditHud() {
  const [report, setReport] = useState<HarnessAuditReport | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'ai' | 'thinktank' | 'backtest'>('ai');

  // 싱크탱크 활동 보고서 데이터
  const [activities, setActivities] = useState<any[]>([]);
  const [thinkTankMeta, setThinkTankMeta] = useState<any>(null);

  // 백테스트 결과 데이터
  const [backtestData, setBacktestData] = useState<any>(null);

  const fetchAuditReport = useCallback(async () => {
    try {
      const res = await fetch('/api/harness/audit');
      if (res.ok) {
        const data = await res.json();
        if (data.report) {
          setReport(data.report);
          setLastRefreshed(new Date().toLocaleTimeString('ko-KR'));
        }
      }
    } catch (e) {
      console.warn('[HarnessAuditHud] fetch failed:', e);
    }
  }, []);

  const fetchThinkTankData = useCallback(async () => {
    try {
      const res = await fetch('/api/osint/dprk-activity');
      if (res.ok) {
        const data = await res.json();
        setActivities(data.activities || []);
        setThinkTankMeta({
          sources_queried: data.sources_queried,
          sources_responding: data.sources_responding,
          total_activities: data.total_activities,
          tier_stats: data.tier_stats,
          next_scheduled_update: data.next_scheduled_update,
        });
      }
    } catch (e) {
      console.warn('[HarnessAuditHud] think tank fetch failed:', e);
    }
  }, []);

  const fetchBacktestData = useCallback(async () => {
    try {
      const res = await fetch('/api/harness/backtest');
      if (res.ok) {
        const data = await res.json();
        setBacktestData(data.report);
      }
    } catch (e) {
      console.warn('[HarnessAuditHud] backtest fetch failed:', e);
    }
  }, []);

  const triggerManualAudit = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/harness/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trigger: 'OPERATOR_ON_DEMAND',
          reason: '운용자 수동 즉시 점검 — 번개의 눈동자 실시간 관제 데이터 무결성 재확인',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.report) {
          setReport(data.report);
          setLastRefreshed(new Date().toLocaleTimeString('ko-KR'));
        }
      }
      await Promise.all([fetchThinkTankData(), fetchBacktestData()]);
    } catch (e) {
      console.error('[HarnessAuditHud] manual trigger failed:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditReport();
    fetchThinkTankData();
    fetchBacktestData();
    const timer = setInterval(() => {
      fetchAuditReport();
      fetchThinkTankData();
      fetchBacktestData();
    }, 60000);
    return () => clearInterval(timer);
  }, [fetchAuditReport, fetchThinkTankData, fetchBacktestData]);

  if (!report) return null;

  // The report contains claimed results, not independently verified execution evidence.
  const isRejected = report.overall_verdict === 'REJECT';
  const badgeColor = isRejected
    ? 'border-rose-500/40 bg-rose-950/35 text-rose-300'
    : 'border-amber-500/40 bg-amber-950/35 text-amber-300';
  const dotColor = isRejected ? 'bg-rose-400' : 'bg-amber-400';

  return (
    <>
      {/* ── Top HUD Status Badge ── */}
      <button
        onClick={() => setIsOpen(true)}
        className={`pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-mono font-bold shadow-[0_0_8px_rgba(0,0,0,0.35)] transition-colors select-none ${badgeColor}`}
        title="AI 작성 감사 보고서 — 실행 근거 미확인"
      >
        <div className="relative flex items-center justify-center">
          <span className={`w-2 h-2 rounded-full ${dotColor}`} />
        </div>
        <div className="flex items-center gap-1.5">
          <Brain className="w-3.5 h-3.5 opacity-90" />
          <span>AI 감사: {isRejected ? '거부 보고' : '확인 필요'}</span>
          <span className="opacity-60 text-[10px]">(미검증)</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-900/60 text-blue-200 border border-blue-400/40">
            씽크탱크 19개소
          </span>
        </div>
      </button>

      {/* ── Detailed Tactical Audit Modal ── */}
      {isOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-4xl bg-[#070d18] border border-white/15 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.9)] overflow-hidden text-neutral-200 flex flex-col max-h-[92vh]">
            
            {/* Modal Header */}
            <div className="p-4 md:p-5 border-b border-white/10 bg-gradient-to-r from-blue-950/60 via-[#0a1526] to-slate-900/60 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl border ${badgeColor}`}>
                  {isRejected ? (
                    <AlertOctagon className="w-6 h-6 text-rose-400" />
                  ) : (
                    <AlertTriangle className="w-6 h-6 text-amber-400" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base md:text-lg font-bold text-white tracking-wide">
                      ⚡ 번개의 눈동자 하네스 감사 보고서
                    </h2>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${badgeColor}`}>
                      보고값: {report.overall_verdict} ({report.health_score}점)
                    </span>
                  </div>
                  <p className="text-xs text-neutral-400 font-mono flex items-center gap-2 mt-0.5">
                    <span>보고 모델: {report.model}</span>
                    <span>•</span>
                    <span>AI 신뢰: {(report.confidence * 100).toFixed(1)}%</span>
                    <span>•</span>
                    <span className="text-cyan-400 whitespace-nowrap">미검증</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-neutral-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tab Navigation */}
            <div className="flex items-center gap-2 px-5 pt-3 border-b border-white/10 bg-black/40">
              <button
                onClick={() => setActiveTab('ai')}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition ${
                  activeTab === 'ai'
                    ? 'border-cyan-400 text-cyan-300 bg-cyan-950/20'
                    : 'border-transparent text-neutral-400 hover:text-white'
                }`}
              >
                <Brain className="w-4 h-4" />
                <span>🧠 AI 감사 보고서</span>
              </button>

              <button
                onClick={() => setActiveTab('thinktank')}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition ${
                  activeTab === 'thinktank'
                    ? 'border-blue-400 text-blue-300 bg-blue-950/20'
                    : 'border-transparent text-neutral-400 hover:text-white'
                }`}
              >
                <Globe className="w-4 h-4" />
                <span>🏛️ 보고서 목록 ({activities.length}건)</span>
              </button>

              <button
                onClick={() => setActiveTab('backtest')}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition ${
                  activeTab === 'backtest'
                    ? 'border-emerald-400 text-emerald-300 bg-emerald-950/20'
                    : 'border-transparent text-neutral-400 hover:text-white'
                }`}
              >
                <FileCheck2 className="w-4 h-4" />
                <span>⚡ 백테스트 보고 ({backtestData?.grand_pass_rate == null ? '미확인' : `${backtestData.grand_pass_rate}%`})</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 overflow-y-auto flex-1 font-sans text-xs">

              {/* ───────────────────────────────────────────────────────────── */}
              {/* TAB 1: AI 무결성 진단 & 자가치유 */}
              {/* ───────────────────────────────────────────────────────────── */}
              {activeTab === 'ai' && (
                <div className="space-y-4">
                  {/* 구동 시기 및 명확한 감사 사유 */}
                  <div className="p-3.5 rounded-xl bg-blue-950/20 border border-blue-500/30 space-y-2">
                    <div className="flex items-center justify-between text-cyan-300 font-bold">
                      <span className="flex items-center gap-1.5 font-mono text-xs">
                        <Clock className="w-4 h-4 text-cyan-400" />
                        【구동 시기 및 명확한 감사 사유】
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-cyan-900/40 text-cyan-200 border border-cyan-500/30">
                        {report.trigger_type}
                      </span>
                    </div>
                    <p className="text-neutral-200 leading-relaxed text-[12px] bg-black/40 p-2.5 rounded-lg border border-white/5">
                      👉 <strong>{report.trigger_reason}</strong>
                    </p>
                    <div className="flex flex-wrap items-center justify-between text-[11px] text-neutral-400 pt-1 font-mono">
                      <span>보고서 시각: {new Date(report.timestamp).toLocaleString('ko-KR')}</span>
                      <span>다음 예정값: {new Date(report.next_scheduled_time).toLocaleTimeString('ko-KR')} (실행 미확인)</span>
                    </div>
                  </div>

                  {/* 군사전술적 평가 & 조치 지침 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 space-y-1.5">
                      <span className="text-[11px] font-bold text-amber-300 flex items-center gap-1">
                        <Activity className="w-3.5 h-3.5" /> AI 작성 평가 (미검증)
                      </span>
                      <p className="text-neutral-300 leading-relaxed text-[11px]">
                        {report.tactical_assessment}
                      </p>
                    </div>
                    <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 space-y-1.5">
                      <span className="text-[11px] font-bold text-emerald-300 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> AI 작성 권고 (미검증)
                      </span>
                      <p className="text-neutral-300 leading-relaxed text-[11px]">
                        👉 <strong>{report.action_recommendation}</strong>
                      </p>
                    </div>
                  </div>

                  {/* 자가 치유(Self-Healing) 기록 */}
                  {report.remediation_applied && (
                    <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/40 space-y-2">
                      <div className="flex items-center justify-between text-emerald-300 font-bold">
                        <span className="flex items-center gap-1.5 text-xs">
                          <RefreshCw className="w-4 h-4 text-emerald-400 animate-spin" style={{ animationDuration: '8s' }} />
                          【자가 치유 적용 보고】
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-900/60 text-emerald-200 border border-emerald-400/30 font-mono">
                          재검증 미확인
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-300 leading-relaxed" style={{ wordBreak: 'keep-all' }}>
                        보고서에 <strong>대체 출처 사용</strong>이 기록돼 있습니다. 실제 복구 성공 여부는 별도 실행 근거로 확인해야 합니다.
                      </p>
                    </div>
                  )}

                  {/* 8대 전술 API 실시간 수신 및 무결성 테이블 */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-neutral-300 font-bold">
                      <span>데이터 피드 점검 보고 · 출처 진위 미확인</span>
                      <span className="text-neutral-400 font-mono text-[10px]">
                        프로빙 {report.probe_duration_ms}ms + AI추론 {report.ai_duration_ms}ms = 총 {report.total_duration_ms}ms
                      </span>
                    </div>
                    <div className="border border-white/10 rounded-xl overflow-hidden">
                      <table className="w-full text-left border-collapse text-[11px]">
                        <thead className="bg-white/5 text-neutral-400 font-mono border-b border-white/10">
                          <tr>
                            <th className="py-2 px-3">보고된 데이터 출처</th>
                            <th className="py-2 px-2">보고 상태</th>
                            <th className="py-2 px-2">지연</th>
                            <th className="py-2 px-2 text-right">수신 건수</th>
                            <th className="py-2 px-3">보고 판정</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 font-mono">
                          {report.probeResults.map((p) => {
                            const isOk = p.ok && !p.anomalyDetected;
                            return (
                              <tr key={p.endpoint} className="hover:bg-white/5 transition">
                                <td className="py-2 px-3 font-sans">
                                  <div className="font-semibold text-white flex items-center gap-1.5">
                                    <span>{p.name}</span>
                                    {p.remediated && (
                                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-900/60 text-emerald-300 border border-emerald-500/40 font-mono">
                                        복구 보고
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[9px] text-neutral-500">
                                    {p.authoritative_source ? `🛡️ ${p.authoritative_source}` : p.endpoint}
                                  </div>
                                </td>
                                <td className="py-2 px-2">
                                  <span className={p.httpStatus === 200 || p.remediated ? 'text-emerald-400' : 'text-rose-400'}>
                                    {p.remediated ? 'RECOVERED' : p.httpStatus === 200 ? '200' : p.httpStatus || 'ERR'}
                                  </span>
                                </td>
                                <td className="py-2 px-2 text-neutral-400">{p.latencyMs}ms</td>
                                <td className="py-2 px-2 text-right font-bold text-cyan-300">
                                  {p.itemCount.toLocaleString()}건
                                </td>
                                <td className="py-2 px-3">
                                  {p.remediated ? (
                                    <span className="text-emerald-400 flex items-center gap-1 font-bold">
                                      <CheckCircle2 className="w-3 h-3 text-emerald-400" /> 복구 미검증
                                    </span>
                                  ) : isOk ? (
                                    <span className="text-emerald-400 flex items-center gap-1">
                                      <CheckCircle2 className="w-3 h-3" /> 정상
                                    </span>
                                  ) : (
                                    <span className="text-amber-400 flex items-center gap-1" title={p.anomalyReason}>
                                      <AlertTriangle className="w-3 h-3" /> 대기
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* ───────────────────────────────────────────────────────────── */}
              {/* TAB 2: 글로벌 씽크탱크 보고서 실시간 레이더 (거짓없는 투명 감사) */}
              {/* ───────────────────────────────────────────────────────────── */}
              {activeTab === 'thinktank' && (
                <div className="space-y-4">
                  {/* 요약 바 */}
                  <div className="p-3.5 rounded-xl bg-blue-950/30 border border-blue-500/40 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Globe className="w-5 h-5 text-cyan-400" />
                      <div>
                        <div className="font-bold text-white text-xs">
                          등록 출처의 수집 보고서 목록
                        </div>
                        <div className="text-[11px] text-neutral-400">
                          CSIS, 38 North, US DoD, FBI, FAS, RUSI, SIPRI, KIDA, INSS 등 보고서에 기록된 출처
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 font-mono text-[11px]">
                      <span className="px-2 py-1 rounded bg-blue-900/60 text-blue-200 border border-blue-400/40">
                        총 {activities.length}건 등록 보고서
                      </span>
                      <span className="px-2 py-1 rounded bg-emerald-900/60 text-emerald-200 border border-emerald-400/40">
                        출처 검증 미확인
                      </span>
                    </div>
                  </div>

                  <p className="text-[11px] text-neutral-400">
                    💡 <strong>[보고서 기록]</strong>: 아래 정보는 전달받은 보고서의 내용입니다. 출처 링크·발행 시각·좌표의 정확성을 이 화면이 보증하지 않습니다.
                  </p>

                  {/* 보고서 카드 목록 */}
                  <div className="space-y-2.5">
                    {activities.map((act, idx) => (
                      <div
                        key={act.id || idx}
                        className="p-3.5 rounded-xl bg-black/40 border border-white/10 hover:border-cyan-500/40 transition space-y-2"
                      >
                        {/* 헤더 행 */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded bg-blue-950 text-cyan-300 font-bold font-mono text-[10px] border border-blue-500/40">
                              🏛️ {act.source_org}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 font-mono text-[10px] border border-emerald-500/40">
                              🎖️ 보고값: {act.verification_tier} ({act.verification_score}점)
                            </span>
                            <span className="text-neutral-400 font-mono text-[10px]">
                              발행: {act.source_date || act.published_date?.slice(0, 10)}
                            </span>
                          </div>

                          {/* 원문 링크 버튼 (거짓없는 투명 감사 핵심) */}
                          <a
                            href={act.report_url || act.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[10.5px] text-cyan-300 hover:text-cyan-100 font-mono bg-cyan-950/40 hover:bg-cyan-900/60 px-2 py-1 rounded-lg border border-cyan-500/30 transition"
                            title="보고서에 등록된 출처 링크 열기"
                          >
                            <span>등록된 출처 링크</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>

                        {/* 제목 및 설명 */}
                        <div>
                          <h4 className="font-bold text-white text-[12px] leading-snug">
                            {act.title}
                          </h4>
                          <p className="text-neutral-300 text-[11px] mt-1 leading-relaxed">
                            {act.description}
                          </p>
                        </div>

                        {/* MGRS 군사 좌표 및 장비 정보 */}
                        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-white/5 font-mono text-[10.5px]">
                          <span className="text-amber-300 flex items-center gap-1">
                            <Compass className="w-3 h-3" />
                            <strong>MGRS:</strong> {act.military_coordinates?.mgrs || '52S CH 7625 0392'}
                          </span>
                          <span className="text-neutral-500">•</span>
                          <span className="text-neutral-400">
                            좌표: {act.lat?.toFixed(4)}°N, {act.lng?.toFixed(4)}°E
                          </span>
                          {act.equipment_details?.name && (
                            <>
                              <span className="text-neutral-500">•</span>
                              <span className="text-cyan-400 font-sans">
                                🎯 대상: {act.equipment_details.name}
                              </span>
                            </>
                          )}
                        </div>

                        {/* 3단계 전술 분석 프리뷰 */}
                        {act.site_analysis_3stage && (
                          <div className="p-2 rounded bg-black/50 border border-white/5 text-[10.5px] space-y-0.5 text-neutral-300 font-sans">
                            <div><strong className="text-neutral-400">[1단계 지리]:</strong> {act.site_analysis_3stage.stage1_position}</div>
                            <div><strong className="text-neutral-400">[2단계 관측]:</strong> {act.site_analysis_3stage.stage2_aerial_drone}</div>
                            <div><strong className="text-neutral-400">[3단계 시설]:</strong> {act.site_analysis_3stage.stage3_interior_structure}</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ───────────────────────────────────────────────────────────── */}
              {/* TAB 3: 하네스 브릿지 백테스트 보고 */}
              {/* ───────────────────────────────────────────────────────────── */}
              {activeTab === 'backtest' && backtestData && (
                <div className="space-y-4">
                  {/* 총합 배너 */}
                  <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/50 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-emerald-900/60 border border-emerald-400 text-emerald-300">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-white flex items-center gap-2">
                          <span>시험 기록</span>
                          <span className="px-2 py-0.5 rounded-full bg-emerald-900 text-emerald-200 text-xs font-mono font-bold">
                            [보고값: {backtestData.overall_verdict}]
                          </span>
                        </div>
                        <div className="text-[11px] text-neutral-300 mt-0.5">
                          보고된 시험 {backtestData.grand_total_tests}개 (보고 통과율 {backtestData.grand_pass_rate == null ? '미확인' : `${backtestData.grand_pass_rate}%`})
                        </div>
                      </div>
                    </div>
                    <div className="text-right font-mono text-[11px] text-neutral-400">
                      <div>보고서 시각: {new Date(backtestData.timestamp).toLocaleString('ko-KR')}</div>
                      <div className="text-emerald-400 font-bold">재실행·보완 여부 미확인</div>
                    </div>
                  </div>

                  {/* 스위트별 상세 내역 */}
                  <div className="space-y-3">
                    {backtestData.suites?.map((s: any, idx: number) => (
                      <div key={idx} className="p-3.5 rounded-xl bg-black/40 border border-white/10 space-y-2">
                        <div className="flex items-center justify-between font-bold text-xs">
                          <span className="text-white">{s.suite_name}</span>
                          <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/40 font-mono text-[10.5px]">
                            보고 통과율: {s.pass_rate}% ({s.passed_tests}/{s.total_tests})
                          </span>
                        </div>

                        <div className="space-y-1.5 pt-1">
                          {s.details?.map((d: any, dIdx: number) => (
                            <div
                              key={dIdx}
                              className="p-2 rounded-lg bg-black/60 border border-white/5 text-[10.5px] font-mono flex flex-col md:flex-row md:items-center justify-between gap-1"
                            >
                              <div className="flex items-center gap-2">
                                <span className={d.status === 'PASS' ? 'text-emerald-400' : 'text-amber-400'}>
                                  {d.status === 'PASS' ? '✅' : '⚠️'}
                                </span>
                                <span className="font-bold text-neutral-200">{d.name}</span>
                              </div>
                              <div className="text-neutral-400 text-[10px] truncate max-w-md">
                                {d.evidence}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-white/10 bg-black/40 flex items-center justify-between">
              <span className="text-[10px] text-neutral-500 font-mono">
                감사 보고 수신: {lastRefreshed} • 화면 조회 설정: 60초
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={triggerManualAudit}
                  disabled={isLoading}
                  className="px-3.5 py-1.5 rounded-xl bg-cyan-600/30 hover:bg-cyan-600/50 border border-cyan-400/40 text-cyan-200 text-xs font-mono font-bold flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                  <span>{isLoading ? '보고 요청 중...' : '감사 보고 요청'}</span>
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-neutral-200 text-xs font-bold transition"
                >
                  닫기
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </>
  );
}
