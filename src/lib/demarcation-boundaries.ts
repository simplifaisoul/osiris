/**
 * 번개의 눈동자 — Military Demarcation Lines & Spatial Boundary Verification System
 * Reference baselines (coordinate sources — not a "100% match" claim):
 * - 1953 Korean Armistice Agreement Land Military Demarcation Line (MDL / DMZ 248km)
 * - West Sea & East Sea Northern Limit Line (NLL / 1953 UNC Established)
 * - Korea Air Defense Identification Zone (KADIZ)
 * - China Air Defense Identification Zone (CADIZ)
 * - China-ROK EEZ Intermediate Boundary
 */

export interface DemarcationLineFeature {
  type: 'Feature';
  geometry: {
    type: 'LineString' | 'Polygon';
    coordinates: number[][] | number[][][];
  };
  properties: {
    id: string;
    name: string;
    domain: 'LAND' | 'SEA' | 'AIR';
    category: 'MDL_DMZ' | 'NLL_SEA' | 'KADIZ_AIR' | 'CADIZ_AIR' | 'CHINA_ROK_EEZ';
    color: string;
    line_dash: number[];
    description: string;
  };
}

export interface SpatialBoundaryVerification {
  zone_code: 'ROK_KADIZ_AIRSPACE' | 'PLA_CADIZ_AIRSPACE' | 'DPRK_DMZ_BORDER_ZONE' | 'WEST_SEA_NLL_ZONE' | 'YELLOW_SEA_EEZ_ZONE' | 'INTERNATIONAL_OPEN_ZONE';
  zone_name: string;
  color: string;
  boundary_description: string;
  is_disputed: boolean;
  closest_boundary_name: string;
  distance_to_boundary_km: number;
}

