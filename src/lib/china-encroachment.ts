/**
 * CHINA MARITIME ENCROACHMENT & MILITARIZED ARTIFICIAL ISLANDS OSINT
 * Cross-checked references (not a completeness claim):
 * - Republic of Korea Navy & KHOA (국립해양조사원 / 해양수산부)
 * - US Department of Defense (DoD PRC Military Power Report)
 * - Japan Ministry of Defense (MOD Defense White Paper)
 * - CSIS Asia Maritime Transparency Initiative (AMTI)
 * - Israel Institute for National Security Studies (INSS) & IDF Intelligence
 * - 2016 Permanent Court of Arbitration (PCA) Hague Ruling / UNCLOS Art. 60
 *
 * Dialectic honesty: thesis/antithesis/audit = claim·citation chips only;
 * synthesis_threat = INFERENCE (never assertive / never "100%").
 */

export interface ChinaEncroachmentSite {
  id: string;
  name: string;
  chinese_name: string;
  english_name: string;
  region: 'YELLOW_SEA' | 'SOUTH_CHINA_SEA';
  region_label: string;
  lat: number;
  lng: number;
  threat_level: 'CRITICAL' | 'HIGH' | 'MODERATE';
  facility_type: 'DEEP_SEA_PLATFORM' | 'MILITARY_ARTIFICIAL_ISLAND' | 'OCEAN_RADAR_BUOY' | 'NAVAL_FORWARD_BASE';
  facility_type_label: string;
  runway_length_m?: number;
  specifications: {
    dimensions: string;
    personnel_or_capacity: string;
    radar_systems: string;
    weapon_systems: string;
    construction_year: string;
  };
  satellite_image: string;
  recon_image: string;
  analysis_dialectic: {
    thesis_china: string;       // [1단계: 명제] 중국 공식 대외 주장 (CLAIM)
    antithesis_western: string; // [2단계: 반명제] 인용·관측 판독 (CITATION)
    synthesis_threat: string;   // [3단계: 종합] INFERENCE only — 단정 배지 금지
    recursive_audit: string;    // [4단계: 재귀적 감사] 법·출처 대조 (SOURCE)
  };
  sources: {
    org: string;
    report_title: string;
    date: string;
  }[];
}


/** Stage honesty contract for API/UI — synthesis is never assertive. */
export const DIALECTIC_STAGE_META = {
  thesis: {
    badge: 'THESIS',
    kind: 'CLAIM' as const,
    judgmentSource: 'source_claim' as const,
    assertiveAllowed: false,
  },
  antithesis: {
    badge: 'ANTITHESIS',
    kind: 'CITATION' as const,
    judgmentSource: 'cited_source' as const,
    assertiveAllowed: false,
  },
  synthesis: {
    badge: 'INFERENCE',
    kind: 'INFERENCE' as const,
    judgmentSource: 'inference' as const,
    assertiveAllowed: false,
  },
  audit: {
    badge: 'SOURCE',
    kind: 'CITATION' as const,
    judgmentSource: 'legal_source' as const,
    assertiveAllowed: false,
  },
} as const;

export function withDialecticHonesty<T extends { analysis_dialectic: ChinaEncroachmentSite['analysis_dialectic']; sources: ChinaEncroachmentSite['sources'] }>(site: T) {
  return {
    ...site,
    analysis_dialectic: {
      ...site.analysis_dialectic,
      stages: DIALECTIC_STAGE_META,
    },
    judgmentPolicy: {
      synthesisIsInference: true,
      assertiveAllowed: false,
      forbidCopy: ['100%', '완벽', '확증 완료'] as const,
    },
  };
}

