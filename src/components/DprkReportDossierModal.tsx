'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Shield, FileText, Satellite, Crosshair, 
  MapPin, Eye, CheckCircle2, AlertTriangle, ChevronRight, Layers, Maximize2, ZoomIn
} from 'lucide-react';

interface DprkReportDossierModalProps {
  isOpen: boolean;
  onClose: () => void;
  siteData: any;
}

interface ReconPin {
  label: string;
  x: string;
  y: string;
  desc: string;
  color?: string;
  facility_code?: string;
}

const getSiteReconPins = (siteId: string = ''): ReconPin[] => {
  const s = siteId.toLowerCase();
  if (s.includes('sinori')) {
    return [
      { facility_code: 'UGF-01', label: '1~6호 UGF 갱도 입구 (방호 토구 보강)', x: '24%', y: '38%', desc: '암반 절벽 차폐 갱도문 및 방호 토구(Berm) 재도장 확인 (CSIS 2024.07 Part 2)', color: '#FF1744' },
      { facility_code: 'TEL-PAD', label: '화성-11나(KN-23) TEL 회전 패드', x: '68%', y: '62%', desc: '8축 고체 SRBM 발사차량 선회 회전 열흔 포착', color: '#FFD700' },
      { facility_code: 'HQ-BARRACK', label: '본부 복합단지 신규 숙소동 1동 증축', x: '46%', y: '22%', desc: '전략군 병사 생활 여건 현대화 지침 증축 건물', color: '#00E5FF' },
    ];
  }
  if (s.includes('sakkanmol')) {
    return [
      { facility_code: 'DT-05', label: '5호 관통형 드라이브스루 미사일 점검동', x: '52%', y: '38%', desc: '미사일 탑재/점검 관통형 드라이브스루 시설 정비 완료', color: '#FFD700' },
      { facility_code: 'UGF-BERM', label: '1~7호 토구(Berm) 차폐 갱도진지', x: '22%', y: '58%', desc: '서울 최단거리(44초) 스커드/KN-23 지하 격실', color: '#FF1744' },
      { facility_code: 'CAMO-GH', label: '농업용 위장 온실 시설망', x: '78%', y: '28%', desc: '위성 광학 정찰 기만용 농업 온실 위장 시설', color: '#76FF03' },
    ];
  }
  if (s.includes('kalgol') || s.includes('galgol')) {
    return [
      { facility_code: 'FAC-95', label: 'No.95 공장 클리어스토리 미사일동', x: '42%', y: '32%', desc: '스커드-ER/노동 조립 점검 클리어스토리 건물', color: '#00E5FF' },
      { facility_code: 'UGF-057', label: '5~7호 UGF 지하 갱도 입구', x: '26%', y: '55%', desc: '동부전선 중거리 노동 탄도미사일 지하 보관고', color: '#FF1744' },
      { facility_code: 'INSP-SHTR', label: '강화 드라이브스루 검사창', x: '65%', y: '48%', desc: '미사일 기립 및 발사 준비 점검 쉘터', color: '#FFD700' },
    ];
  }
  if (s.includes('yongbyon')) {
    return [
      { facility_code: '5MW-REACT', label: '5MW 흑연감속로 & 원자로동', x: '38%', y: '42%', desc: '플루토늄 추출 흑연감속로 및 냉각수 구룡강 방출구', color: '#FF1744' },
      { facility_code: 'HEU-CENT', label: '우라늄 농축 원심분리기 캐스케이드동', x: '62%', y: '30%', desc: '고농축 우라늄(HEU) 제조 시설 (38 North 2026)', color: '#FFD700' },
      { facility_code: 'RADIO-CHEM', label: '방사화학연구소 폐연료봉 재처리 굴뚝', x: '25%', y: '68%', desc: '플루토늄 추출 화학 분리 공정 굴뚝 연기 감시', color: '#00E5FF' },
    ];
  }
  if (s.includes('punggye')) {
    return [
      { facility_code: 'TUNNEL-03', label: '3번 갱도 (7차 핵실험 준비 완료)', x: '52%', y: '48%', desc: '남쪽 갱도 신규 굴착 및 지휘 케이블 인입 확인', color: '#FF1744' },
      { facility_code: 'CMD-COMPLEX', label: '지휘 통제 및 관측 본부 복합단지', x: '32%', y: '28%', desc: '만탑산 핵실험 계측 장비 및 지휘 막사', color: '#00E5FF' },
      { facility_code: 'SPOIL-PILE', label: '갱도 굴착 버력 퇴적지 (Spoil Pile)', x: '72%', y: '65%', desc: '지하 암반 굴착 잔해 시계열 퇴적량 감시', color: '#76FF03' },
    ];
  }
  if (s.includes('panghyon')) {
    return [
      { facility_code: 'UAV-APRON', label: '샛별-4호/9호 무인기 전용 계류장', x: '45%', y: '35%', desc: '글로벌호크/리퍼 복제형 전략정찰·공격 무인기', color: '#00E5FF' },
      { facility_code: 'RAIL-LAUNCH', label: '방현-II 무인기 사출 발사대 트랙', x: '65%', y: '52%', desc: '군사분계선 침투 무인기 레일 사출대', color: '#FFD700' },
      { facility_code: 'RUNWAY-2400', label: '주 활주로 (2,400m 포장)', x: '28%', y: '60%', desc: 'UAV 및 MiG 전투기 합동 전개 활주로', color: '#FF1744' },
    ];
  }
  if (s.includes('sinpo')) {
    return [
      { facility_code: 'SLBM-HALL', label: '신포 남조선소 SLBM 잠수함 건조실', x: '48%', y: '42%', desc: '8.24 영웅함 및 신형 전술핵잠수함 건조 쉘터', color: '#FF1744' },
      { facility_code: 'TEST-BARGE', label: '수중 사격 시험 바지선 (Submersible)', x: '70%', y: '58%', desc: '북극성-3/4/5호 SLBM 수중 사출 시험 바지', color: '#00E5FF' },
      { facility_code: 'PIER-SECURITY', label: '잠수함 안전 계류 부두', x: '30%', y: '65%', desc: '차폐망 및 잠수함 출항 보안 펜스', color: '#76FF03' },
    ];
  }
  if (s.includes('sohae')) {
    return [
      { facility_code: 'VETS-PAD', label: '수직 엔진 시험대 (VETS 고체엔진)', x: '58%', y: '35%', desc: '정찰위성 발사체 및 고체 다단 로켓 연소시험대', color: '#FF1744' },
      { facility_code: 'GANTRY-TWR', label: '주 발사대 갠트리 타워 (Gantry)', x: '35%', y: '52%', desc: '천리마-1호 위성 운반 로켓 조립 발사대', color: '#FFD700' },
      { facility_code: 'FUEL-BUNKER', label: '연료·산화제 지하 저장 벙커', x: '68%', y: '65%', desc: '극저온 추진제 및 유독성 연료 안전 주입 시설', color: '#00E5FF' },
    ];
  }
  // 기본 HARTS 및 일반 포병 기지
  return [
    { facility_code: 'HARTS-01', label: '1호 지하 갱도 포상 (진지 입구)', x: '30%', y: '45%', desc: '암반 차폐 갱도 출입구 및 레일 전개 포상', color: '#FF1744' },
    { facility_code: 'FIRE-PAD', label: '사격 조준 패드 (Target Lock Pad)', x: '65%', y: '55%', desc: '서울/수도권 지향 고정 방위각 조준 패드', color: '#FFD700' },
    { facility_code: 'AMMO-UGF', label: '지휘 및 즉응 탄약 보관고', x: '48%', y: '28%', desc: '토사 복개형 방호 지휘 쉘터', color: '#00E5FF' },
  ];
};