// 1. 1953 정전협정 육상 군사분계선 (Land MDL / DMZ 248km 정밀 실측 궤적)
// 기점: 경기도 파주시 탄현면 만우리 임진강·한강 합류부 (제0001호 표식) -> 판문점 JSA -> 철원 -> 고성 해금강 (제1292호 표식)
const DMZ_MDL_COORDS: [number, number][] = [
  // MDL 제0001호 표식 기점 (임진강 하구 합류부 중심선)
  [126.740300, 37.772200],
  // 임진강 수로 북상 궤적 (파주시 탄현면 만우리 북단)
  [126.735000, 37.785000],
  [126.728000, 37.810000],
  // 문산읍 마정리 / 임진각 서북방 임진강 수로
  [126.721000, 37.835000],
  [126.715000, 37.860000],
  [126.705000, 37.890000],
  // 장단면 조산리 (자유의 마을 대성동 서방)
  [126.692000, 37.925000],
  [126.681000, 37.945000],
  // 판문점 공동경비구역 (JSA T1~T3 회담장 중앙 실측 군사분계선)
  [126.676700, 37.956100],
  // 판문점 북동방 사천강 합류부
  [126.685000, 37.965000],
  [126.710000, 37.978000],
  [126.745000, 37.988000],
  // 사미천 합류부 (장풍군-연천군 경계)
  [126.760992, 37.992638],
  [
    126.798552,
    38.005298
  ],
  [
    126.819685,
    38.043984
  ],
  [
    126.848692,
    38.077701
  ],
  [
    126.870093,
    38.110936
  ],
  [
    126.895559,
    38.13065
  ],
  [
    126.933397,
    38.148587
  ],
  [
    126.9585,
    38.205937
  ],
  [
    126.995069,
    38.230883
  ],
  [
    127.037147,
    38.273825
  ],
  [
    127.103118,
    38.314348
  ],
  [
    127.130273,
    38.331672
  ],
  [
    127.162212,
    38.328545
  ],
  [
    127.208214,
    38.34056
  ],
  [
    127.28763,
    38.329416
  ],
  [
    127.310851,
    38.335748
  ],
  [
    127.357506,
    38.348994
  ],
  [
    127.429378,
    38.34052
  ],
  [
    127.471542,
    38.335145
  ],
  [
    127.490009,
    38.323857
  ],
  [
    127.514996,
    38.326554
  ],
  [
    127.539777,
    38.334271
  ],
  [
    127.567604,
    38.351957
  ],
  [
    127.619279,
    38.351209
  ],
  [
    127.635328,
    38.338864
  ],
  [
    127.65715,
    38.340409
  ],
  [
    127.697024,
    38.349881
  ],
  [
    127.722147,
    38.348026
  ],
  [
    127.744351,
    38.35994
  ],
  [
    127.772514,
    38.361197
  ],
  [
    127.824407,
    38.33854
  ],
  [
    127.843216,
    38.334325
  ],
  [
    127.870022,
    38.342476
  ],
  [
    127.891822,
    38.342378
  ],
  [
    127.914692,
    38.339199
  ],
  [
    127.969189,
    38.336833
  ],
  [
    128.037244,
    38.330444
  ],
  [
    128.07416,
    38.342644
  ],
  [
    128.102531,
    38.353122
  ],
  [
    128.134281,
    38.366018
  ],
  [
    128.177826,
    38.388816
  ],
  [
    128.200196,
    38.406059
  ],
  [
    128.284665,
    38.51249
  ],
  [
    128.288179,
    38.582273
  ],
  [
    128.304864,
    38.609931
  ],
  [
    128.355454,
    38.632621
  ],
  [
    128.344246,
    38.593356
  ],
  [
    128.341761,
    38.57295
  ],
  [
    128.33913,
    38.528095
  ],
  [
    128.343804,
    38.500203
  ],
  [
    128.333989,
    38.476143
  ],
  [
    128.319396,
    38.454384
  ],
  [
    128.321818,
    38.436555
  ],
  [
    128.309077,
    38.419957
  ],
  [
    128.285014,
    38.40168
  ],
  [
    128.266314,
    38.404219
  ],
  [
    128.269772,
    38.390872
  ],
  [
    128.267521,
    38.37617
  ],
  [
    128.248277,
    38.371091
  ],
  [
    128.224427,
    38.367289
  ],
  [
    128.200209,
    38.352511
  ],
  [
    128.175962,
    38.33665
  ],
  [
    128.156154,
    38.329632
  ],
  [
    128.127501,
    38.330139
  ],
  [
    128.090332,
    38.314956
  ],
  [
    128.058161,
    38.295501
  ],
  [
    128.041036,
    38.294015
  ],
  [
    127.996622,
    38.302146
  ],
  [
    127.962265,
    38.301037
  ],
  [
    127.914962,
    38.311241
  ],
  [
    127.887059,
    38.307004
  ],
  [
    127.87629,
    38.29509
  ],
  [
    127.858842,
    38.282129
  ],
  [
    127.832228,
    38.28064
  ],
  [
    127.814076,
    38.286969
  ],
  [
    127.797998,
    38.296807
  ],
  [
    127.758107,
    38.318739
  ],
  [
    127.722898,
    38.3136
  ],
  [
    127.701308,
    38.309763
  ],
  [
    127.674839,
    38.313502
  ],
  [
    127.648412,
    38.316562
  ],
  [
    127.627841,
    38.308841
  ],
  [
    127.60749,
    38.309509
  ],
  [
    127.582023,
    38.314244
  ],
  [
    127.556096,
    38.308683
  ],
  [
    127.532262,
    38.29571
  ],
  [
    127.505676,
    38.290051
  ],
  [
    127.472256,
    38.300923
  ],
  [
    127.411005,
    38.310959
  ],
  [
    127.326387,
    38.308389
  ],
  [
    127.306675,
    38.31067
  ],
  [
    127.272253,
    38.305484
  ],
  [
    127.17855,
    38.294215
  ],
  [
    127.094614,
    38.267534
  ],
  [
    127.042289,
    38.231399
  ],
  [
    127.005745,
    38.201824
  ],
  [
    126.987017,
    38.164689
  ],
  [
    126.96468,
    38.118204
  ],
  [
    126.932716,
    38.099807
  ],
  [
    126.900121,
    38.088743
  ],
  [
    126.879437,
    38.053397
  ],
  [
    126.874492,
    38.029249
  ],
  [
    126.830649,
    37.986742
  ],
  [
    126.750593,
    37.95505
  ],
  [
    126.706054,
    37.881659
  ],
  [
    126.66933,
    37.943185
  ],
  [
    126.670347,
    37.952861
  ],
  [
    126.670494,
    37.957092
  ],
  [
    126.684086,
    37.957365
  ],
  [
    126.78825,
    37.993159
  ],
  [
    126.864207,
    38.067336
  ],
  [
    126.870991,
    38.078271
  ],
  [
    126.871019,
    38.088869
  ],
  [
    126.877859,
    38.100153
  ],
  [
    126.960808,
    38.133694
  ],
  [
    126.962616,
    38.190611
  ],
  [
    127.110464,
    38.295588
  ],
  [
    127.350691,
    38.32909
  ],
  [
    127.530331,
    38.312925
  ],
  [
    127.70567,
    38.33511
  ],
  [
    127.792926,
    38.330368
  ],
  [
    128.023148,
    38.31619
  ],
  [
    128.151324,
    38.343521
  ],
  [
    128.246095,
    38.406135
  ],
  [
    128.245463,
    38.413931
  ],
  [
    128.255701,
    38.420302
  ],
  [
    128.265028,
    38.424693
  ],
  [
    128.276661,
    38.432834
  ],
  [
    128.278712,
    38.434232
  ],
  [
    128.283543,
    38.437059
  ],
  [
    128.286873,
    38.448039
  ],
  [
    128.292258,
    38.456571
  ],
  [
    128.301888,
    38.47586
  ],
  [
    128.30169,
    38.487429
  ],
  [
    128.302836,
    38.493646
  ],
  [
    128.313289,
    38.523283
  ],
  [
    128.312134,
    38.553981
  ],
  [
    128.312808,
    38.560384
  ],
  [
    128.312262,
    38.561944
  ],
  [
    128.313931,
    38.571492
  ],
  [
    128.312795,
    38.582047
  ],
  [
    128.310739,
    38.587322
  ],
  [
    128.310502,
    38.589822
  ],
  [
    128.313899,
    38.593706
  ],
  [
    128.358864,
    38.615321
  ]
];