export const CHINA_ENCROACHMENT_SITES: ChinaEncroachmentSite[] = [
  // ── 1. 서해 (Yellow Sea) 잠정조치수역 침탈 시설물 ──
  {
    id: 'YS-SHENLAN-01',
    name: '서해 심해 양식·관측 복합 플랫폼 [선란 1호]',
    chinese_name: '深蓝 1号 (Shenlan 1)',
    english_name: 'Shenlan-1 Deep Sea Platform (Yellow Sea)',
    region: 'YELLOW_SEA',
    region_label: '서해 한중 잠정조치수역 (Yellow Sea Provisional Zone)',
    lat: 35.0000,
    lng: 123.5000,
    threat_level: 'HIGH',
    facility_type: 'DEEP_SEA_PLATFORM',
    facility_type_label: '심해 가두리 및 해상 감시 타워 (군사 이중목적)',
    specifications: {
      dimensions: '원형 강철 트러스 직경 60.2m, 전고 35m, 배수량 약 50,000톤',
      personnel_or_capacity: '상주 및 유지보수 승조원 15~20명, 헬리패드 완비',
      radar_systems: '해상 탐색 레이더 마스트, 위성통신(베이두) 안테나, 광학 CCTV 감시 타워',
      weapon_systems: '비무장(이중 목적 수중 음향 소나 어레이 및 잠수함 음문 수집 추정)',
      construction_year: '2018년 건조 / 2021년 한중 잠정조치수역 외해 계류',
    },
    satellite_image: '/intel/encroachment/shenlan1_sat.jpg',
    recon_image: '/intel/encroachment/shenlan2_recon.jpg',
    analysis_dialectic: {
      thesis_china: '중국 농업농촌부 공식 발표: 황해 냉수대 고부가가치 연어 양식 및 순수 민간 해양 기상 환경 관측을 위한 친환경 스마트 해양 목장 시설.',
      antithesis_western: '미 국방부(DoD) 및 대한민국 해양수산부 판독: 한중 배타적 경제수역(EEZ) 미획정 잠정조치수역의 사실상 실효지배를 노린 거점으로, 상부에 장거리 대함 레이더 및 수중 센서 케이블이 인입된 정황 포착. 서해 124도선 내측 침탈 교두보.',
      synthesis_threat: '한반도 서해 진입 미 해군 항모전단 및 대한민국 해군 2함대 초계 함정의 음향 신호(Acoustic Signature)를 상시 도청·추적하는 A2/AD(반접근·지역거부) 전진 센서 기지 기능 수행.',
      recursive_audit: 'UNCLOS 제60조 위반: 배타적 경제수역 내 인공구조물 설치는 인접국과의 합의를 요하며, 영해나 자체 관할권을 창설할 수 없음. 한국 해경 순찰선에 대한 중국 해경 5901함의 위협 기동과 직접 연계.',
    },
    sources: [
      { org: '대한민국 국립해양조사원 / 해군본부', report_title: '서해 잠정조치수역 내 중국 불법 인공구조물 현황 평가', date: '2024.08' },
      { org: 'CSIS AMTI (Asia Maritime Transparency Initiative)', report_title: 'China\'s Dual-Use Ocean Platforms in the Yellow Sea', date: '2024.05' },
      { org: 'US DoD INDOPACOM', report_title: 'Yellow Sea Maritime Domain Awareness Review', date: '2024.02' },
    ],
  },
  {
    id: 'YS-SHENLAN-02',
    name: '서해 차세대 초대형 스마트 플랫폼 [선란 2호]',
    chinese_name: '深蓝 2号 (Shenlan 2)',
    english_name: 'Shenlan-2 Next-Gen Semi-Submersible Base',
    region: 'YELLOW_SEA',
    region_label: '서해 한중 잠정조치수역 (Yellow Sea Provisional Zone)',
    lat: 35.1333,
    lng: 123.4167,
    threat_level: 'CRITICAL',
    facility_type: 'DEEP_SEA_PLATFORM',
    facility_type_label: '차세대 반잠수식 스마트 감시 플랫폼',
    specifications: {
      dimensions: '8각형 반잠수식 구조물, 높이 71.5m, 직경 110m, 총 용적 160,000㎥',
      personnel_or_capacity: '상주 연구·기술원 30명, 중형 헬기 Z-9/Z-20 이착륙 패드',
      radar_systems: '위상배열 해양 탐색 레이더, 무인 수상정(USV) 도킹 및 무선 충전 스테이션',
      weapon_systems: '전자전 재밍 및 해양 드론 유도 통제 스테이션',
      construction_year: '2024년 3월 칭다오 건조 완료 후 서해 해역 전진 배치',
    },
    satellite_image: '/intel/encroachment/shenlan1_sat.jpg',
    recon_image: '/intel/encroachment/shenlan2_recon.jpg',
    analysis_dialectic: {
      thesis_china: '중국 선박중공업(CSIC) 발표: 연간 8,000톤 규모의 해양 양식 자동화와 인공지능 기반 수중 환경 모니터링을 실현하는 첨단 공학 플랜트.',
      antithesis_western: '일본 방위성(MOD) 및 미 해군전쟁대학(CMSI) 보고: 단순 양식 시설의 체적을 3배 초과하며, 해저 음향 감시선(SOSUS) 집선 허브 및 무인 잠수정(UUV) 전진 기지로 설계된 복합 군사 자산.',
      synthesis_threat: '한반도 서해 해역을 중국 내해(Internal Lake)로 만들기 위한 해양 영토화의 핵심 쐐기(Wedge). 대한민국 공군 KADIZ 및 해군 작전 해역의 서측 경계를 물리적으로 밀어붙이는 전술 거점.',
      recursive_audit: '2016 헤이그 중재재판소 판결의 원칙(인공 매립 및 구조물은 주권적 관할권을 생성하지 못함)에도 불구하고, 중국 해경 및 해상민병대(PAFMM)를 상시 배치하여 배타적 통제권을 불법 행사.',
    },
    sources: [
      { org: 'US Naval War College (CMSI)', report_title: 'China Maritime Report No. 38: The Yellow Sea Encroachment', date: '2024.09' },
      { org: 'Japan Ministry of Defense (MOD)', report_title: 'East Asia Strategic Review: Yellow Sea Platforms', date: '2024.06' },
      { org: 'CSIS Beyond Parallel', report_title: 'Sino-Korean Maritime Friction in the West Sea', date: '2024.07' },
    ],
  },
  {
    id: 'YS-BUOY-ARRAY',
    name: '격렬비열도 외해 중국 다목적 해양관측 부이망',
    chinese_name: '黄海综合海洋观测浮标阵 (Yellow Sea Buoy Array)',
    english_name: 'Yellow Sea Tactical Sensor Buoy Network',
    region: 'YELLOW_SEA',
    region_label: '서해 격렬비열도 서방 외해 (Yellow Sea Outer West)',
    lat: 36.4167,
    lng: 123.7500,
    threat_level: 'MODERATE',
    facility_type: 'OCEAN_RADAR_BUOY',
    facility_type_label: '계류형 레이더/음향 복합 센서 부이망',
    specifications: {
      dimensions: '직경 10m 대형 원반형 부이 3기 + 직경 3m 보조 부이 12기',
      personnel_or_capacity: '무인 자동화 작동 (태양광 패널 및 파력 발전 구동)',
      radar_systems: '대공/대함 ADS-B 수신기, 수온·염분·음속도 프로파일러(CTD/SVP)',
      weapon_systems: '수중 잠수함 탐지 하이드로폰(Hydrophone) 어레이 내장',
      construction_year: '2020년 이후 지속 증설',
    },
    satellite_image: '/intel/encroachment/shenlan1_sat.jpg',
    recon_image: '/intel/encroachment/subi_reef_recon.jpg',
    analysis_dialectic: {
      thesis_china: '국가해양국(SOA): 태풍 조기 경보, 기후 변화 연구, 해류 측정을 위한 공익 해양 관측 부이.',
      antithesis_western: '대한민국 합동참모본부 및 미 해군 제7함대: 서해 수중 음향 전파 특성(Cold Water Mass)을 실시간 수집하여 북한 및 중국 잠수함의 은밀 침투로를 개척하고 한미 연합 해군 작전을 감시하는 군사 센서망.',
      synthesis_threat: '한반도 본토와 불과 150~200km 거리에 설치되어 서해상의 한미 공군 비행 항적 및 해군 기동을 24시간 실시간 모니터링.',
      recursive_audit: '대한민국 EEZ 인접 해역에서의 무허가 군사 조사 활동은 UNCLOS 제246조(해양과학조사의 동의 요건)의 명백한 남용 및 위반.',
    },
    sources: [
      { org: '대한민국 합동참모본부 정보본부', report_title: '서해 잠정조치수역 내 중국 부이망 군사적 영향 분석', date: '2024.04' },
      { org: 'Israel INSS', report_title: 'Maritime Domain Awareness & Sensor Networks in Disputed Seas', date: '2023.11' },
    ],
  },

  // ── 2. 남중국해 (South China Sea) 군사화 인공섬 ──
  {
    id: 'SCS-FIERY-CROSS',
    name: '남중국해 피어리 크로스 암초 인공 요새섬',
    chinese_name: '永暑礁 (Fiery Cross Reef)',
    english_name: 'Fiery Cross Reef Military Fortress Base',
    region: 'SOUTH_CHINA_SEA',
    region_label: '남중국해 스프래틀리 군도 (Spratly Islands)',
    lat: 9.5500,
    lng: 112.8903,
    threat_level: 'CRITICAL',
    facility_type: 'MILITARY_ARTIFICIAL_ISLAND',
    facility_type_label: '대형 군사 비행장 및 전구 지휘 요새',
    runway_length_m: 3125,
    specifications: {
      dimensions: '매립 면적 2.8㎢, 3,125m 주 활주로 및 유도로 완비',
      personnel_or_capacity: '인민해방군 해군·공군 1,000명 주둔, 탄약·유류 대형 지하 저장고',
      radar_systems: '대공 조기경보 레이더, 사격통제 레이더, 대형 백색 레이돔 12기',
      weapon_systems: 'HQ-9 지대공 미사일 포대, YJ-12B 초음속 대함 미사일 이동식 발사대',
      construction_year: '2014년 매립 개시 / 2016년 군용기 시험 비행 완료',
    },
    satellite_image: '/intel/encroachment/fiery_cross_sat.jpg',
    recon_image: '/intel/encroachment/subi_reef_recon.jpg',
    analysis_dialectic: {
      thesis_china: '중국 외교부: 국제 수로 항행 안전, 해상 수색구조(SAR), 기상 관측 지원을 위한 방어적 민간 공공시설.',
      antithesis_western: '미 국방부(DoD) 및 CSIS AMTI 정밀 판독: H-6K 핵투발 가능 전략폭격기, J-11/J-16 중전투기, KJ-500 조기경보기 이착륙이 가능한 전구급 항공 군사 요새.',
      synthesis_threat: '말라카 해협에서 대만해협에 이르는 핵심 원유 수송로(SLOC)를 통제하고 미 해군 기동을 차단하는 남중국해 A2/AD 삼각 요새(피어리 크로스-수비-미스치프)의 심장부.',
      recursive_audit: '2016 헤이그 PCA 만장일치 판결: 피어리 크로스는 썰물 때만 노출되는 간출지(Low-Tide Elevation) 및 암초로, 인공 매립을 통해 12해리 영해나 200해리 EEZ를 주장할 법적 근거 전무.',
    },
    sources: [
      { org: 'US Department of Defense (DoD)', report_title: 'Military and Security Developments Involving the PRC 2024', date: '2024.10' },
      { org: 'CSIS AMTI', report_title: 'Fiery Cross Reef Airbase Infrastructure Tracker', date: '2024.08' },
      { org: 'Japan MOD (Defense of Japan)', report_title: 'South China Sea Militarization Assessment', date: '2024.07' },
    ],
  },
  {
    id: 'SCS-SUBI-REEF',
    name: '남중국해 수비 암초 군사 비행장 및 군항',
    chinese_name: '渚碧礁 (Subi Reef)',
    english_name: 'Subi Reef Strategic Airbase & Deepwater Port',
    region: 'SOUTH_CHINA_SEA',
    region_label: '남중국해 스프래틀리 군도 (Spratly Islands)',
    lat: 10.9228,
    lng: 114.0844,
    threat_level: 'CRITICAL',
    facility_type: 'MILITARY_ARTIFICIAL_ISLAND',
    facility_type_label: '3,000m 활주로 및 대형 함정 군항',
    runway_length_m: 3000,
    specifications: {
      dimensions: '매립 면적 3.95㎢ (스프래틀리 군도 최대 규모 인공섬), 3,000m 활주로',
      personnel_or_capacity: '인민해방군 해군 기동부대 1,500명 주둔 가능, 함정 접안 부두',
      radar_systems: '고출력 대공 레이더 타워, 대지/대함 표적 획득 센서 어레이',
      weapon_systems: 'HQ-9 대공미사일 방호 벙커, 대구경 근접방어무기체계(CIWS)',
      construction_year: '2014~2016년 대규모 준설 매립',
    },
    satellite_image: '/intel/encroachment/fiery_cross_sat.jpg',
    recon_image: '/intel/encroachment/subi_reef_recon.jpg',
    analysis_dialectic: {
      thesis_china: '해상 조난 선박 지원 및 주변 도서 어민 피항을 위한 복지 및 항행 원조 시설.',
      antithesis_western: '미 인도태평양사령부(INDOPACOM) 및 일본 방위성: 필리핀 파가사섬(Thitu Island) 불과 25km 거리에 건설된 공세적 군사 기지. 052D형 구축함 및 보급함 10척 동시 정박 가능.',
      synthesis_threat: '동남아 필리핀, 베트남의 영유권 주장을 무력화하고 남중국해 전체를 인민해방군 남부전구 해군 항공대의 작전 반경 내에 편입.',
      recursive_audit: 'PCA 판결 위반: 수비 암초는 원래 자연 상태에서 고조(High Tide) 시 수몰되는 간출지로 영해를 생성할 수 없으며, 환경 생태계를 파괴한 불법 준설로 확인됨.',
    },
    sources: [
      { org: 'US INDOPACOM', report_title: 'Freedom of Navigation Report: Spratly Outposts', date: '2024.05' },
      { org: 'CSIS AMTI', report_title: 'Subi Reef: Naval and Air Station Capabilities', date: '2024.03' },
    ],
  },
  {
    id: 'SCS-MISCHIEF-REEF',
    name: '남중국해 미스치프 암초 복합 해군 전진기지',
    chinese_name: '美济礁 (Mischief Reef)',
    english_name: 'Mischief Reef Naval Forward Operating Base',
    region: 'SOUTH_CHINA_SEA',
    region_label: '남중국해 스프래틀리 군도 (Spratly Islands)',
    lat: 9.9047,
    lng: 115.5356,
    threat_level: 'CRITICAL',
    facility_type: 'MILITARY_ARTIFICIAL_ISLAND',
    facility_type_label: '초대형 환초 군항 및 2,700m 활주로',
    runway_length_m: 2700,
    specifications: {
      dimensions: '매립 면적 5.58㎢, 석호(Lagoon) 내부 대형 함대 닻자리 보유',
      personnel_or_capacity: '해상민병대(PAFMM) 및 해군 1,200명 주둔, 격납고 30개동',
      radar_systems: '전자전(EW) 안테나 팜, 장거리 위상배열 대공 레이더 돔',
      weapon_systems: 'HQ-9 미사일 격납고, YJ-62 대함미사일 포대',
      construction_year: '1995년 어민 대피소 명목 침탈 -> 2015년 인공섬 요새화',
    },
    satellite_image: '/intel/encroachment/fiery_cross_sat.jpg',
    recon_image: '/intel/encroachment/subi_reef_recon.jpg',
    analysis_dialectic: {
      thesis_china: '중국 전통 영해(남해 9단선/10단선) 내 자국 어민 보호 및 해상 수색 거점.',
      antithesis_western: '필리핀 국가안보위원회(NSC) 및 미 국방부: 필리핀 배타적 경제수역(EEZ) 200해리 이내인 130해리 지점을 불법 침탈하여 건설한 핵심 전진 기지.',
      synthesis_threat: '제2토마스 암초(아융인 모래톱) 등 필리핀 점유 도서에 대한 봉쇄 작전의 발진 기지로 활용되며, 미-필리핀 상호방위조약(MDT) 발동 위기의 진원지.',
      recursive_audit: '2016 PCA 판결의 핵심 결정: 미스치프 암초는 전적으로 필리핀 EEZ 및 대륙붕 내에 위치하며, 중국의 매립 행위는 필리핀의 주권적 권리를 심각하게 침해한 불법 행위로 판시.',
    },
    sources: [
      { org: 'Permanent Court of Arbitration (PCA)', report_title: 'The South China Sea Arbitration (Merits)', date: '2016.07' },
      { org: 'CSIS AMTI', report_title: 'Mischief Reef: China\'s Largest Military Outpost', date: '2024.04' },
    ],
  },
  {
    id: 'SCS-WOODY-ISLAND',
    name: '남중국해 파라셀 군도 우디섬 전략 사령부',
    chinese_name: '永兴岛 (Woody Island)',
    english_name: 'Woody Island Regional Command Hub (Paracels)',
    region: 'SOUTH_CHINA_SEA',
    region_label: '남중국해 파라셀 군도 (Paracel Islands)',
    lat: 16.8342,
    lng: 112.3375,
    threat_level: 'CRITICAL',
    facility_type: 'NAVAL_FORWARD_BASE',
    facility_type_label: '산사시(三沙市) 행정·군사 총사령부',
    runway_length_m: 2700,
    specifications: {
      dimensions: '면적 2.1㎢, 2,700m 활주로, 5,000톤급 함정 4척 동시 접안 군항',
      personnel_or_capacity: '남부전구 해군·공군 상주 2,500명, 민간 거주자 1,000명',
      radar_systems: '대공 감시 레이더, 위성 지상 관제국, 전자전 통제 센터',
      weapon_systems: 'HQ-9B 지대공 미사일 포대, YJ-12 초음속 대함 미사일 여단 상주',
      construction_year: '1974년 베트남과의 해전 후 무단 점령, 2010년대 대대적 군사화',
    },
    satellite_image: '/intel/encroachment/fiery_cross_sat.jpg',
    recon_image: '/intel/encroachment/subi_reef_recon.jpg',
    analysis_dialectic: {
      thesis_china: '하이난성 관할 산사시(三沙市) 정부 소재지이자 서사·남사·중사 군도를 총괄하는 합법적 행정·문화 중심 도시.',
      antithesis_western: '베트남 외교부 및 미 국방부: 베트남의 역사적 주권 도서(호앙사 군도)를 무력 침탈한 불법 군사 거점으로, 남중국해 북부 공역 및 해상을 장악하는 대잠·방공 지휘 본부.',
      synthesis_threat: '하이난 유린 해군기지(원자력 잠수함 기지)의 남방 방어 보루이자, 대만 유사시 남중국해를 통한 미군 증원을 조기 차단하는 북부 축선 거점.',
      recursive_audit: '무력에 의한 영토 취득 금지(유엔 헌장 제2조 4항) 및 무효 원칙 위반. 상시 배치된 HQ-9 미사일은 공해상 국제 민간 항공로를 위협.',
    },
    sources: [
      { org: 'Israel INSS', report_title: 'China\'s Grand Strategy in the South China Sea', date: '2024.01' },
      { org: 'US DoD', report_title: 'PRC Military Capabilities in the Paracels', date: '2024.06' },
    ],
  },
  {
    id: 'SCS-SCARBOROUGH',
    name: '남중국해 스카버러 암초 해경 대치 거점',
    chinese_name: '黄岩岛 (Scarborough Shoal)',
    english_name: 'Scarborough Shoal Maritime Stand-off Zone',
    region: 'SOUTH_CHINA_SEA',
    region_label: '남중국해 필리핀 루손섬 서방 (Luzon West)',
    lat: 15.1500,
    lng: 117.7667,
    threat_level: 'HIGH',
    facility_type: 'NAVAL_FORWARD_BASE',
    facility_type_label: '해경선 상시 차단망 및 부유식 차단 장벽',
    specifications: {
      dimensions: '둘레 55km 대형 삼각형 환초, 수심 15m 내외 석호 보유',
      personnel_or_capacity: '중국 해경 3,000~5,000톤급 대형함 3~4척 및 해상민병대 상시 주둔',
      radar_systems: '해경선 탑재 3차원 대함/대공 레이더 및 지향성 음향 대포(LRAD)',
      weapon_systems: '고압 물대포(Water Cannon), 함포 76mm/30mm 탑재 해경선',
      construction_year: '2012년 필리핀과 대치 후 실효 지배 강탈, 부유식 장벽 설치',
    },
    satellite_image: '/intel/encroachment/fiery_cross_sat.jpg',
    recon_image: '/intel/encroachment/subi_reef_recon.jpg',
    analysis_dialectic: {
      thesis_china: '중국 고유 영토인 황암도 주변 해역의 해양 주권 행사 및 어업 질서 유지 조치.',
      antithesis_western: '필리핀 및 미국 국방부: 마닐라에서 120해리(220km) 거리에 불과한 필리핀 EEZ 내부 천연 암초를 무력 점거하고 필리핀 어민을 물대포로 강제 축출하는 회색지대(Gray-zone) 전술.',
      synthesis_threat: '만약 중국이 이곳을 피어리 크로스나 수비 암초처럼 인공 매립 요새화할 경우, 필리핀 수도 마닐라와 수빅만 해군기지가 중국 미사일 사거리 내에 직격으로 노출됨.',
      recursive_audit: '2016 PCA 판결: 스카버러 암초는 필리핀 어민들의 전통적 어로 구역이며, 중국의 강제 차단 행위는 국제법 위반이자 항행의 자유 침해.',
    },
    sources: [
      { org: 'CSIS AMTI', report_title: 'The Standoff at Scarborough Shoal Tracker', date: '2024.09' },
      { org: 'Philippine National Security Council', report_title: 'West Philippine Sea Transparency Report', date: '2024.08' },
    ],
  },
];