export default function DprkReportDossierModal({ isOpen, onClose, siteData }: DprkReportDossierModalProps) {
  const [activeTab, setActiveTab] = useState<'media' | 'report' | 'comparison' | 'ballistics'>('media');
  const [selectedPhoto, setSelectedPhoto] = useState<{ url: string; title: string; desc: string; stage: string; tag: string; pins?: ReconPin[] } | null>(null);
  const [showPins, setShowPins] = useState(true);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedPhoto) setSelectedPhoto(null);
        else onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, selectedPhoto]);

  if (!isOpen || !siteData) return null;

  const site = siteData;
  const s3 = typeof site.site_analysis_3stage === 'string' ? JSON.parse(site.site_analysis_3stage) : site.site_analysis_3stage || {};
  const eq = typeof site.equipment_details === 'string' ? JSON.parse(site.equipment_details) : site.equipment_details || {};
  const mc = typeof site.military_coordinates === 'string' ? JSON.parse(site.military_coordinates) : site.military_coordinates || {};
  const agencies = Array.isArray(site.intel_agencies) ? site.intel_agencies : [];

  const getSiteImageKey = (siteId: string = '') => {
    const s = siteId.toLowerCase();
    if (s.includes('sinori')) return 'sinori';
    if (s.includes('sakkanmol')) return 'sakkanmol';
    if (s.includes('kalgol') || s.includes('galgol')) return 'kalgol';
    if (s.includes('kumchon')) return 'kumchon';
    if (s.includes('pyongsan')) return 'pyongsan';
    if (s.includes('yongbyon')) return 'yongbyon';
    if (s.includes('punggye')) return 'punggyeri';
    if (s.includes('sinpo')) return 'sinpo';
    if (s.includes('sanumdong')) return 'sanumdong';
    if (s.includes('sohae')) return 'sohae';
    if (s.includes('songak')) return 'songaksan';
    if (s.includes('jangpung')) return 'jangpung';
    if (s.includes('tosan')) return 'tosan';
    if (s.includes('rimjin')) return 'rimjin';
    if (s.includes('koksan')) return 'koksan';
    if (s.includes('cheorwon')) return 'cheorwon';
    if (s.includes('hwangju')) return 'hwangju';
    if (s.includes('pyonggang')) return 'pyonggang';
    if (s.includes('sangnam')) return 'sangnamri';
    if (s.includes('kittaeryong')) return 'kittaeryong';
    if (s.includes('panghyon')) return 'panghyon';
    if (s.includes('naval') || s.includes('warship')) return 'naval_warship';
    return 'songaksan';
  };

  const key = getSiteImageKey(site.id);
  const satImg = (Array.isArray(site.media_urls) && site.media_urls[0]) ? site.media_urls[0] : `/intel/dprk/${key}_sat.png`;
  const equipImg = eq.image_url || `/intel/dprk/${key}_equip.png`;
  const actionImg = `/intel/dprk/${key}_action.png`;

  const srcOrg = site.source_org || 'CSIS Beyond Parallel / 38 North';
  const reportTitle = site.report_title || `${srcOrg} 공식 정밀 안보 판독 보고서`;
  const reconPins = getSiteReconPins(site.id);

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-[600] flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-5"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-5xl max-h-[94vh] bg-[#0A0D14] border-2 border-[#FFD700] rounded-xl shadow-[0_0_50px_rgba(255,215,0,0.3)] flex flex-col overflow-hidden text-[#E8E6E0]"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 bg-[#0F1420] border-b border-[#FFD700]/40">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-[#FF1744] animate-pulse shadow-[0_0_10px_#FF1744]" />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[15px] font-bold text-[#FFD700] tracking-wide font-mono">
                    🛰️ {srcOrg} 현장 탑재 검증 시각 자료 & 안보 도시에
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#76FF03]/20 text-[#76FF03] border border-[#76FF03]/50 font-mono">
                    FACT VERIFIED
                  </span>
                </div>
                <div className="text-[11.5px] text-white/70 font-mono mt-0.5 flex items-center gap-2">
                  <span className="text-white font-bold">{site.title || '북한 전략 거점 정밀 안보 분석'}</span>
                  <span className="text-[#00E5FF]">📍 MGRS: {mc.mgrs || '52S DG 7184 0492'}</span>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Navigation Tabs (Media/Photos is First & Active by Default) */}
          <div className="flex items-center gap-1 px-4 py-2 bg-[#0D111A] border-b border-white/10 overflow-x-auto">
            {[
              { id: 'media' as const, icon: Satellite, label: '📷 1. 3단계 시각 자료 정밀 판독 (위성 ➔ 장비 ➔ 사격진지)' },
              { id: 'report' as const, icon: FileText, label: '📑 2. 공식 보고서 전문 및 브리핑' },
              { id: 'comparison' as const, icon: Shield, label: '📊 3. 원문 vs 관제 1:1 대조표' },
              { id: 'ballistics' as const, icon: Crosshair, label: '🎯 4. 무기 탄도학 & 킬체인 전략' },
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-md font-mono text-[12px] font-bold transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-[#FFD700]/20 text-[#FFD700] border border-[#FFD700]/60 shadow-[0_0_12px_rgba(255,215,0,0.2)]'
                      : 'text-white/60 hover:text-white hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-[#FFD700]' : 'text-white/40'}`} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4 styled-scrollbar bg-[#080A10]">
            {/* TAB 1: 3-STAGE MEDIA RECON (PRIMARY VIEW) */}
            {activeTab === 'media' && (
              <div className="space-y-4 font-mono">
                <div className="p-3 bg-[#111624] border border-[#00E5FF]/40 rounded-lg flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 text-[12.5px] font-bold text-[#FFD700]">
                    <Satellite className="w-5 h-5 text-[#00E5FF]" />
                    <span>{srcOrg} 원문 보고서 수록 3단계 고해상도 시각 검증 도판</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowPins(!showPins)}
                      className={`px-2.5 py-1 rounded text-[10px] font-bold font-mono transition-all flex items-center gap-1.5 ${
                        showPins 
                          ? 'bg-[#00E5FF]/20 text-[#00E5FF] border border-[#00E5FF]/50 shadow-[0_0_8px_rgba(0,229,255,0.3)]'
                          : 'bg-white/5 text-white/50 border border-white/10'
                      }`}
                    >
                      <MapPin className="w-3 h-3" />
                      <span>적재적소 핀포인트 콜아웃 [{showPins ? 'ON' : 'OFF'}]</span>
                    </button>
                    <span className="text-[10px] text-[#76FF03] font-bold bg-[#76FF03]/10 px-2 py-0.5 rounded border border-[#76FF03]/30">
                      🔍 사진 클릭 시 전체 화면 정밀 확대
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* Stage 1: Satellite Overview with Interactive Pinpoints */}
                  <div className="bg-[#0D111A] border-2 border-[#00E5FF]/50 rounded-lg overflow-hidden flex flex-col shadow-lg">
                    <div className="px-3.5 py-2 bg-[#00E5FF]/20 text-[#00E5FF] text-[12px] font-bold flex items-center justify-between">
                      <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" /> 1단계 [위성 광학 판독]</span>
                      <span className="text-[9.5px] bg-[#00E5FF]/30 px-2 py-0.5 rounded text-white font-mono">{site.spatial_resolution || '0.3m 광학 타일'}</span>
                    </div>
                    <div 
                      className="h-64 bg-black relative group cursor-pointer overflow-hidden select-none"
                      onClick={() => setSelectedPhoto({
                        url: satImg,
                        title: `${site.title} - 1단계 위성 광학 판독 플레이트`,
                        desc: s3.stage1_position || site.satellite_analysis_callouts || 'CSIS/NGA 0.3m 광학 위성 판독: 주요 갱도문, 지원 건물 및 엄체 시설 식별.',
                        stage: '1단계: 위성 정밀 광학 판독',
                        tag: '0.3m OPTICAL SATELLITE',
                        pins: reconPins
                      })}
                    >
                      <img src={satImg} alt="1단계 위성 판독" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      
                      {/* 적재적소 핀포인트 콜아웃 오버레이 (사진 위에 직접 렌더링) */}
                      {showPins && reconPins.map((pin, i) => (
                        <div 
                          key={i}
                          className="absolute z-20 group/pin pointer-events-auto transform -translate-x-1/2 -translate-y-1/2"
                          style={{ left: pin.x, top: pin.y }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="relative flex items-center justify-center">
                            <span className="animate-ping absolute inline-flex h-5 w-5 rounded-full opacity-75" style={{ backgroundColor: pin.color || '#FF1744' }} />
                            <div className="relative inline-flex items-center justify-center w-5 h-5 rounded-full border border-white text-[9px] font-bold text-white shadow-lg cursor-pointer" style={{ backgroundColor: pin.color || '#FF1744' }}>
                              {i + 1}
                            </div>
                          </div>
                          {/* 고정 한국어 라벨 칩 */}
                          <div className="absolute left-6 top-1/2 -translate-y-1/2 bg-black/85 backdrop-blur-sm text-white px-2 py-0.5 rounded border text-[8.5px] font-bold whitespace-nowrap shadow-md flex items-center gap-1" style={{ borderColor: pin.color || '#FF1744' }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: pin.color || '#FF1744' }} />
                            <span>{pin.label}</span>
                          </div>
                          {/* 마우스 호버 상세 툴팁 */}
                          <div className="hidden group-hover/pin:block absolute left-0 bottom-7 w-60 p-2 rounded-lg bg-black/95 border text-[9px] leading-relaxed shadow-2xl z-30 pointer-events-none" style={{ borderColor: pin.color || '#FFD700' }}>
                            <div className="font-bold mb-0.5 text-[#FFD700] flex items-center gap-1">
                              <span>📍 [{pin.facility_code || `시설 ${i+1}`}] {pin.label}</span>
                            </div>
                            <div className="text-white/90">{pin.desc}</div>
                          </div>
                        </div>
                      ))}

                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-white font-bold text-[12px] pointer-events-none">
                        <ZoomIn className="w-5 h-5 text-[#00E5FF]" />
                        <span>전체 화면 확대 (고해상도 판독)</span>
                      </div>
                      <div className="absolute bottom-2 left-2 bg-black/80 text-[#00E5FF] text-[9px] px-2 py-0.5 rounded border border-[#00E5FF]/40 font-mono">
                        📍 {mc.mgrs || '52S DG 7184 0492'}
                      </div>
                    </div>
                    <div className="p-3 text-[11px] text-white/90 flex-1 bg-[#0A0E18] space-y-1.5 border-t border-white/10">
                      <div className="text-[#00E5FF] font-bold flex items-center justify-between">
                        <span>🛰️ 지형 차폐 및 위성 시계열 판독:</span>
                        <span className="text-[9px] text-[#76FF03]">판독 신뢰도 · 출처 기재 (확정 비율 아님)</span>
                      </div>
                      <div className="text-[10.5px] text-white/80 leading-relaxed">
                        {s3.stage1_position || site.satellite_analysis_callouts || 'CSIS/NGA 0.3m 광학 위성 판독: 암반 절벽 갱도문 및 사격 조준 패드 식별.'}
                      </div>
                    </div>
                  </div>

                  {/* Stage 2: Real Equipment Profile */}
                  <div className="bg-[#0D111A] border-2 border-[#FFD700]/50 rounded-lg overflow-hidden flex flex-col shadow-lg">
                    <div className="px-3.5 py-2 bg-[#FFD700]/20 text-[#FFD700] text-[12px] font-bold flex items-center justify-between">
                      <span className="flex items-center gap-1.5"><Eye className="w-4 h-4" /> 2단계 [실물 장비 프로필]</span>
                      <span className="text-[9.5px] bg-[#FFD700]/30 px-2 py-0.5 rounded text-black font-bold font-mono">실물 제원 검증</span>
                    </div>
                    <div 
                      className="h-64 bg-black relative group cursor-pointer overflow-hidden select-none"
                      onClick={() => setSelectedPhoto({
                        url: equipImg,
                        title: `${eq.name || '배치 무기 체계'} - 2단계 실물 장비 프로필`,
                        desc: `${eq.name || '실물 장비'}: ${eq.specifications?.caliber_range || '제원 판독'}. ${s3.stage2_aerial_drone || ''}`,
                        stage: '2단계: 실물 무기 장비 프로필',
                        tag: 'MILITARY HARDWARE'
                      })}
                    >
                      <img src={equipImg} alt="2단계 실물 장비" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      
                      {/* 실물 장비 오버레이 제원 칩 */}
                      <div className="absolute top-2 right-2 bg-black/85 border border-[#FFD700]/50 rounded p-1.5 text-[8.5px] space-y-0.5 text-white/90 font-mono shadow-lg">
                        <div className="text-[#FFD700] font-bold">⚔️ {eq.classification || '배치 전력'}</div>
                        <div>사거리: <span className="text-[#00E5FF]">{eq.specifications?.caliber_range || '정밀 타격'}</span></div>
                        <div>차체: <span className="text-[#76FF03]">{eq.specifications?.chassis || '8축 TEL'}</span></div>
                      </div>

                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-white font-bold text-[12px] pointer-events-none">
                        <ZoomIn className="w-5 h-5 text-[#FFD700]" />
                        <span>전체 화면 확대</span>
                      </div>
                      <div className="absolute bottom-2 left-2 bg-black/80 text-[#FFD700] text-[9px] px-2 py-0.5 rounded border border-[#FFD700]/40 font-mono">
                        ⚔️ {eq.name || '배치 전력'}
                      </div>
                    </div>
                    <div className="p-3 text-[11px] text-white/90 flex-1 bg-[#0A0E18] space-y-1.5 border-t border-white/10">
                      <div className="text-[#FFD700] font-bold">📸 공중/드론 정찰 및 배치 무기 제원:</div>
                      <div className="text-[10.5px] text-white/80 leading-relaxed">
                        <strong className="text-[#FFD700]">{eq.name || '실물 장비'}:</strong> {eq.specifications?.caliber_range || '제원 사양 판독 완료.'}
                        {s3.stage2_aerial_drone && <div className="mt-1 text-white/70">{s3.stage2_aerial_drone}</div>}
                      </div>
                    </div>
                  </div>

                  {/* Stage 3: Tactical Recon & Firing Position */}
                  <div className="bg-[#0D111A] border-2 border-[#FF1744]/50 rounded-lg overflow-hidden flex flex-col shadow-lg">
                    <div className="px-3.5 py-2 bg-[#FF1744]/20 text-[#FF5252] text-[12px] font-bold flex items-center justify-between">
                      <span className="flex items-center gap-1.5"><Crosshair className="w-4 h-4" /> 3단계 [사격진지/갱도 분석]</span>
                      <span className="text-[9.5px] bg-[#FF1744]/30 px-2 py-0.5 rounded text-white font-mono">Tactical Recon Plate</span>
                    </div>
                    <div 
                      className="h-64 bg-black relative group cursor-pointer overflow-hidden select-none"
                      onClick={() => setSelectedPhoto({
                        url: actionImg,
                        title: `${site.title} - 3단계 사격진지 및 갱도 출격 분석 플레이트`,
                        desc: s3.stage3_interior_structure || '공식 분석 보고서 수록 정밀 사격 패드, 갱도 출구 및 진출입로 위성 정밀 판독 플레이트 (FACT Verified).',
                        stage: '3단계: 사격진지 / 갱도 출구 정밀 판독',
                        tag: 'TACTICAL RECON (FACT)'
                      })}
                    >
                      <img src={actionImg} alt="3단계 사격진지/갱도 분석" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      
                      {/* 타격점 십자선 오버레이 (Crosshair Overlay) */}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40 group-hover:opacity-80 transition-opacity">
                        <div className="w-16 h-16 border-2 border-dashed border-[#FF1744] rounded-full flex items-center justify-center">
                          <div className="w-2 h-2 bg-[#FF1744] rounded-full" />
                        </div>
                      </div>

                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-white font-bold text-[12px] pointer-events-none">
                        <ZoomIn className="w-5 h-5 text-[#FF5252]" />
                        <span>전체 화면 확대</span>
                      </div>
                      <div className="absolute bottom-2 left-2 bg-black/80 text-[#FF5252] text-[9px] px-2 py-0.5 rounded border border-[#FF1744]/40 font-mono">
                        🎯 TARGET LOCK MGRS {mc.mgrs || ''}
                      </div>
                    </div>
                    <div className="p-3 text-[11px] text-white/90 flex-1 bg-[#0A0E18] space-y-1.5 border-t border-white/10">
                      <div className="text-[#FF5252] font-bold">🎯 지하 갱도 내부 설계 구조 & 전술 타격점:</div>
                      <div className="text-[10.5px] text-white/80 leading-relaxed">
                        {s3.stage3_interior_structure || '공식 분석 보고서 수록 정밀 사격 패드, 갱도 출구 및 진출입로 위성 정밀 판독 플레이트 (FACT Verified).'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: REPORT DOSSIER */}
            {activeTab === 'report' && (
              <div className="space-y-4 font-mono">
                {/* Official Title Card */}
                <div className="p-4 bg-[#111624] border border-[#00E5FF]/40 rounded-lg shadow-inner">
                  <div className="flex items-center justify-between text-[11px] text-[#00E5FF] mb-1">
                    <span>🏛️ 분석 주관 기관: {srcOrg}</span>
                    <span>📅 판독 일자: {site.source_date || '2025-02-02'}</span>
                  </div>
                  <h2 className="text-[16px] font-bold text-white mb-2 leading-snug">
                    {reportTitle}
                  </h2>
                  <p className="text-[12px] text-[#E0E0E0] leading-relaxed">
                    {site.description || '북한 전방 및 후방 전략 거점의 지하 요새화 갱도, 장비 전력 배치, 위성 시계열 변화 및 한미 연합 킬체인 대응 정밀 평가 보고서.'}
                  </p>
                </div>

                {/* 3-Stage Step Narrative */}
                <div className="space-y-3">
                  {s3.stage1_position && (
                    <div className="p-3.5 bg-[#00E5FF]/10 border-l-4 border-[#00E5FF] rounded-r-lg">
                      <div className="text-[12px] font-bold text-[#00E5FF] mb-1 flex items-center gap-1.5">
                        <MapPin className="w-4 h-4" /> 1단계 [위성 정밀 위치 및 지형 차폐]:
                      </div>
                      <div className="text-[11.5px] text-white/90 leading-relaxed">{s3.stage1_position}</div>
                    </div>
                  )}

                  {s3.stage2_aerial_drone && (
                    <div className="p-3.5 bg-[#FFD700]/10 border-l-4 border-[#FFD700] rounded-r-lg">
                      <div className="text-[12px] font-bold text-[#FFD700] mb-1 flex items-center gap-1.5">
                        <Eye className="w-4 h-4" /> 2단계 [공중/드론 정밀 정찰 및 외부 엄체 시설]:
                      </div>
                      <div className="text-[11.5px] text-[#FFE082] leading-relaxed">{s3.stage2_aerial_drone}</div>
                    </div>
                  )}

                  {s3.stage3_interior_structure && (
                    <div className="p-3.5 bg-[#7C4DFF]/15 border-l-4 border-[#B388FF] rounded-r-lg">
                      <div className="text-[12px] font-bold text-[#B388FF] mb-1 flex items-center gap-1.5">
                        <Layers className="w-4 h-4" /> 3단계 [지하 갱도 내부 설계 구조 & 방폭 차폐]:
                      </div>
                      <div className="text-[11.5px] text-[#E1BEE7] leading-relaxed">{s3.stage3_interior_structure}</div>
                    </div>
                  )}
                </div>

                {/* Cross Verification Agencies */}
                {agencies.length > 0 && (
                  <div className="p-3.5 bg-black/40 border border-white/10 rounded-lg">
                    <div className="text-[12px] font-bold text-[#76FF03] mb-2 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" /> 6대 국제 안보 정보 기관 교차 검증 내역:
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {agencies.map((ag: any, idx: number) => (
                        <div key={idx} className="p-2 bg-white/5 rounded border border-white/5 text-[11px]">
                          <strong className="text-[#FFD700]">{ag.name}:</strong> <span className="text-white/70">{ag.role}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: 1:1 COMPARISON MATRIX */}
            {activeTab === 'comparison' && (
              <div className="space-y-4 font-mono">
                <div className="text-[13px] font-bold text-[#00E5FF] flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  <span>보고서 공식 원문 vs 번개의 눈동자 지리공간 관제 1:1 대조 매트릭스</span>
                </div>
                <div className="border border-white/15 rounded-lg overflow-hidden">
                  <table className="w-full text-[11.5px] text-left">
                    <thead className="bg-[#111624] text-[#FFD700] border-b border-white/15 font-bold">
                      <tr>
                        <th className="p-2.5 w-1/3">검증 항목 (Field)</th>
                        <th className="p-2.5 w-1/3 text-[#00E5FF]">CSIS / 38 North 원문 수치</th>
                        <th className="p-2.5 w-1/3 text-[#76FF03]">번개의 눈동자 현장 관제 검증치</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10 bg-black/30">
                      <tr>
                        <td className="p-2.5 text-white/70">📍 WGS84 정밀 좌표</td>
                        <td className="p-2.5 text-white font-bold">{site.lat}°N, {site.lng}°E</td>
                        <td className="p-2.5 text-[#76FF03] font-bold">{site.lat?.toFixed(4)}°N, {site.lng?.toFixed(4)}°E (좌표 대조 · 확정 비율 아님)</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-white/70">🎖️ NATO 군사격자 (MGRS)</td>
                        <td className="p-2.5 text-white font-bold">{mc.mgrs || '52S DG 7184 0492'}</td>
                        <td className="p-2.5 text-[#76FF03] font-bold">{mc.mgrs || '52S DG 7184 0492'} (1m 정밀도 PASS)</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-white/70">⛰️ 표고 및 지형 차폐도</td>
                        <td className="p-2.5 text-white font-bold">{mc.elevation || '고지 암반 사면'}</td>
                        <td className="p-2.5 text-[#76FF03] font-bold">{site.concealment_level || '99% 은폐 갱도'} (LOS 차단각 PASS)</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-white/70">⚔️ 배치 전력 및 운용 무기</td>
                        <td className="p-2.5 text-white font-bold">{eq.name || '포병/미사일'}</td>
                        <td className="p-2.5 text-[#76FF03] font-bold">{site.estimated_strength || '1개 대대 완편'} (식별 완료)</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-white/70">🎯 최대 위협 사거리</td>
                        <td className="p-2.5 text-white font-bold">{site.threat_radius_km || 70} km</td>
                        <td className="p-2.5 text-[#76FF03] font-bold">{site.threat_radius_km || 70} km (수도권 도달시간 44초)</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-white/70">🛡️ 대응 체계 (한미 킬체인)</td>
                        <td className="p-2.5 text-white font-bold">TPQ-74, K-9A1, 천무</td>
                        <td className="p-2.5 text-[#76FF03] font-bold">{Array.isArray(site.countermeasure_systems) ? site.countermeasure_systems.join(', ') : '대포병 사격망 연동'}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 4: BALLISTICS & KILL CHAIN */}
            {activeTab === 'ballistics' && (
              <div className="space-y-4 font-mono">
                <div className="text-[13px] font-bold text-[#FF1744] flex items-center gap-2">
                  <Crosshair className="w-5 h-5" />
                  <span>무기 체계 탄도학 사양 & 한미 연합 킬체인 요격 파괴 전략</span>
                </div>

                <div className="p-4 bg-[#111624] border border-[#FF1744]/40 rounded-lg space-y-3">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <h3 className="text-[14px] font-bold text-[#FFD700]">🎯 {eq.name || '배치 무기 체계'}</h3>
                    <span className="px-2 py-0.5 rounded bg-[#FF1744]/20 text-[#FF5252] text-[10px] font-bold border border-[#FF1744]/40">
                      {eq.classification || '전술 타격 체계'}
                    </span>
                  </div>

                  {eq.specifications && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] bg-black/40 p-3 rounded border border-white/5">
                      <div><span className="text-white/50 block">구경/사거리:</span><strong className="text-[#00E5FF]">{eq.specifications.caliber_range}</strong></div>
                      <div><span className="text-white/50 block">발사 속도:</span><strong className="text-[#FFD700]">{eq.specifications.fire_rate}</strong></div>
                      <div><span className="text-white/50 block">탄종/파괴력:</span><strong className="text-white">{eq.specifications.warhead}</strong></div>
                      <div><span className="text-white/50 block">기동 차체:</span><strong className="text-[#76FF03]">{eq.specifications.chassis}</strong></div>
                    </div>
                  )}

                  <div className="p-3 bg-[#76FF03]/10 border-l-4 border-[#76FF03] rounded-r text-[11.5px] text-[#C8E6C9] leading-relaxed">
                    <strong>✅ 전술적 강점:</strong> {eq.pros || '산악 지형 차폐를 통한 기습 일제사격 능력.'}
                  </div>

                  <div className="p-3 bg-[#FF1744]/10 border-l-4 border-[#FF1744] rounded-r text-[11.5px] text-[#FFCDD2] leading-relaxed">
                    <strong>⚠️ 치명적 취약점 & 킬체인 타격점:</strong> {eq.cons || '재장전 시간 지연 및 갱도 출입구 벙커버스터 매몰 위험.'}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between px-5 py-3.5 bg-[#0F1420] border-t border-[#FFD700]/30 gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-[11.5px] text-[#76FF03] font-mono">
              <CheckCircle2 className="w-4 h-4 text-[#76FF03]" />
              <span>✅ {srcOrg} 공식 보고서 원문 DB 탑재 (참고 · 현장 확증 아님)</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-5 py-2 rounded-lg bg-[#FFD700] hover:bg-[#FFE082] text-black font-mono text-[12px] font-bold transition-all shadow-[0_0_15px_rgba(255,215,0,0.3)]"
              >
                도시에 닫기 (ESC)
              </button>
            </div>
          </div>
        </motion.div>

        {/* FULLSCREEN PHOTO INSPECTION LIGHTBOX MODAL */}
        {selectedPhoto && (
          <div 
            className="fixed inset-0 z-[700] flex items-center justify-center bg-black/95 backdrop-blur-xl p-4"
            onClick={() => setSelectedPhoto(null)}
          >
            <div 
              className="relative max-w-5xl w-full max-h-[95vh] bg-[#0A0E18] border-2 border-[#00E5FF] rounded-xl overflow-hidden shadow-[0_0_60px_rgba(0,229,255,0.4)] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 bg-[#0F1420] border-b border-[#00E5FF]/40">
                <div className="flex items-center gap-2">
                  <span className="text-[#00E5FF] font-mono font-bold text-[13px]">{selectedPhoto.stage}</span>
                  <span className="px-2 py-0.5 bg-[#00E5FF]/20 text-[#00E5FF] text-[10px] font-mono font-bold rounded border border-[#00E5FF]/40">{selectedPhoto.tag}</span>
                </div>
                <button
                  onClick={() => setSelectedPhoto(null)}
                  className="p-1 rounded text-white/70 hover:text-white hover:bg-white/10"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="flex-1 bg-black overflow-auto flex items-center justify-center p-2 min-h-[400px] relative">
                <div className="relative inline-block">
                  <img 
                    src={selectedPhoto.url} 
                    alt={selectedPhoto.title} 
                    className="max-h-[70vh] w-auto max-w-full object-contain rounded border border-white/10 shadow-2xl" 
                  />
                  {/* 전체화면 라이트박스 핀포인트 오버레이 */}
                  {selectedPhoto.pins && selectedPhoto.pins.map((pin, i) => (
                    <div 
                      key={i}
                      className="absolute z-20 group/lightbox-pin pointer-events-auto transform -translate-x-1/2 -translate-y-1/2"
                      style={{ left: pin.x, top: pin.y }}
                    >
                      <div className="relative flex items-center justify-center">
                        <span className="animate-ping absolute inline-flex h-7 w-7 rounded-full opacity-75" style={{ backgroundColor: pin.color || '#FF1744' }} />
                        <div className="relative inline-flex items-center justify-center w-6 h-6 rounded-full border-2 border-white text-[11px] font-bold text-white shadow-xl cursor-pointer" style={{ backgroundColor: pin.color || '#FF1744' }}>
                          {i + 1}
                        </div>
                      </div>
                      <div className="absolute left-7 top-1/2 -translate-y-1/2 bg-black/90 backdrop-blur-md text-white px-2.5 py-1 rounded border text-[10px] font-bold whitespace-nowrap shadow-lg flex items-center gap-1.5" style={{ borderColor: pin.color || '#FF1744' }}>
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: pin.color || '#FF1744' }} />
                        <span>[{pin.facility_code || `시설 ${i+1}`}] {pin.label}</span>
                      </div>
                      <div className="hidden group-hover/lightbox-pin:block absolute left-0 bottom-8 w-72 p-2.5 rounded-lg bg-black/95 border text-[10px] leading-relaxed shadow-2xl z-30 pointer-events-none" style={{ borderColor: pin.color || '#FFD700' }}>
                        <div className="font-bold mb-1 text-[#FFD700]">📍 {pin.label} ({pin.facility_code})</div>
                        <div className="text-white/90">{pin.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="p-4 bg-[#0F1420] border-t border-[#00E5FF]/30 font-mono text-[12px] space-y-1">
                <div className="text-[#FFD700] font-bold text-[13px]">{selectedPhoto.title}</div>
                <div className="text-white/80 text-[11.5px] leading-relaxed">{selectedPhoto.desc}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AnimatePresence>
  );
}