// 2. 대한민국 해군/유엔군사령부 공인 서해 북방한계선 (West Sea NLL 실측 궤적)
const WEST_SEA_NLL_COORDS: [number, number][] = [
  [
    124.25,
    38.05
  ],
  [
    124.633333,
    38.05
  ],
  [
    124.85,
    38.0
  ],
  [
    124.858998,
    37.874121
  ],
  [
    124.866667,
    37.766667
  ],
  [
    124.977552,
    37.687367
  ],
  [
    125.047222,
    37.6375
  ],
  [
    125.244443,
    37.58333
  ],
  [
    125.426306,
    37.649215
  ],
  [
    125.516668,
    37.681933
  ],
  [
    125.666667,
    37.690276
  ],
  [
    125.695002,
    37.691664
  ],
  [
    125.750007,
    37.714709
  ],
  [
    126.016671,
    37.658327
  ],
  [
    126.102761,
    37.707702
  ],
  [
    126.111114,
    37.712492
  ],
  // 우도 북방 -> 한강하구 중립수역 공식 수로 중심선 궤적
  [126.183300, 37.650000],
  [126.260000, 37.715000],
  [126.360000, 37.740000],
  [126.460000, 37.755000],
  [126.580000, 37.765000],
  // 임진강-한강 하구 합류부 MDL 제0001호 표식 기점 접점 (1:1 완전 체결)
  [126.740300, 37.772200]
];

// 3. 동해 북방한계선 (East Sea NLL - 고성 해금강 동진 정동선)
const EAST_SEA_NLL_COORDS: [number, number][] = [
  [
    128.3768,
    38.615466
  ],
  [
    128.393209,
    38.615599
  ],
  [
    128.52795,
    38.616686
  ],
  [
    128.653787,
    38.617702
  ],
  [
    129.0,
    38.616
  ],
  [
    130.0,
    38.616
  ],
  [
    131.0,
    38.616
  ],
  [
    132.5,
    38.616
  ]
];

// 4. KADIZ (대한민국 방공식별구역 외곽 경계선)
const KADIZ_POLYGON_COORDS: [number, number][] = [
  [124.0000, 34.4000],
  [124.0000, 38.0000],
  [126.0000, 39.2000],
  [129.0000, 39.2000],
  [131.5000, 38.5000],
  [133.0000, 36.0000],
  [130.0000, 32.5000],
  [125.0000, 32.5000],
  [124.0000, 34.4000],
];

// 5. CADIZ (중국 서해 방공식별구역 경계선)
const CADIZ_LINE_COORDS: [number, number][] = [
  [123.0000, 39.0000],
  [123.0000, 36.0000],
  [124.0000, 32.0000],
  [125.0000, 29.0000],
];

// 6. 한·중 서해 해상 경계선 (China-ROK EEZ Boundary)
const CHINA_ROK_EEZ_COORDS: [number, number][] = [
  [124.2000, 38.5000],
  [124.0000, 36.5000],
  [124.5000, 34.5000],
  [125.2000, 32.0000],
];

// Haversine Distance (km)
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371.0;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function getAllDemarcationGeoJSON(): DemarcationLineFeature[] {
  return [
    {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: DMZ_MDL_COORDS },
      properties: {
        id: 'DMZ-MDL-LAND',
        name: '[DMZ 군사분계선] 1953 MDL (248km)',
        domain: 'LAND',
        category: 'MDL_DMZ',
        color: '#FF1744',
        line_dash: [4, 2],
        description: '1953년 7월 27일 정전협정 육상 군사분계선 (MDL 248km 실측 궤적)',
      }
    },
    {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: WEST_SEA_NLL_COORDS },
      properties: {
        id: 'NLL-WEST-SEA',
        name: '[서해 NLL] 북방한계선 (West Sea NLL)',
        domain: 'SEA',
        category: 'NLL_SEA',
        color: '#00E5FF',
        line_dash: [6, 3],
        description: '서해 5도(백령도·대청도·소청도·연평도·우도) 및 한강 하구 해상 군사분계선 NLL',
      }
    },
    {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: EAST_SEA_NLL_COORDS },
      properties: {
        id: 'NLL-EAST-SEA',
        name: '[동해 NLL] 북방한계선 (East Sea NLL)',
        domain: 'SEA',
        category: 'NLL_SEA',
        color: '#00E5FF',
        line_dash: [6, 3],
        description: '동해 고성 연안 해금강 정동 38도 36분 51초 N 기준 해상 군사분계선 NLL',
      }
    },
    {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: CADIZ_LINE_COORDS },
      properties: {
        id: 'CADIZ-YELLOW-SEA',
        name: '[CADIZ] 중국 서해 방공식별구역 (PLA ADIZ)',
        domain: 'AIR',
        category: 'CADIZ_AIR',
        color: '#FFD600',
        line_dash: [5, 5],
        description: '중국 인민해방군 서해/동중국해 방공식별구역 (CADIZ) 경계선',
      }
    },
    {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: KADIZ_POLYGON_COORDS },
      properties: {
        id: 'KADIZ-ROK-AIR',
        name: '[KADIZ] 대한민국 방공식별구역 (ROK ADIZ)',
        domain: 'AIR',
        category: 'KADIZ_AIR',
        color: '#00E676',
        line_dash: [1, 0],
        description: '대한민국 공군 관리 방공식별구역 (KADIZ) 영공 및 방공 주권 감시 구역',
      }
    },
    {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: CHINA_ROK_EEZ_COORDS },
      properties: {
        id: 'EEZ-CHINA-ROK',
        name: '[한중 EEZ] 서해 해상 경계선 (China-ROK EEZ)',
        domain: 'SEA',
        category: 'CHINA_ROK_EEZ',
        color: '#E040FB',
        line_dash: [3, 3],
        description: '서해 한중 배타적 경제수역(EEZ) 및 잠정조치수역 해상 경계선',
      }
    }
  ];
}

// Spatial Boundary Validator for Any Lat/Lng Coordinates
export function verifyEntitySpatialBoundary(lat: number, lng: number, alt_m: number = 0): SpatialBoundaryVerification {
  // 1. Check Distance to DMZ MDL
  let minDmzDist = 9999;
  for (const pt of DMZ_MDL_COORDS) {
    const d = haversineKm(lat, lng, pt[1], pt[0]);
    if (d < minDmzDist) minDmzDist = d;
  }

  if (minDmzDist <= 15.0) {
    return {
      zone_code: 'DPRK_DMZ_BORDER_ZONE',
      zone_name: '[접경 구역] DMZ 군사분계선 최전방',
      color: '#FF1744',
      boundary_description: `1953 정전협정 군사분계선(MDL) 직전 ${minDmzDist.toFixed(1)}km 접경 비행/지상 구역`,
      is_disputed: true,
      closest_boundary_name: '1953 군사분계선 (MDL)',
      distance_to_boundary_km: Number(minDmzDist.toFixed(2)),
    };
  }

  // 2. Check Distance to West Sea NLL
  let minNllDist = 9999;
  for (const pt of WEST_SEA_NLL_COORDS) {
    const d = haversineKm(lat, lng, pt[1], pt[0]);
    if (d < minNllDist) minNllDist = d;
  }

  if (minNllDist <= 20.0) {
    return {
      zone_code: 'WEST_SEA_NLL_ZONE',
      zone_name: '[해상 경계] 서해 NLL 북방한계선 구역',
      color: '#00E5FF',
      boundary_description: `서해 5도 및 NLL 해상 군사분계선 ${minNllDist.toFixed(1)}km 접경 해역`,
      is_disputed: true,
      closest_boundary_name: '서해 북방한계선 (NLL)',
      distance_to_boundary_km: Number(minNllDist.toFixed(2)),
    };
  }

  // 3. Check Distance to CADIZ (China ADIZ)
  let minCadizDist = 9999;
  for (const pt of CADIZ_LINE_COORDS) {
    const d = haversineKm(lat, lng, pt[1], pt[0]);
    if (d < minCadizDist) minCadizDist = d;
  }

  if (lng <= 124.0 || minCadizDist <= 30.0) {
    return {
      zone_code: 'PLA_CADIZ_AIRSPACE',
      zone_name: '[방공식별] 중국 서해 방공식별구역 (CADIZ)',
      color: '#FFD600',
      boundary_description: `중국 인민해방군 CADIZ 방공식별구역 인접 ${minCadizDist.toFixed(1)}km 서해 공역`,
      is_disputed: true,
      closest_boundary_name: '중국 CADIZ 서해 경계선',
      distance_to_boundary_km: Number(minCadizDist.toFixed(2)),
    };
  }

  // 4. Default: KADIZ
  return {
    zone_code: 'ROK_KADIZ_AIRSPACE',
    zone_name: '[방공식별] 대한민국 방공식별구역 (KADIZ)',
    color: '#00E676',
    boundary_description: '대한민국 공군 방공식별구역(KADIZ) 및 FIR 정보구역 내 정밀 관제 공역',
    is_disputed: false,
    closest_boundary_name: 'KADIZ 외곽 경계선',
    distance_to_boundary_km: Number(minCadizDist.toFixed(2)),
  };
}
