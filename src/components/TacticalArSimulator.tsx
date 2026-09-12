'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Crosshair, 
  Menu,
  X,
  Sun,
  Sliders,
  Play, 
  Pause, 
  RotateCcw, 
  Flame,
  CheckCircle2,
  ZoomIn,
  ZoomOut,
  Volume2,
  VolumeX,
  Target,
  FileText,
  ShieldCheck,
  ClipboardList,
  Award,
  CircleDot,
  PlusCircle,
  Move,
  Send,
  Trash2,
  Compass,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Settings2,
  Sparkles,
  Eye,
  EyeOff,
  ExternalLink,
  Radio,
  Copy,
  Smartphone,
  Monitor,
  Gauge
} from 'lucide-react';

export interface Waypoint {
  x: number;
  y: number;
  altitudeM: number;
}

export interface ManeuverWaypoint {
  id: string;
  index: number;
  x: number;
  y: number;
  headingDeg: number;
  aspectIndex: 0 | 45 | 90 | 135 | 180 | 225 | 270 | 315;
}

export const DEFAULT_VALLEY5_POINTS: ManeuverWaypoint[] = [
  { id: 'WP-1', index: 1, x: 44, y: 84, headingDeg: 45, aspectIndex: 45 },
  { id: 'WP-2', index: 2, x: 40, y: 72, headingDeg: 90, aspectIndex: 90 },
  { id: 'WP-3', index: 3, x: 35, y: 62, headingDeg: 135, aspectIndex: 135 },
  { id: 'WP-4', index: 4, x: 30, y: 52, headingDeg: 180, aspectIndex: 180 },
  { id: 'WP-5', index: 5, x: 38, y: 48, headingDeg: 90, aspectIndex: 90 },
];

export const DEFAULT_RIDGE9_POINTS: ManeuverWaypoint[] = [
  { id: 'WP-1', index: 1, x: 18, y: 60, headingDeg: 45, aspectIndex: 45 },
  { id: 'WP-2', index: 2, x: 26, y: 55, headingDeg: 90, aspectIndex: 90 },
  { id: 'WP-3', index: 3, x: 34, y: 58, headingDeg: 135, aspectIndex: 135 },
  { id: 'WP-4', index: 4, x: 42, y: 64, headingDeg: 90, aspectIndex: 90 },
  { id: 'WP-5', index: 5, x: 50, y: 68, headingDeg: 45, aspectIndex: 45 },
  { id: 'WP-6', index: 6, x: 58, y: 62, headingDeg: 0, aspectIndex: 0 },
  { id: 'WP-7', index: 7, x: 64, y: 52, headingDeg: 315, aspectIndex: 315 },
  { id: 'WP-8', index: 8, x: 70, y: 44, headingDeg: 270, aspectIndex: 270 },
  { id: 'WP-9', index: 9, x: 74, y: 36, headingDeg: 0, aspectIndex: 0 },
];

export interface TacticalTarget {
  id: string;
  code: string;
  name: string;
  category: 'INF' | 'AFV' | 'SPH' | 'CP';
  x: number; // percentage (0 to 100)
  y: number; // percentage (0 to 100)
  destX?: number | null; // target destination x (0 to 100)
  destY?: number | null; // target destination y (0 to 100)
  maneuverPoints?: ManeuverWaypoint[]; // Up to 9 waypoints with saved angles
  currentWpIndex?: number;
  isMoving: boolean;
  speedKmh: number;
  progress: number;
  headingDeg: number;
  aspectIndex: 0 | 45 | 90 | 135 | 180 | 225 | 270 | 315;
  distanceM: number;
  identified: boolean;
  reported: boolean;
  destroyed: boolean;
}

const CLEAN_VALLEY_ROAD_WAYPOINTS: Waypoint[] = [
  { x: 44, y: 84, altitudeM: 110 },
  { x: 42, y: 76, altitudeM: 125 },
  { x: 40, y: 70, altitudeM: 140 },
  { x: 37, y: 63, altitudeM: 160 },
  { x: 33, y: 56, altitudeM: 190 },
  { x: 30, y: 52, altitudeM: 220 },
  { x: 34, y: 48, altitudeM: 250 },
];

const CLEAN_BRIDGE_WAYPOINTS: Waypoint[] = [
  { x: 1, y: 58, altitudeM: 180 },
  { x: 8, y: 58, altitudeM: 180 },
  { x: 16, y: 58, altitudeM: 180 },
  { x: 24, y: 56, altitudeM: 195 },
  { x: 30, y: 52, altitudeM: 220 },
  { x: 34, y: 48, altitudeM: 250 },
];

const CLEAN_URBAN_WAYPOINTS: Waypoint[] = [
  { x: 14, y: 48, altitudeM: 130 },
  { x: 24, y: 53, altitudeM: 115 },
  { x: 34, y: 59, altitudeM: 100 },
  { x: 46, y: 66, altitudeM: 85 },
  { x: 58, y: 65, altitudeM: 80 },
  { x: 74, y: 63, altitudeM: 75 },
];

function computeVehicleAtProgress(progress: number, wps: Waypoint[]) {
  const totalSegments = wps.length - 1;
  if (totalSegments < 1) {
    const singleX = wps[0]?.x ?? 44;
    const singleY = wps[0]?.y ?? 84;
    return {
      currentX: singleX,
      currentY: singleY,
      headingDeg: 48,
      aspectIndex: 90 as const,
      distanceM: 850,
    };
  }
  const currentSegIndex = Math.min(Math.floor(progress * totalSegments), totalSegments - 1);
  const segProgress = (progress * totalSegments) - currentSegIndex;

  const p0 = wps[currentSegIndex];
  const p1 = wps[currentSegIndex + 1] ?? wps[currentSegIndex];

  const currentX = p0.x + (p1.x - p0.x) * segProgress;
  const currentY = p0.y + (p1.y - p0.y) * segProgress;

  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const headingRad = Math.atan2(dx, -dy);
  let headingDeg = (headingRad * 180 / Math.PI + 360) % 360;

  const losDx = currentX - 50;
  const losDy = currentY - 100;
  const losBearing = (Math.atan2(losDx, -losDy) * 180 / Math.PI + 360) % 360;

  const aspect = ((headingDeg - (losBearing + 180)) % 360 + 360) % 360;

  let aspectIndex: 0 | 45 | 90 | 135 | 180 | 225 | 270 | 315 = 90;
  if (aspect >= 337.5 || aspect < 22.5) aspectIndex = 0;
  else if (aspect < 67.5) aspectIndex = 45;
  else if (aspect < 112.5) aspectIndex = 90;
  else if (aspect < 157.5) aspectIndex = 135;
  else if (aspect < 202.5) aspectIndex = 180;
  else if (aspect < 247.5) aspectIndex = 225;
  else if (aspect < 292.5) aspectIndex = 270;
  else aspectIndex = 315;

  const distM = Math.round(720 + (100 - currentY) * 6.5);

  return {
    currentX,
    currentY,
    headingDeg: Math.round(headingDeg),
    aspectIndex,
    distanceM: distM,
  };
}

export function getAspectName(deg: number): string {
  switch (deg) {
    case 0: return '정후면 (북)';
    case 45: return '우후방 (북동)';
    case 90: return '우측면 (동)';
    case 135: return '우전방 (남동)';
    case 180: return '정전면 (남)';
    case 225: return '좌전방 (남서)';
    case 270: return '좌측면 (서)';
    case 315: return '좌후방 (북서)';
    default: return `${deg}°`;
  }
}

export function getVehicle3dStyle(aspectIndex: number, distanceM: number, destroyed: boolean) {
  const baseScale = Math.max(0.65, Math.min(1.2, (1150 - distanceM) / 500));
  
  let transform3d = '';
  switch (aspectIndex) {
    case 0: // 정후면 (북향)
      transform3d = `perspective(450px) rotateX(28deg) scale(${baseScale * 0.75}, ${baseScale * 0.92}) translateY(-3px)`;
      break;
    case 45: // 우후방 (북동향)
      transform3d = `perspective(450px) rotateY(-40deg) rotateX(14deg) scale(${baseScale * 0.84}, ${baseScale * 0.92})`;
      break;
    case 90: // 정측면 우향 (동향)
      transform3d = `perspective(450px) rotateY(0deg) scale(${baseScale}, ${baseScale})`;
      break;
    case 135: // 우전방 (남동향)
      transform3d = `perspective(450px) rotateY(36deg) rotateX(-12deg) scale(${baseScale * 0.92}, ${baseScale * 1.05}) translateY(2px)`;
      break;
    case 180: // 정전면 (남향)
      transform3d = `perspective(450px) rotateX(-26deg) scale(${baseScale * 0.72}, ${baseScale * 0.98}) translateY(4px)`;
      break;
    case 225: // 좌전방 (남서향)
      transform3d = `perspective(450px) scaleX(-1) rotateY(36deg) rotateX(-12deg) scale(${baseScale * 0.92}, ${baseScale * 1.05}) translateY(2px)`;
      break;
    case 270: // 정측면 좌향 (서향)
      transform3d = `perspective(450px) scaleX(-1) rotateY(0deg) scale(${baseScale}, ${baseScale})`;
      break;
    case 315: // 좌후방 (북서향)
      transform3d = `perspective(450px) scaleX(-1) rotateY(-40deg) rotateX(14deg) scale(${baseScale * 0.84}, ${baseScale * 0.92})`;
      break;
    default:
      transform3d = `scale(${baseScale})`;
  }

  return {
    transform: transform3d,
    transformOrigin: '50% 85%',
    transition: 'transform 0.35s cubic-bezier(0.2, 0.9, 0.3, 1.2)',
    filter: destroyed 
      ? 'grayscale(1) brightness(0.25)' 
      : 'drop-shadow(0 8px 12px rgba(0,0,0,0.85)) drop-shadow(0 2px 4px rgba(0,0,0,0.9))',
  };
}

export default function TacticalArSimulator({ forcedRole }: { forcedRole?: 'instructor' | 'trainee' } = {}) {
  // Role: 'instructor' (교관용) vs 'trainee' (교육생용)
  const [role, setRole] = useState<'trainee' | 'instructor'>(forcedRole || 'instructor');

  // 🛡️ Tactical Command Harness: Explicit Commit & Sync State
  const [hasUnsyncedChanges, setHasUnsyncedChanges] = useState<boolean>(false);
  const [harnessSyncedAt, setHarnessSyncedAt] = useState<string | null>('기본 전술 세팅');
  const [currentOrigin, setCurrentOrigin] = useState<string>('https://classroom-entities-wendy-multimedia.trycloudflare.com');

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.origin) {
      setCurrentOrigin(window.location.origin);
    }
  }, []);

  // Background Mode
  const [bgMode, setBgMode] = useState<'mountain' | 'urban' | 'camera'>('mountain');
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

  // Vision Filter
  const [dayNightMode, setDayNightMode] = useState<'day' | 'night' | 'flir'>('day');

  // Zoom Level (1.0x to 3.0x)
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);

  // Right Side Panel Tab: 'inspector' (선택 표적 제어) vs 'placement' (새 표적 배치) vs 'score' (교관 평가) vs 'menu' (전체 기동)
  const [rightPanelTab, setRightPanelTab] = useState<'inspector' | 'placement' | 'score' | 'menu'>('inspector');
  const [rightPanelOpen, setRightPanelOpen] = useState<boolean>(true);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setRightPanelOpen(forcedRole !== 'trainee' || window.innerWidth >= 1024);
  }, [forcedRole]);
  const [uiVisible, setUiVisible] = useState<boolean>(true);

  // Active Bottom Navigation Step (1 to 5)
  const [activeStep, setActiveStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  // Simulation Controls
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [masterSpeedKmh, setMasterSpeedKmh] = useState<number>(20);
  const [waypoints, setWaypoints] = useState<Waypoint[]>(CLEAN_VALLEY_ROAD_WAYPOINTS);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Selected Target ID
  const [selectedTargetId, setSelectedTargetId] = useState<string>('SPH-01');

  // Dragging State for Real-Time Target Movement
  const [draggingTargetId, setDraggingTargetId] = useState<string | null>(null);

  // Instructor selecting destination on stage
  const [isSelectingDestination, setIsSelectingDestination] = useState<boolean>(false);

  // Instructor adding up to 9 Waypoints with custom angles
  const [isAdding9Waypoints, setIsAdding9Waypoints] = useState<boolean>(false);

  // 📍 Instructor selecting any target and relocating its position by clicking stage
  const [isRelocatingTarget, setIsRelocatingTarget] = useState<boolean>(false);

  // 🛡️ Tactical Command Harness: Locked by default (prevents arbitrary movement)
  const [harnessLocked, setHarnessLocked] = useState<boolean>(true);
  const lastSessionVersionRef = useRef<number>(0);

  // 📡 Real-time Sync Information Modal & Last Sync Timestamp
  const [showSyncModal, setShowSyncModal] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>('방금 전');

  // Target Placement Category for Instructor
  const [placingCategory, setPlacingCategory] = useState<'SPH' | 'AFV' | 'CP' | 'INF'>('SPH');

  // Mission State
  const [cffState, setCffState] = useState<'STANDBY' | 'TRANSMITTING' | 'SHOT' | 'SPLASH' | 'DESTROYED'>('STANDBY');
  const [cffEta, setCffEta] = useState<number>(4);

  // Scores
  const [scores, setScores] = useState({
    identification: 18,
    report: 17,
    callForFire: 17,
    safety: 16,
    bda: 17,
  });
  const [instructorFeedback, setInstructorFeedback] = useState<string>(
    '전반적으로 우수합니다. 표적 식별 정확도를 더 향상시켜 보세요.'
  );

  const totalScore = scores.identification + scores.report + scores.callForFire + scores.safety + scores.bda;

  // 🎯 교관이 직접 선정한 최초 시작 기준 위치 (임의 지정 금지 - 교관 명령에 의해서만 기동 설정)
  const [targets, setTargets] = useState<TacticalTarget[]>([
    {
      id: 'AFV-01',
      code: 'AFV-01',
      name: '교육용 가상 표적 AFV-01 (기동 장갑차)',
      category: 'AFV',
      x: 44,
      y: 84,
      isMoving: false,
      speedKmh: 24,
      progress: 0.58,
      headingDeg: 45,
      aspectIndex: 45,
      distanceM: 870,
      identified: true,
      reported: true,
      destroyed: false,
      maneuverPoints: DEFAULT_VALLEY5_POINTS,
      currentWpIndex: 0,
    },
    {
      id: 'SPH-01',
      code: 'SPH-01',
      name: '교육용 가상 표적 SPH-01',
      category: 'SPH',
      x: 34,
      y: 50,
      isMoving: false,
      speedKmh: 20,
      progress: 0.40,
      headingDeg: 280,
      aspectIndex: 90,
      distanceM: 1045,
      identified: true,
      reported: false,
      destroyed: false,
      maneuverPoints: DEFAULT_VALLEY5_POINTS,
      currentWpIndex: 0,
    },
    {
      id: 'CP-01',
      code: 'CP-01',
      name: '교육용 가상 표적 CP-01',
      category: 'CP',
      x: 64,
      y: 64,
      isMoving: false,
      speedKmh: 0,
      progress: 0,
      headingDeg: 0,
      aspectIndex: 0,
      distanceM: 954,
      identified: true,
      reported: false,
      destroyed: false,
      maneuverPoints: [],
    },
    {
      id: 'INF-01',
      code: 'INF-01',
      name: '교육용 가상 표적 INF-01',
      category: 'INF',
      x: 28,
      y: 71,
      isMoving: false,
      speedKmh: 0,
      progress: 0,
      headingDeg: 180,
      aspectIndex: 0,
      distanceM: 909,
      identified: false,
      reported: false,
      destroyed: false,
      maneuverPoints: [],
    },
  ]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const broadcastRef = useRef<BroadcastChannel | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3200);
  };

  // Sound Engine
  const playTacticalSound = useCallback((type: 'lase' | 'shot' | 'splash' | 'click') => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!audioCtxRef.current) audioCtxRef.current = new AudioCtx();
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      if (type === 'lase') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(2400, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.12);
      } else if (type === 'shot') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(1800, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 3.8);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 3.6);
        gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 3.8);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 3.8);
      } else if (type === 'splash') {
        const bufferSize = ctx.sampleRate * 1.5;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.4));
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(220, ctx.currentTime);
        filter.frequency.linearRampToValueAtTime(40, ctx.currentTime + 1.2);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.4, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.4);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        noise.start();
      } else if (type === 'click') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.05);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.05);
      }
    } catch (e) {
      console.warn('Web Audio error:', e);
    }
  }, [soundEnabled]);

  // Instant and bulletproof role switchers (0ms in-memory React state update)
  const roleRef = useRef<'trainee' | 'instructor'>(forcedRole || 'instructor');
  roleRef.current = role;

  const switchToTrainee = useCallback(() => {
    playTacticalSound('click');
    setRole('trainee');
    setRightPanelTab('score');
    if (typeof window !== 'undefined') {
      try {
        window.history.pushState(null, '', '/tactical-ar/trainee');
      } catch {}
    }
    showToast('👨‍🎓 [교육생 모드 전환 완료] 표적 제어 권한이 차단된 실전 관측 훈련장으로 전환되었습니다.');
  }, [playTacticalSound]);

  const switchToInstructor = useCallback(() => {
    playTacticalSound('click');
    setRole('instructor');
    setRightPanelTab('inspector');
    if (typeof window !== 'undefined') {
      try {
        window.history.pushState(null, '', '/tactical-ar/instructor');
      } catch {}
    }
    showToast('🎖️ [교관 모드 전환 완료] 표적 배치 및 통제 권한이 활성화되었습니다.');
  }, [playTacticalSound]);

  // 🚀 HARNESS COMMIT: Explicit sync from Instructor to Trainee
  const commitHarnessToTrainee = useCallback(() => {
    playTacticalSound('lase');
    const syncTime = new Date().toLocaleTimeString();
    setHarnessSyncedAt(syncTime);
    setHasUnsyncedChanges(false);

    const payload = {
      targets,
      scores,
      feedback: instructorFeedback,
      bgMode,
      speedKmh: masterSpeedKmh,
      waypoints,
      isPlaying,
      harnessLocked,
      syncedAt: syncTime,
    };

    if (broadcastRef.current) {
      broadcastRef.current.postMessage({ type: 'HARNESS_COMMIT_SYNC', payload });
    }

    fetch('/api/tactical/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {});

    showToast(`🚀 [전술 하네스 일치화 전송 완료] 교관이 설정한 표적 위치, 기동로, 속도, 각도, 배경이 교육생 화면에 즉시 동기화되었습니다!`);
  }, [bgMode, harnessLocked, instructorFeedback, isPlaying, masterSpeedKmh, playTacticalSound, scores, targets, waypoints]);

  // Backward-compatible broadcast helper (marks changes as unsynced in instructor mode)
  const broadcastUpdate = useCallback((
    updatedTargets: TacticalTarget[], 
    updatedScores?: typeof scores, 
    updatedFeedback?: string,
    updatedBgMode?: 'mountain' | 'urban' | 'camera'
  ) => {
    setHasUnsyncedChanges(true);
  }, []);

  // Setup BroadcastChannel & Periodic Sync
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('role') === 'instructor') {
        setRole('instructor');
      } else if (params.get('role') === 'trainee') {
        setRole('trainee');
      }
    }

    // Immediate initial sync fetch on mount
    fetch('/api/tactical/session')
      .then(res => res.json())
      .then(data => {
        if (data?.status === 'ok' && data.session) {
          const s = data.session;
          lastSessionVersionRef.current = s.version;
          if (s.targets) setTargets(s.targets);
          if (s.scores) setScores(s.scores);
          if (s.feedback) setInstructorFeedback(s.feedback);
          if (s.bgMode) setBgMode(s.bgMode);
          if (s.speedKmh) setMasterSpeedKmh(s.speedKmh);
          if (s.waypoints) setWaypoints(s.waypoints);
          if (roleRef.current === 'trainee') {
            if (s.isPlaying !== undefined) setIsPlaying(s.isPlaying);
            if (s.harnessLocked !== undefined) setHarnessLocked(s.harnessLocked);
          }
          setLastSyncTime(new Date(s.updatedAt || Date.now()).toLocaleTimeString());
        }
      })
      .catch(() => {});

    try {
      const channel = new BroadcastChannel('tactical_sync_channel');
      broadcastRef.current = channel;
      channel.onmessage = (event) => {
        if ((event.data?.type === 'HARNESS_COMMIT_SYNC' || event.data?.type === 'TACTICAL_SYNC') && event.data.payload) {
          const p = event.data.payload;
          if (roleRef.current === 'trainee') {
            if (p.targets) setTargets(p.targets);
            if (p.scores) setScores(p.scores);
            if (p.feedback) setInstructorFeedback(p.feedback);
            if (p.bgMode) setBgMode(p.bgMode);
            if (p.speedKmh) setMasterSpeedKmh(p.speedKmh);
            if (p.waypoints) setWaypoints(p.waypoints);
            if (p.isPlaying !== undefined) setIsPlaying(p.isPlaying);
            if (p.harnessLocked !== undefined) setHarnessLocked(p.harnessLocked);
            setLastSyncTime(p.syncedAt || new Date().toLocaleTimeString());
            playTacticalSound('click');
            showToast('📡 [하네스 일치화 수신] 교관의 표적 설정 및 기동로가 일치화되었습니다.');
          }
        }
      };
    } catch (e) {
      console.warn('BroadcastChannel not supported', e);
    }

    const pollInterval = setInterval(() => {
      if (roleRef.current === 'trainee') {
        fetch('/api/tactical/session')
          .then(res => res.json())
          .then(data => {
            if (data?.status === 'ok' && data.session) {
              const s = data.session;
              if (s.version !== lastSessionVersionRef.current) {
                lastSessionVersionRef.current = s.version;
                if (s.targets) setTargets(s.targets);
                if (s.scores) setScores(s.scores);
                if (s.feedback) setInstructorFeedback(s.feedback);
                if (s.bgMode) setBgMode(s.bgMode);
                if (s.speedKmh) setMasterSpeedKmh(s.speedKmh);
                if (s.waypoints) setWaypoints(s.waypoints);
                if (s.isPlaying !== undefined) setIsPlaying(s.isPlaying);
                if (s.harnessLocked !== undefined) setHarnessLocked(s.harnessLocked);
                setLastSyncTime(new Date(s.updatedAt || Date.now()).toLocaleTimeString());
              }
            }
          })
          .catch(() => {});
      }
    }, 1200);

    return () => {
      clearInterval(pollInterval);
      if (broadcastRef.current) broadcastRef.current.close();
    };
  }, [role]);

  // Target Update Helper
  const updateTarget = useCallback((targetId: string, updates: Partial<TacticalTarget>) => {
    setTargets(prev => {
      const next = prev.map(t => {
        if (t.id === targetId) {
          return { ...t, ...updates };
        }
        return t;
      });
      broadcastUpdate(next);
      return next;
    });
  }, [broadcastUpdate]);

  // Delete Target Helper
  const deleteTarget = useCallback((targetId: string) => {
    playTacticalSound('click');
    setTargets(prev => {
      const next = prev.filter(t => t.id !== targetId);
      if (selectedTargetId === targetId && next[0]) {
        setSelectedTargetId(next[0].id);
      }
      broadcastUpdate(next);
      return next;
    });
    showToast('🗑️ 해당 표적이 삭제되었습니다.');
  }, [broadcastUpdate, playTacticalSound, selectedTargetId]);

  // Update Aspect Angle for a specific Waypoint (WP-1 ~ WP-9)
  const updateWaypointAngle = useCallback((targetId: string, wpIndex: number, aspect: 0 | 45 | 90 | 135 | 180 | 225 | 270 | 315) => {
    playTacticalSound('click');
    setTargets(prev => {
      const next = prev.map(t => {
        if (t.id === targetId && t.maneuverPoints) {
          const nextPts = t.maneuverPoints.map(wp => {
            if (wp.index === wpIndex) {
              return { ...wp, aspectIndex: aspect, headingDeg: aspect };
            }
            return wp;
          });
          return { ...t, maneuverPoints: nextPts };
        }
        return t;
      });
      broadcastUpdate(next);
      return next;
    });
    showToast(`🧭 [WP-${wpIndex}] 지점의 표적 각도가 ${aspect}°로 저장되었습니다.`);
  }, [broadcastUpdate, playTacticalSound]);

  // Remove single waypoint from the 9-waypoint list
  const removeWaypoint = useCallback((targetId: string, wpIndex: number) => {
    playTacticalSound('click');
    setTargets(prev => {
      const next = prev.map(t => {
        if (t.id === targetId && t.maneuverPoints) {
          const filtered = t.maneuverPoints.filter(wp => wp.index !== wpIndex);
          const reindexed = filtered.map((wp, i) => ({ ...wp, index: i + 1, id: `WP-${i + 1}` }));
          return { ...t, maneuverPoints: reindexed, currentWpIndex: 0 };
        }
        return t;
      });
      broadcastUpdate(next);
      return next;
    });
    showToast(`🗑️ [WP-${wpIndex}] 기동 지점이 삭제되었습니다.`);
  }, [broadcastUpdate, playTacticalSound]);

  // Load Preset Tactical 9-Waypoint Courses
  const loadPreset9Waypoints = useCallback((targetId: string, preset: 'valley5' | 'ridge9') => {
    playTacticalSound('click');
    let pts: ManeuverWaypoint[] = [];
    if (preset === 'valley5') {
      pts = [
        { id: 'WP-1', index: 1, x: 44, y: 84, headingDeg: 45, aspectIndex: 45 },
        { id: 'WP-2', index: 2, x: 40, y: 72, headingDeg: 90, aspectIndex: 90 },
        { id: 'WP-3', index: 3, x: 35, y: 62, headingDeg: 135, aspectIndex: 135 },
        { id: 'WP-4', index: 4, x: 30, y: 52, headingDeg: 180, aspectIndex: 180 },
        { id: 'WP-5', index: 5, x: 38, y: 48, headingDeg: 90, aspectIndex: 90 },
      ];
    } else {
      pts = [
        { id: 'WP-1', index: 1, x: 18, y: 60, headingDeg: 45, aspectIndex: 45 },
        { id: 'WP-2', index: 2, x: 26, y: 55, headingDeg: 90, aspectIndex: 90 },
        { id: 'WP-3', index: 3, x: 34, y: 58, headingDeg: 135, aspectIndex: 135 },
        { id: 'WP-4', index: 4, x: 42, y: 64, headingDeg: 90, aspectIndex: 90 },
        { id: 'WP-5', index: 5, x: 50, y: 68, headingDeg: 45, aspectIndex: 45 },
        { id: 'WP-6', index: 6, x: 58, y: 62, headingDeg: 0, aspectIndex: 0 },
        { id: 'WP-7', index: 7, x: 64, y: 52, headingDeg: 315, aspectIndex: 315 },
        { id: 'WP-8', index: 8, x: 70, y: 44, headingDeg: 270, aspectIndex: 270 },
        { id: 'WP-9', index: 9, x: 74, y: 36, headingDeg: 0, aspectIndex: 0 },
      ];
    }

    setHarnessLocked(false);
    setIsPlaying(true);
    setTargets(prev => {
      const next = prev.map(t => {
        if (t.id === targetId) {
          return {
            ...t,
            maneuverPoints: pts,
            currentWpIndex: 0,
            isMoving: true,
          };
        }
        return t;
      });
      broadcastUpdate(next);
      return next;
    });
    showToast(preset === 'valley5' ? '🛣️ 계곡 도로 5개소 정밀 기동 경로 및 각도가 설정되었습니다.' : '🌲 산림 능선 9개소 전술 포위 기동 경로 및 각도가 설정되었습니다!');
  }, [broadcastUpdate, playTacticalSound]);

  // Camera stream cleanup
  useEffect(() => {
    if (bgMode === 'camera') {
      navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } })
        .then(stream => {
          setCameraStream(stream);
          if (videoRef.current) videoRef.current.srcObject = stream;
        })
        .catch(() => setBgMode('mountain'));
    } else {
      if (cameraStream) {
        cameraStream.getTracks().forEach(t => t.stop());
        setCameraStream(null);
      }
    }
    return () => {
      if (cameraStream) cameraStream.getTracks().forEach(t => t.stop());
    };
  }, [bgMode]);

  // Moving Vehicle Animation Loop (Governed strictly by Tactical Command Harness)
  useEffect(() => {
    // If Harness is locked or simulation paused, NO vehicle moves on its own
    if (!isPlaying || harnessLocked) return;

    const interval = setInterval(() => {
      setTargets(prevTargets => {
        return prevTargets.map(t => {
          if (!t.isMoving || t.destroyed) return t;

          // Priority 0: 9-Waypoint Sequential Route Maneuver (Instructor Commanded)
          if (t.maneuverPoints && t.maneuverPoints.length > 0) {
            const wpIndex = t.currentWpIndex ?? 0;
            const targetWp = t.maneuverPoints[wpIndex];

            if (targetWp) {
              const dx = targetWp.x - t.x;
              const dy = targetWp.y - t.y;
              const dist = Math.hypot(dx, dy);

              // Waypoint arrival threshold (within 0.9% distance)
              if (dist < 0.9) {
                const nextIndex = wpIndex + 1;
                if (nextIndex < t.maneuverPoints.length) {
                  return {
                    ...t,
                    x: targetWp.x,
                    y: targetWp.y,
                    headingDeg: targetWp.headingDeg,
                    aspectIndex: targetWp.aspectIndex,
                    currentWpIndex: nextIndex,
                    isMoving: true,
                  };
                } else {
                  // Reached the final commanded waypoint -> Loop back to WP 0 for continuous tactical patrol
                  return {
                    ...t,
                    x: targetWp.x,
                    y: targetWp.y,
                    headingDeg: targetWp.headingDeg,
                    aspectIndex: targetWp.aspectIndex,
                    currentWpIndex: 0,
                    isMoving: true,
                  };
                }
              }

              const currentSpeed = t.speedKmh ?? masterSpeedKmh ?? 24;
              if (currentSpeed <= 0) {
                return { ...t, isMoving: false };
              }
              const step = Math.max(0.15, (currentSpeed / 20) * 0.25);
              const moveRatio = Math.min(1, step / dist);
              const nextX = t.x + dx * moveRatio;
              const nextY = t.y + dy * moveRatio;

              const headingRad = Math.atan2(dx, -dy);
              let headingDeg = (headingRad * 180 / Math.PI + 360) % 360;

              const losDx = nextX - 50;
              const losDy = nextY - 100;
              const losBearing = (Math.atan2(losDx, -losDy) * 180 / Math.PI + 360) % 360;
              const aspect = ((headingDeg - (losBearing + 180)) % 360 + 360) % 360;

              let aspectIndex: 0 | 45 | 90 | 135 | 180 | 225 | 270 | 315 = 90;
              if (aspect >= 337.5 || aspect < 22.5) aspectIndex = 0;
              else if (aspect < 67.5) aspectIndex = 45;
              else if (aspect < 112.5) aspectIndex = 90;
              else if (aspect < 157.5) aspectIndex = 135;
              else if (aspect < 202.5) aspectIndex = 180;
              else if (aspect < 247.5) aspectIndex = 225;
              else if (aspect < 292.5) aspectIndex = 270;
              else aspectIndex = 315;

              const distM = Math.round(720 + (100 - nextY) * 6.5);

              return {
                ...t,
                x: nextX,
                y: nextY,
                headingDeg: Math.round(headingDeg),
                aspectIndex,
                distanceM: distM,
              };
            }
          }

          // Priority 1: Maneuvering towards specific selected destination point (Instructor Commanded)
          if (t.destX != null && t.destY != null) {
            const dx = t.destX - t.x;
            const dy = t.destY - t.y;
            const dist = Math.hypot(dx, dy);

            if (dist < 0.8) {
              return {
                ...t,
                x: t.destX,
                y: t.destY,
                destX: null,
                destY: null,
                isMoving: false,
              };
            }

            const currentSpeed = t.speedKmh ?? masterSpeedKmh;
            if (currentSpeed <= 0) {
              return { ...t, isMoving: false };
            }
            const step = (currentSpeed / 20) * 0.22;
            const moveRatio = Math.min(1, step / dist);
            const nextX = t.x + dx * moveRatio;
            const nextY = t.y + dy * moveRatio;

            const headingRad = Math.atan2(dx, -dy);
            let headingDeg = (headingRad * 180 / Math.PI + 360) % 360;

            const losDx = nextX - 50;
            const losDy = nextY - 100;
            const losBearing = (Math.atan2(losDx, -losDy) * 180 / Math.PI + 360) % 360;
            const aspect = ((headingDeg - (losBearing + 180)) % 360 + 360) % 360;

            let aspectIndex: 0 | 45 | 90 | 135 | 180 | 225 | 270 | 315 = 90;
            if (aspect >= 337.5 || aspect < 22.5) aspectIndex = 0;
            else if (aspect < 67.5) aspectIndex = 45;
            else if (aspect < 112.5) aspectIndex = 90;
            else if (aspect < 157.5) aspectIndex = 135;
            else if (aspect < 202.5) aspectIndex = 180;
            else if (aspect < 247.5) aspectIndex = 225;
            else if (aspect < 292.5) aspectIndex = 270;
            else aspectIndex = 315;

            const distM = Math.round(720 + (100 - nextY) * 6.5);

            return {
              ...t,
              x: nextX,
              y: nextY,
              headingDeg: Math.round(headingDeg),
              aspectIndex,
              distanceM: distM,
            };
          }

          // Fallback: If target is set to moving but has no specific route, assign DEFAULT_VALLEY5_POINTS
          if ((!t.maneuverPoints || t.maneuverPoints.length === 0) && t.destX == null) {
            return {
              ...t,
              maneuverPoints: DEFAULT_VALLEY5_POINTS,
              currentWpIndex: 0,
              isMoving: true,
            };
          }

          return {
            ...t,
            isMoving: false,
          };
        });
      });
    }, 50);

    return () => clearInterval(interval);
  }, [isPlaying, harnessLocked, masterSpeedKmh]);

  const currentTarget = targets.find(t => t.id === selectedTargetId) || targets[0];

  // Stage Click for adding target, setting 9 waypoints, or single destination (Instructor only)
  const handleStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (role !== 'instructor') return;
    if (!stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);

    // 0. Instructor adding up to 9 Waypoints with custom saved angles
    if (isAdding9Waypoints && role === 'instructor' && currentTarget) {
      playTacticalSound('lase');
      const currentPts = currentTarget.maneuverPoints || [];
      if (currentPts.length >= 9) {
        showToast('⚠️ 최대 9개소까지만 기동 지점을 등록할 수 있습니다.');
        setIsAdding9Waypoints(false);
        return;
      }

      const nextIdx = currentPts.length + 1;
      const newWp: ManeuverWaypoint = {
        id: `WP-${nextIdx}`,
        index: nextIdx,
        x,
        y,
        headingDeg: 90,
        aspectIndex: 90,
      };

      const updatedPts = [...currentPts, newWp];
      const updated = targets.map(t => {
        if (t.id === currentTarget.id) {
          return {
            ...t,
            maneuverPoints: updatedPts,
            currentWpIndex: 0,
          };
        }
        return t;
      });
      setTargets(updated);
      broadcastUpdate(updated);

      if (updatedPts.length >= 9) {
        setIsAdding9Waypoints(false);
        showToast(`🏁 [완료] 최대 9개소 기동 지점 등록이 완료되었습니다! 각 지점별 각도를 설정하세요.`);
      } else {
        showToast(`📍 [WP-${nextIdx}] 기동 지점 (${x}%, ${y}%) 등록됨 (현재 ${updatedPts.length}/9개소)`);
      }
      return;
    }

    // 0. Instructor directly designating/relocating selected target location on stage
    if (isRelocatingTarget && role === 'instructor' && currentTarget) {
      playTacticalSound('lase');
      setIsRelocatingTarget(false);
      const distM = Math.round(720 + (100 - y) * 6.5);
      const updated = targets.map(t => {
        if (t.id === currentTarget.id) {
          return {
            ...t,
            x,
            y,
            distanceM: distM,
            destX: null,
            destY: null,
            isMoving: false,
          };
        }
        return t;
      });
      setTargets(updated);
      broadcastUpdate(updated);
      showToast(`🎯 [위치 지정 완료] ${currentTarget.name}의 위치가 (${x}%, ${y}%)로 지정되었습니다!`);
      return;
    }

    // 1. Instructor setting specific movement point for selected target
    if (isSelectingDestination && role === 'instructor' && currentTarget) {
      playTacticalSound('lase');
      setIsSelectingDestination(false);
      const updated = targets.map(t => {
        if (t.id === currentTarget.id) {
          return {
            ...t,
            destX: x,
            destY: y,
            isMoving: true,
          };
        }
        return t;
      });
      setTargets(updated);
      broadcastUpdate(updated);
      showToast(`🚀 [기동 명령] ${currentTarget.name}의 기동 지점이 (${x}%, ${y}%)로 지정되어 이동을 시작합니다!`);
      return;
    }

    // 2. Instructor placing new target
    if (role === 'instructor' && rightPanelTab === 'placement') {
      playTacticalSound('lase');
      const distM = Math.round(720 + (100 - y) * 6.5);
      const nextIndex = targets.filter(t => t.category === placingCategory).length + 1;
      const idNum = String(nextIndex).padStart(2, '0');

      const newTarget: TacticalTarget = {
        id: `${placingCategory}-${Date.now().toString().slice(-4)}`,
        code: `${placingCategory}-${idNum}`,
        name: `교육용 가상 표적 ${placingCategory}-${idNum}`,
        category: placingCategory,
        x,
        y,
        isMoving: placingCategory === 'AFV',
        speedKmh: 20,
        progress: 0.5,
        headingDeg: 48,
        aspectIndex: 90,
        distanceM: distM,
        identified: true,
        reported: false,
        destroyed: false,
      };

      const updated = [...targets, newTarget];
      setTargets(updated);
      setSelectedTargetId(newTarget.id);
      setRightPanelTab('inspector');
      broadcastUpdate(updated);
      showToast(`🎯 [교관] ${newTarget.name} (${x}%, ${y}%) 배치 완료!`);
    }
  };

  // Dragging movement
  const handleStagePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingTargetId || !stageRef.current || role !== 'instructor') return;
    const rect = stageRef.current.getBoundingClientRect();
    const x = Math.max(5, Math.min(95, Math.round(((e.clientX - rect.left) / rect.width) * 100)));
    const y = Math.max(20, Math.min(95, Math.round(((e.clientY - rect.top) / rect.height) * 100)));
    const distM = Math.round(720 + (100 - y) * 6.5);

    setTargets(prev => prev.map(t => {
      if (t.id === draggingTargetId) {
        return { ...t, x, y, distanceM: distM };
      }
      return t;
    }));
  };

  const handleStagePointerUp = () => {
    if (draggingTargetId) {
      setDraggingTargetId(null);
      broadcastUpdate(targets);
      showToast('📍 표적 위치가 업데이트되었습니다.');
    }
  };

  // Trainee Call for Fire
  const startCallForFire = () => {
    if (cffState !== 'STANDBY' || !currentTarget) return;
    playTacticalSound('lase');
    setCffState('TRANSMITTING');
    setActiveStep(3);

    setTimeout(() => {
      setCffState('SHOT');
      setCffEta(4);
      playTacticalSound('shot');

      const countdown = setInterval(() => {
        setCffEta(prev => {
          if (prev <= 1) {
            clearInterval(countdown);
            setCffState('SPLASH');
            playTacticalSound('splash');

            setTimeout(() => {
              const updated = targets.map(t => t.id === currentTarget.id ? { ...t, destroyed: true } : t);
              setTargets(updated);
              setCffState('DESTROYED');
              setActiveStep(5);
              const updatedScores = { ...scores, callForFire: 20, bda: 20 };
              setScores(updatedScores);
              broadcastUpdate(updated, updatedScores);
            }, 1200);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }, 1200);
  };

  // Road Waypoint Reset
  const resetRoadWaypoints = (preset?: 'valley' | 'bridge') => {
    playTacticalSound('click');
    let targetWps = CLEAN_VALLEY_ROAD_WAYPOINTS;
    if (bgMode === 'mountain') {
      targetWps = preset === 'bridge' ? CLEAN_BRIDGE_WAYPOINTS : CLEAN_VALLEY_ROAD_WAYPOINTS;
    } else {
      targetWps = CLEAN_URBAN_WAYPOINTS;
    }
    setWaypoints(targetWps);

    const updated = targets.map(t => {
      if (t.isMoving) {
        const pos = computeVehicleAtProgress(0.55, targetWps);
        return { ...t, progress: 0.55, x: pos.currentX, y: pos.currentY, headingDeg: pos.headingDeg, aspectIndex: pos.aspectIndex, distanceM: pos.distanceM, destroyed: false };
      }
      return { ...t, destroyed: false };
    });
    setTargets(updated);
    broadcastUpdate(updated);

    setIsPlaying(true);
    setCffState('STANDBY');
    showToast(preset === 'bridge' ? '🌉 교량 고속도로 경로로 초기화되었습니다.' : '🛣️ 계곡 도로 기동 경로로 초기화되었습니다.');
  };

  return (
    <div 
      onPointerMove={handleStagePointerMove}
      onPointerUp={handleStagePointerUp}
      className="relative w-full h-[calc(100dvh-4rem)] bg-neutral-950 overflow-hidden select-none font-sans text-white"
    >
      {/* ── Toast Notification Banner ── */}
      {toastMessage && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-[#0a1525]/95 border border-[#3b82f6] text-[#60a5fa] text-xs font-semibold shadow-[0_0_25px_rgba(59,130,246,0.5)] flex items-center gap-2 animate-bounce pointer-events-none">
          <CheckCircle2 className="w-4 h-4 text-[#3b82f6]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ── Top Left: OP 관측 모드 Header & Multi-Row Controls ── */}
      {uiVisible && (
        <div className="absolute top-4 left-4 z-40 flex flex-col gap-2 p-3 rounded-xl bg-[#0a1525]/95 backdrop-blur-md border border-[#1e3a5f] shadow-2xl max-w-[calc(100%-2rem)] lg:max-w-[calc(100%-360px)]">
          {/* Row 1: Title, Role Badge, Menu toggle, Core Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              ref={settingsButtonRef}
              type="button"
              aria-label={role === 'instructor' ? '교관 설정 열기/닫기' : '점수판 열기/닫기'}
              aria-expanded={rightPanelOpen}
              aria-controls="tactical-settings-panel"
              onClick={() => { setRightPanelOpen(open => !open); playTacticalSound('click'); }}
              className="inline-flex min-h-10 shrink-0 items-center gap-2 whitespace-nowrap px-3 text-xs font-bold hover:bg-white/10 rounded transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300"
              title={role === 'instructor' ? '교관 설정 열기/닫기' : '점수판 열기/닫기'}
            >
              <Menu className="w-4 h-4 text-[#93c5fd]" />
              <span>{role === 'instructor' ? '교관 설정' : '점수판'}</span>
            </button>
            <strong className="text-sm font-bold tracking-wide text-white mr-1">
              {role === 'instructor' ? '🎖️ 교관 관제 모드' : '👨‍🎓 교육생 실전 관측 훈련장'}
            </strong>

            {/* Role Badge */}
            <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-extrabold border ${
              role === 'instructor'
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'bg-blue-500/20 text-blue-300 border-blue-500/40'
            }`}>
              {role === 'instructor' ? '🎖️ 교관 전용' : '👨‍🎓 교육생 전용 (표적 제어 차단)'}
            </span>

            {/* ⚡ HARNESS COMMIT BUTTON (INSTRUCTOR ONLY) */}
            {role === 'instructor' && (
              <button
                onClick={commitHarnessToTrainee}
                className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full font-extrabold text-[10px] transition shadow-md ${
                  hasUnsyncedChanges
                    ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-[0_0_12px_#f59e0b] animate-pulse ring-1 ring-white'
                    : 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white'
                }`}
                title="교관이 설정한 표적 위치, 기동로, 속도, 각도를 교육생 화면에 즉시 일치화 전송"
              >
                <Send className="w-3 h-3" />
                <span>⚡ 교육생 일치화</span>
              </button>
            )}

            {/* 🛑 Master Halt / Resume Button (Instructor) */}
            {role === 'instructor' && (
              <button
                onClick={() => {
                  const isRunning = isPlaying && !harnessLocked;
                  if (isRunning) {
                    setIsPlaying(false);
                    setHarnessLocked(true);
                    setTargets(prev => {
                      const next = prev.map(t => ({ ...t, isMoving: false, destX: null, destY: null }));
                      broadcastUpdate(next);
                      return next;
                    });
                    playTacticalSound('click');
                    showToast('🛑 [전체 정지] 모든 표적의 기동이 즉시 정지 및 동결되었습니다.');
                  } else {
                    setIsPlaying(true);
                    setHarnessLocked(false);
                    setTargets(prev => {
                      const next = prev.map(t => {
                        const pts = (t.maneuverPoints && t.maneuverPoints.length > 0) ? t.maneuverPoints : DEFAULT_VALLEY5_POINTS;
                        return {
                          ...t,
                          isMoving: t.category === 'AFV' || t.category === 'SPH' || t.id === selectedTargetId,
                          maneuverPoints: pts,
                          currentWpIndex: t.currentWpIndex ?? 0,
                        };
                      });
                      broadcastUpdate(next);
                      return next;
                    });
                    playTacticalSound('lase');
                    showToast('▶️ [기동 시작] 교관 명령에 의한 표적 기동이 시작되었습니다!');
                  }
                }}
                className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full font-extrabold text-[10px] transition shadow-md ${
                  isPlaying && !harnessLocked
                    ? 'bg-red-600 hover:bg-red-500 text-white shadow-[0_0_15px_#ef4444] animate-pulse ring-1 ring-white'
                    : 'bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/50'
                }`}
                title={isPlaying && !harnessLocked ? '모든 표적 즉시 정지 및 동결 (전체 멈춤)' : '기동 시작'}
              >
                {isPlaying && !harnessLocked ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                <span>{isPlaying && !harnessLocked ? '🛑 전체 즉시 멈춤' : '▶️ 기동 시작'}</span>
              </button>
            )}
          </div>

          {/* Row 2: Mode Navigation & Links (Clearly separated and wrapped) */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-white/10">
            {/* 🔗 [교관 <-> 교육생] HTML 네이티브 링크 (브라우저 이동) */}
            {role === 'instructor' ? (
              <a
                href="/tactical-ar/trainee"
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-cyan-400 hover:bg-cyan-300 text-black text-xs font-black transition shadow-[0_0_15px_rgba(6,182,212,0.9)] cursor-pointer active:scale-95 ring-2 ring-white inline-flex"
                title="교육생 전용 홈페이지로 이동 (/tactical-ar/trainee)"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>👨‍🎓 교육생 모드로 이동</span>
              </a>
            ) : (
              <a
                href="/tactical-ar/instructor"
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-amber-400 hover:bg-amber-300 text-black text-xs font-black transition shadow-[0_0_15px_rgba(245,158,11,0.9)] cursor-pointer active:scale-95 ring-2 ring-white inline-flex"
                title="교관 관제실로 이동 (/tactical-ar/instructor)"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>🎖️ 교관 모드로 이동</span>
              </a>
            )}

            {/* 📱 [교관용] 새 창으로 교육생 뷰 띄우기 (진짜 HTML _blank 링크) */}
            {role === 'instructor' && (
              <a
                href="/tactical-ar/trainee"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-blue-600/40 hover:bg-blue-600/60 text-blue-200 border border-blue-400/50 text-xs font-bold transition shadow-sm cursor-pointer active:scale-95 inline-flex"
                title="새 창/새 탭으로 교육생 관측 화면 열기"
              >
                <span>🪟 교육생 창 열기</span>
              </a>
            )}

            {/* 📋 [교관용] 교육생 클라우드플레어 링크 복사 */}
            {role === 'instructor' && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  playTacticalSound('click');
                  const traineeUrl = `${window.location.origin}/tactical-ar/trainee`;
                  navigator.clipboard?.writeText(traineeUrl);
                  showToast(`📋 [복사 완료] 교육생 접속 링크가 복사되었습니다:\n${traineeUrl}`);
                }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 text-neutral-300 border border-white/15 text-[10px] font-bold transition cursor-pointer"
                title="교육생에게 전달할 접속 링크 복사"
              >
                <Copy className="w-3 h-3 text-cyan-400" />
                <span>교육생 링크 복사</span>
              </button>
            )}

            {/* 📡 [교관용] Sync Info Guide Button */}
            {role === 'instructor' && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowSyncModal(true);
                  playTacticalSound('click');
                }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold transition cursor-pointer"
                title="실시간 동기화 상태 및 배포 접속 주소 확인"
              >
                <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
                <span>동기화 안내</span>
              </button>
            )}

            {/* Trainee View Sync Status Badge */}
            {role === 'trainee' && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-500/50 text-emerald-300 text-[10px] font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>교관 연동 중 ({lastSyncTime})</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between text-xs text-neutral-300 pt-1 border-t border-white/10">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              관측 상태 <strong className="text-emerald-400 font-semibold">양호</strong>
            </span>
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setDayNightMode(m => m === 'day' ? 'night' : m === 'night' ? 'flir' : 'day')}
                className="flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[#ffd700]"
              >
                <Sun className="w-3 h-3 text-[#ffd700]" />
                {dayNightMode === 'day' ? '주간' : dayNightMode === 'night' ? '야간' : '열영상'}
              </button>
              <button
                onClick={() => setUiVisible(!uiVisible)}
                className="p-1 rounded bg-white/10 hover:bg-white/20 text-neutral-400"
                title="전체화면 / UI 토글"
              >
                <EyeOff className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* ── 🌄 표적지 사진 선택 (교관: 선택 버튼 / 교육생: 현재 표적지 배지) ── */}
          <div className="flex items-center gap-1.5 pt-2 border-t border-white/10">
            <span className="text-[10px] text-[#ffd700] font-bold whitespace-nowrap">표적지:</span>
            {role === 'instructor' ? (
              <div className="grid grid-cols-2 gap-1.5 w-full">
                <button
                  onClick={() => {
                    setBgMode('mountain');
                    playTacticalSound('click');
                    broadcastUpdate(targets, scores, instructorFeedback, 'mountain');
                    showToast('⛰️ [표적지 1: 산악·계곡 교량] 사진으로 전환되었습니다.');
                  }}
                  className={`py-1 px-1 rounded-lg text-[10px] font-bold transition flex items-center justify-center gap-1 border ${
                    bgMode === 'mountain'
                      ? 'bg-blue-600 text-white border-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.8)] ring-1 ring-white'
                      : 'bg-white/5 text-neutral-300 border-white/10 hover:bg-white/15'
                  }`}
                  title="사진 1: 산악·계곡 교량 관측지"
                >
                  <span>⛰️ 표적지 1 (산악)</span>
                </button>

                <button
                  onClick={() => {
                    setBgMode('urban');
                    playTacticalSound('click');
                    broadcastUpdate(targets, scores, instructorFeedback, 'urban');
                    showToast('🏙️ [표적지 2: 도심·시가지 조망] 사진으로 전환되었습니다.');
                  }}
                  className={`py-1 px-1 rounded-lg text-[10px] font-bold transition flex items-center justify-center gap-1 border ${
                    bgMode === 'urban'
                      ? 'bg-blue-600 text-white border-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.8)] ring-1 ring-white'
                      : 'bg-white/5 text-neutral-300 border-white/10 hover:bg-white/15'
                  }`}
                  title="사진 2: 도심·시가지 조망 관측지"
                >
                  <span>🏙️ 표적지 2 (도심)</span>
                </button>
              </div>
            ) : (
              <div className="w-full text-[11px] font-bold text-cyan-300 flex items-center gap-1 px-2 py-0.5 rounded bg-black/40 border border-white/10">
                <span>{bgMode === 'mountain' ? '⛰️ 표적지 1: 산악·계곡' : '🏙️ 표적지 2: 도심·시가지'}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {!uiVisible && (
        <button
          onClick={() => setUiVisible(true)}
          className="absolute top-4 left-4 z-40 p-2 rounded-xl bg-[#0a1525]/90 border border-[#1e3a5f] text-neutral-300 hover:text-white shadow-xl flex items-center gap-1 text-xs"
        >
          <Eye className="w-4 h-4 text-blue-400" /> UI 보이기
        </button>
      )}

      {/* ── Top Center: Compass Azimuth Ribbon & Search Status ── */}
      {uiVisible && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-1.5 pointer-events-none">
          <div className="flex items-center justify-center gap-6 px-6 py-1.5 rounded-lg bg-[#0a1525]/75 backdrop-blur-md border border-[#1e3a5f] text-xs font-mono text-neutral-400 shadow-lg">
            <span>NW</span>
            <span>·</span>
            <span className="font-bold text-neutral-200">N</span>
            <span>·</span>
            <span className="font-bold text-[#60a5fa]">NE 048°</span>
            <span>·</span>
            <span className="font-bold text-neutral-200">E</span>
            <span>·</span>
            <span>SE</span>
          </div>

          <div className="flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#0a1525]/90 border border-[#3b82f6]/40 text-xs text-[#93c5fd] font-medium shadow-md">
            <Crosshair className="w-3.5 h-3.5 text-[#3b82f6] animate-pulse" />
            <span>{currentTarget ? `${currentTarget.name} 조준 중` : '표적 탐색 중'}</span>
          </div>

          {/* ── 🚀 교관 전용: 전술 하네스 일치화 전송 바 (MASTER HARNESS COMMIT BAR) ── */}
          {role === 'instructor' && (
            <div className="flex items-center gap-2 p-1.5 px-3 rounded-2xl bg-[#060e1a]/95 backdrop-blur-md border border-cyan-500/70 shadow-[0_0_25px_rgba(6,182,212,0.35)] pointer-events-auto">
              <button
                onClick={commitHarnessToTrainee}
                className={`py-1.5 px-4 rounded-xl font-extrabold text-xs flex items-center gap-2 transition shadow-xl ${
                  hasUnsyncedChanges
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black shadow-[0_0_25px_#f59e0b] animate-bounce ring-2 ring-white scale-105'
                    : 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white hover:shadow-[0_0_15px_#06b6d4]'
                }`}
                title="교관이 수정한 표적 위치, 기동로, 속도, 각도를 교육생 화면에 즉시 일치화 전송합니다."
              >
                <Send className="w-4 h-4" />
                <span>⚡ 교육생 화면에 일치화 (하네스 전송)</span>
              </button>

              <div className="flex flex-col text-left">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border inline-block ${
                  hasUnsyncedChanges
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 animate-pulse'
                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                }`}>
                  {hasUnsyncedChanges ? '⚠️ 변경사항 대기 중 (일치화 필요)' : '✅ 교육생 화면과 일치화됨'}
                </span>
                <span className="text-[9px] text-neutral-400 font-mono mt-0.5">
                  최종 일치화: {harnessSyncedAt || '준비 완료'}
                </span>
              </div>
            </div>
          )}

          {/* ── 👨‍🎓 교육생 전용: 하네스 일치화 수신 상태 바 ── */}
          {role === 'trainee' && (
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-2xl bg-[#060e1a]/95 backdrop-blur-md border border-emerald-500/60 shadow-[0_0_20px_rgba(16,185,129,0.3)] pointer-events-auto">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-bold text-emerald-300">
                교관 전술 하네스 일치화 수신 상태: <strong className="text-white font-mono">{lastSyncTime}</strong>
              </span>
            </div>
          )}

          {/* Quick Target Selector Bar for Instructor */}
          {role === 'instructor' && (
            <div className="flex items-center gap-1 p-1 rounded-xl bg-[#0a1525]/95 backdrop-blur-md border border-[#1e3a5f] shadow-2xl pointer-events-auto">
              <span className="text-[10px] text-[#ffd700] font-bold px-1.5 flex items-center gap-1">
                <Target className="w-3 h-3" /> 표적선정:
              </span>
              {targets.map(t => (
                <button
                  key={t.id}
                  onClick={() => {
                    setSelectedTargetId(t.id);
                    setRightPanelTab('inspector');
                    playTacticalSound('click');
                    showToast(`🎯 [선택됨] ${t.name}`);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition flex items-center gap-1 border ${
                    selectedTargetId === t.id 
                      ? 'bg-blue-600 text-white border-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.8)] scale-105 ring-1 ring-white' 
                      : 'bg-white/5 text-neutral-300 border-white/10 hover:bg-white/15'
                  }`}
                  title={`${t.name} 선정`}
                >
                  <span>{t.category === 'SPH' ? '🪖' : t.category === 'AFV' ? '🛡️' : t.category === 'CP' ? '⛺' : '👤'}</span>
                  <span>{t.code}</span>
                </button>
              ))}
            </div>
          )}

          {/* Floating Relocation Instruction Banner */}
          {isRelocatingTarget && currentTarget && (
            <div className="px-4 py-1.5 rounded-xl bg-amber-500 text-black font-extrabold text-xs shadow-[0_0_25px_#f59e0b] flex items-center gap-2 animate-bounce border-2 border-white pointer-events-none">
              <Crosshair className="w-4 h-4 animate-spin" />
              <span>화면을 클릭하여 [{currentTarget.name}]의 위치를 콕 찍어 지정하세요!</span>
            </div>
          )}
        </div>
      )}

      {/* ── Left Side: Vertical Zoom Bar (1.0x ~ 3.0x) & 화면 보정 ── */}
      {uiVisible && (
        <div className="absolute top-1/3 left-4 z-30 flex flex-col items-center gap-3">
          <div className="flex flex-col items-center p-1 rounded-full bg-[#0a1525]/85 backdrop-blur-md border border-[#1e3a5f] shadow-lg">
            <button
              onClick={() => { setZoomLevel(prev => Math.min(3.0, prev + 1.0)); playTacticalSound('click'); }}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-neutral-200"
              title="줌 인"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => { setZoomLevel(prev => prev === 3.0 ? 1.0 : 3.0); playTacticalSound('click'); }}
              className="my-1 px-2 py-1 rounded-md bg-blue-600/30 text-blue-300 font-bold text-xs border border-blue-500/40"
              title="배율 전환"
            >
              {zoomLevel.toFixed(1)}x
            </button>
            <button
              onClick={() => { setZoomLevel(prev => Math.max(1.0, prev - 1.0)); playTacticalSound('click'); }}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-neutral-200"
              title="줌 아웃"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() => { showToast('⌖ 자이로 및 나침반 센서 보정이 완료되었습니다.'); playTacticalSound('click'); }}
            className="flex flex-col items-center justify-center p-2 rounded-xl bg-[#0a1525]/85 backdrop-blur-md border border-[#1e3a5f] hover:bg-[#1e3a5f]/40 text-neutral-300 text-[10px] gap-1 shadow-lg group"
          >
            <CircleDot className="w-4 h-4 text-[#60a5fa] group-hover:scale-110 transition" />
            <span>화면 보정</span>
          </button>
        </div>
      )}

      {/* ── Main Terrain View (Crisp Observation Landscape) ── */}
      <div 
        ref={stageRef}
        onClick={handleStageClick}
        style={{
          transform: `scale(${zoomLevel})`,
          transformOrigin: '50% 50%',
          transition: 'transform 0.3s cubic-bezier(0.2, 0.9, 0.4, 1.1)',
        }}
        className={`relative w-full h-full flex items-center justify-center overflow-hidden cursor-crosshair ${
          dayNightMode === 'flir' ? 'filter sepia(1) hue-rotate(-20deg) contrast(1.4)' : 
          dayNightMode === 'night' ? 'filter saturate(0) sepia(1) hue-rotate(85deg) contrast(1.5) brightness(1.2)' : ''
        }`}
      >
        {/* Background Image */}
        {bgMode === 'mountain' && (
          <img 
            src="/tactical/obs_mountain_crisp.jpg" 
            alt="Mountain Observation Landscape" 
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            style={{ imageRendering: '-webkit-optimize-contrast' }}
          />
        )}
        {bgMode === 'urban' && (
          <img 
            src="/tactical/obs_urban_crisp.jpg" 
            alt="Urban Observation Landscape" 
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            style={{ imageRendering: '-webkit-optimize-contrast' }}
          />
        )}
        {bgMode === 'camera' && (
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted 
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          />
        )}

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_55%,rgba(0,0,0,0.45)_100%)] pointer-events-none" />

        {/* ── Active Target Movement Trajectories & Destination Beacons ── */}
        {targets.map(t => {
          if (t.destX == null || t.destY == null || t.destroyed) return null;
          return (
            <React.Fragment key={`dest-nav-${t.id}`}>
              <svg className="absolute inset-0 w-full h-full pointer-events-none z-15">
                <line
                  x1={`${t.x}%`}
                  y1={`${t.y}%`}
                  x2={`${t.destX}%`}
                  y2={`${t.destY}%`}
                  stroke="#00e5ff"
                  strokeWidth="2.5"
                  strokeDasharray="6,4"
                  className="animate-pulse"
                />
              </svg>

              <div
                style={{
                  left: `${t.destX}%`,
                  top: `${t.destY}%`,
                  transform: 'translate(-50%, -100%)',
                }}
                className="absolute z-25 pointer-events-none flex flex-col items-center"
              >
                <div className="px-2.5 py-1 rounded-md bg-blue-600/95 border border-[#00e5ff] text-[10px] text-white font-bold shadow-[0_0_15px_#00e5ff] flex items-center gap-1.5 animate-bounce">
                  <span>🏁 {t.id} 기동 목표점</span>
                </div>
                <div className="w-[1.5px] h-6 bg-[#00e5ff] shadow-[0_0_4px_#00e5ff]" />
                <div className="w-3.5 h-3.5 rounded-full border-2 border-[#00e5ff] bg-cyan-400/60 animate-ping -mt-1" />
              </div>
            </React.Fragment>
          );
        })}

        {/* ── Active Target Maneuver Routes & Waypoints Visualizer ── */}
        {targets.map(t => {
          if (!t.maneuverPoints || t.maneuverPoints.length === 0 || t.destroyed) return null;
          const isSelected = t.id === selectedTargetId;
          return (
            <React.Fragment key={`route-poly-${t.id}`}>
              {/* Connecting Route Polyline between all waypoints */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none z-15" viewBox="0 0 100 100" preserveAspectRatio="none">
                <polyline
                  fill="none"
                  stroke={isSelected ? "rgba(0, 229, 255, 0.9)" : "rgba(16, 185, 129, 0.7)"}
                  strokeWidth={isSelected ? "0.6" : "0.4"}
                  strokeDasharray={t.isMoving ? "1.5,1" : "1,1"}
                  vectorEffect="non-scaling-stroke"
                  className={t.isMoving ? "animate-pulse" : ""}
                  points={t.maneuverPoints.map(wp => `${wp.x},${wp.y}`).join(' ')}
                />
              </svg>

              {/* Render Waypoints on Stage */}
              {(isSelected || role === 'instructor') && t.maneuverPoints.map((wp) => (
                <div
                  key={`${t.id}-${wp.id}`}
                  style={{
                    left: `${wp.x}%`,
                    top: `${wp.y}%`,
                    transform: 'translate(-50%, -100%)',
                  }}
                  className="absolute z-25 pointer-events-none flex flex-col items-center opacity-90 hover:opacity-100"
                >
                  <div className={`px-2 py-0.5 rounded-md border text-[10px] text-white font-bold flex items-center gap-1.5 shadow-md ${
                    isSelected ? 'bg-[#0a1525]/95 border-[#00e5ff] shadow-[0_0_12px_rgba(0,229,255,0.7)]' : 'bg-black/80 border-emerald-500/60'
                  }`}>
                    <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center font-extrabold text-[8px] ${
                      isSelected ? 'bg-[#00e5ff] text-black' : 'bg-emerald-500 text-black'
                    }`}>
                      {wp.index}
                    </span>
                    <span>{t.code}-P{wp.index}</span>
                    <span className="text-[#ffd700] font-mono">({wp.aspectIndex}°)</span>
                    <span 
                      style={{ transform: `rotate(${wp.headingDeg ?? wp.aspectIndex}deg)` }}
                      className="inline-block text-[#00e5ff] font-bold"
                    >
                      ↑
                    </span>
                  </div>
                  <div className={`w-[1px] h-4 ${isSelected ? 'bg-[#00e5ff]' : 'bg-emerald-400'}`} />
                  <div className={`w-2 h-2 rounded-full border border-white ${isSelected ? 'bg-[#00e5ff]' : 'bg-emerald-400'}`} />
                </div>
              ))}
            </React.Fragment>
          );
        })}

        {/* ── Interactive Target Anchors with Pin Lines (Draggable & Selectable) ── */}
        {targets.map((t) => {
          const isSelected = t.id === selectedTargetId;
          const isDragging = t.id === draggingTargetId;
          return (
            <div
              key={t.id}
              onPointerDown={(e) => {
                e.stopPropagation();
                setSelectedTargetId(t.id);
                if (role === 'instructor') {
                  setRightPanelTab('inspector');
                  setDraggingTargetId(t.id);
                }
                playTacticalSound('lase');
              }}
              style={{
                left: `${t.x}%`,
                top: `${t.y}%`,
                transform: 'translate(-50%, -100%)',
                zIndex: isSelected ? 30 : 20,
              }}
              className={`absolute flex flex-col items-center transition-transform ${role === 'instructor' ? 'cursor-pointer' : 'cursor-crosshair'} ${isDragging ? 'scale-115 opacity-90' : ''}`}
            >
              {/* Tactical Label Pill */}
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md backdrop-blur-md transition-all shadow-lg text-[11px] font-medium border ${
                isSelected 
                  ? 'bg-blue-600/95 text-white border-blue-400 shadow-[0_0_18px_rgba(59,130,246,0.8)] scale-105 ring-2 ring-[#ffd700]' 
                  : 'bg-[#0a1525]/85 text-neutral-200 border-[#1e3a5f] hover:border-blue-400'
              }`}>
                {t.category === 'SPH' && <span>🪖</span>}
                {t.category === 'AFV' && <span>🛡️</span>}
                {t.category === 'CP' && <span>⛺</span>}
                {t.category === 'INF' && <span>👤</span>}
                <span className="font-bold">{t.name}</span>
                {/* Aspect Badge */}
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/25 border border-cyan-400/50 text-[9px] font-mono text-cyan-200">
                  <span>🧭 {t.aspectIndex}°</span>
                  <span className="font-sans text-[8px] text-cyan-300 font-bold">{getAspectName(t.aspectIndex).split(' ')[0]}</span>
                </span>

                {role === 'instructor' && (
                  <span className="ml-0.5 text-[9px] text-[#ffd700] font-mono">({Math.round(t.x)}%, {Math.round(t.y)}%)</span>
                )}
                {t.isMoving && !t.destroyed && (
                  <span className="flex items-center gap-1 ml-1 px-1.5 py-0.5 rounded bg-emerald-500/25 border border-emerald-400/60 text-[9px] text-emerald-300 font-mono font-bold shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    <span>기동 {t.speedKmh ?? masterSpeedKmh}km/h</span>
                    <span style={{ transform: `rotate(${t.headingDeg}deg)` }} className="inline-block text-cyan-300 font-bold">↑</span>
                  </span>
                )}
              </div>

              {/* White Precision Leader Pin Line */}
              <div className={`w-[1.5px] h-6 shadow-[0_0_3px_#fff] ${isSelected ? 'bg-[#ffd700]' : 'bg-white/70'}`} />
              <div className={`w-2 h-2 rounded-full shadow-[0_0_6px_#fff] ${isSelected ? 'bg-[#ffd700]' : 'bg-white'}`} />

              {/* Physical 3D Target Entity on Ground */}
              <div className="relative mt-0.5 flex flex-col items-center">
                {/* ── Ground Tactical Chassis Orientation Compass & Golden Heading Needle ── */}
                <div 
                  style={{
                    transform: 'perspective(400px) rotateX(65deg)',
                  }}
                  className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-28 h-28 pointer-events-none flex items-center justify-center -z-10"
                >
                  <svg 
                    className="w-full h-full transition-transform duration-350 ease-out"
                    style={{ transform: `rotate(${t.aspectIndex}deg)` }}
                    viewBox="0 0 100 100"
                  >
                    {/* Elliptical Ground Compass Ring */}
                    <circle cx="50" cy="50" r="42" fill="none" stroke={isSelected ? "rgba(0, 229, 255, 0.55)" : "rgba(255, 255, 255, 0.25)"} strokeWidth="1.8" strokeDasharray="5,4" />
                    <circle cx="50" cy="50" r="26" fill={isSelected ? "rgba(0, 229, 255, 0.15)" : "rgba(0, 0, 0, 0.35)"} stroke={isSelected ? "rgba(0, 229, 255, 0.7)" : "rgba(255, 255, 255, 0.35)"} strokeWidth="1.2" />
                    {/* Golden Directional Heading Arrow */}
                    <line x1="50" y1="50" x2="50" y2="12" stroke="#ffd700" strokeWidth="3" strokeLinecap="round" />
                    <polygon points="50,5 44,17 56,17" fill="#ffd700" />
                    {/* Tail Indicator */}
                    <circle cx="50" cy="66" r="3" fill="rgba(255, 215, 0, 0.7)" />
                  </svg>
                  
                  {/* Aspect Degree Badge on Ground */}
                  <span className="absolute bottom-0 px-1.5 py-0.2 rounded bg-black/85 border border-[#ffd700]/60 text-[8px] font-mono font-extrabold text-[#ffd700] shadow-[0_0_8px_rgba(255,215,0,0.5)]">
                    {t.aspectIndex}° {getAspectName(t.aspectIndex).split(' ')[0]}
                  </span>
                </div>

                {t.category === 'SPH' && (
                  <img
                    src="/tactical/target-sph-01.png"
                    alt={t.name}
                    style={getVehicle3dStyle(t.aspectIndex, t.distanceM, t.destroyed)}
                    className={`w-20 h-auto object-contain pointer-events-none ${t.isMoving && !t.destroyed && isPlaying ? 'tread-moving' : ''}`}
                  />
                )}

                {t.category === 'AFV' && (
                  <img
                    src="/tactical/target-aev-01.png"
                    alt={t.name}
                    style={getVehicle3dStyle(t.aspectIndex, t.distanceM, t.destroyed)}
                    className={`w-18 h-auto object-contain pointer-events-none ${t.isMoving && !t.destroyed && isPlaying ? 'tread-moving' : ''}`}
                  />
                )}

                {t.category === 'CP' && (
                  <img
                    src="/tactical/target-cp-01.png"
                    alt={t.name}
                    style={{
                      transform: `scale(${Math.max(0.65, Math.min(1.15, (1150 - t.distanceM) / 500))})`,
                      filter: t.destroyed ? 'grayscale(1) brightness(0.25)' : 'drop-shadow(0 6px 8px rgba(0,0,0,0.9))',
                    }}
                    className="w-16 h-auto object-contain pointer-events-none"
                  />
                )}

                {/* Dynamic Ground Dust Cloud & Diesel Exhaust */}
                {t.isMoving && !t.destroyed && isPlaying && (
                  <div className="absolute -bottom-1 left-0 right-0 flex items-center justify-between pointer-events-none z-10 px-1">
                    {/* Left Track Dust */}
                    <span className="w-5 h-2 bg-amber-200/50 rounded-full blur-[1.5px] animate-ping" />
                    {/* Center Diesel Exhaust Puff */}
                    <span className="w-3 h-2 bg-neutral-600/40 rounded-full blur-[1px] animate-pulse" />
                    {/* Right Track Dust */}
                    <span className="w-5 h-2 bg-amber-300/40 rounded-full blur-[1.5px] animate-ping" />
                  </div>
                )}

                {/* Explosion Flame */}
                {t.destroyed && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <Flame className="w-12 h-12 text-orange-500 animate-bounce" />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Right Side Panel: 메뉴, 점수판, 전체/개별 표적 컨트롤러 ── */}
      {uiVisible && (
        <aside
          id="tactical-settings-panel"
          aria-labelledby="tactical-settings-title"
          aria-hidden={!rightPanelOpen}
          inert={!rightPanelOpen}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setRightPanelOpen(false);
              settingsButtonRef.current?.focus();
            }
          }}
          className={`absolute top-4 right-4 bottom-20 z-50 w-84 max-w-[calc(100%-2rem)] min-h-0 flex flex-col transition-transform duration-300 motion-reduce:transition-none ${rightPanelOpen ? 'translate-x-0' : 'translate-x-[calc(100%+1rem)]'}`}
        >
          <div className="h-full min-h-0 flex flex-col rounded-2xl bg-[#0a1525]/92 backdrop-blur-md border border-[#1e3a5f] shadow-2xl overflow-hidden">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#1e3a5f] px-4 py-2">
              <h2 id="tactical-settings-title" className="text-sm font-bold">{role === 'instructor' ? '교관 설정' : '점수판'}</h2>
              <button
                type="button"
                aria-label="설정 패널 닫기"
                onClick={() => {
                  setRightPanelOpen(false);
                  settingsButtonRef.current?.focus();
                }}
                className="inline-flex min-h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded px-3 text-xs hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300"
              >
                <X className="h-4 w-4" /> 닫기
              </button>
            </div>
            {/* Quick Switch Banner in Right Panel (Always visible at top of sidebar) */}
            <div className="p-2.5 bg-gradient-to-r from-[#060e1a] via-[#091e38] to-[#060e1a] border-b border-[#1e3a5f] flex items-center justify-between">
              <span className="text-[11px] text-neutral-200 font-bold flex items-center gap-1">
                {role === 'instructor' ? '👨‍🎓 교육생 화면 이동:' : '🎖️ 교관 관제실 복귀:'}
              </span>
              {role === 'instructor' ? (
                <a
                  href="/tactical-ar/trainee"
                  className="px-3 py-1.5 rounded-lg bg-cyan-400 hover:bg-cyan-300 text-black font-black text-xs shadow-[0_0_12px_rgba(6,182,212,0.6)] flex items-center gap-1.5 cursor-pointer active:scale-95 ring-1 ring-white inline-flex"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>교육생 모드로 전환 👉</span>
                </a>
              ) : (
                <a
                  href="/tactical-ar/instructor"
                  className="px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-black font-black text-xs shadow-[0_0_12px_rgba(245,158,11,0.6)] flex items-center gap-1.5 cursor-pointer active:scale-95 ring-1 ring-white inline-flex"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>교관 모드로 전환 👉</span>
                </a>
              )}
            </div>

            {/* Header Tabs: Instructor has full control tabs, Trainee has dedicated clean Score header */}
            {role === 'instructor' ? (
              <div className="flex border-b border-[#1e3a5f] bg-[#060e1a]/90 p-1.5 gap-1">
                <button
                  onClick={() => { setRightPanelTab('inspector'); playTacticalSound('click'); }}
                  className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition ${
                    rightPanelTab === 'inspector' ? 'bg-blue-600 text-white shadow-md' : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  <Settings2 className="w-3 h-3" /> 표적제어
                </button>

                <button
                  onClick={() => { setRightPanelTab('placement'); playTacticalSound('click'); }}
                  className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition ${
                    rightPanelTab === 'placement' ? 'bg-amber-600 text-white shadow-md' : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  <PlusCircle className="w-3 h-3" /> 추가배치
                </button>

                <button
                  onClick={() => { setRightPanelTab('score'); playTacticalSound('click'); }}
                  className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition ${
                    rightPanelTab === 'score' ? 'bg-blue-600 text-white shadow-md' : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  <Award className="w-3 h-3" /> 평가점수
                </button>

                <button
                  onClick={() => { setRightPanelTab('menu'); playTacticalSound('click'); }}
                  className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition ${
                    rightPanelTab === 'menu' ? 'bg-blue-600 text-white shadow-md' : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  <Sliders className="w-3 h-3" /> 기동설정
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between border-b border-[#1e3a5f] bg-[#060e1a]/95 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Award className="w-4 h-4 text-[#ffd700]" />
                  <strong className="text-xs font-bold text-white tracking-wide">교관 평가 점수판</strong>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30 animate-pulse flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> 실시간 수신 중
                </span>
              </div>
            )}

            {/* TAB 1: 개별 표적 종합 컨트롤러 (INSPECTOR CONTROLLER - INSTRUCTOR ONLY) */}
            {role === 'instructor' && rightPanelTab === 'inspector' && currentTarget && (
              <div className="min-h-0 flex-1 p-4 overflow-y-auto space-y-3.5 text-xs text-neutral-200">
                <div className="flex items-center justify-between pb-2 border-b border-white/10">
                  <div>
                    <span className="text-[10px] text-blue-400 font-bold block">{currentTarget.category} TARGET CONTROLLER</span>
                    <strong className="text-sm font-bold text-white flex items-center gap-1.5">
                      <Target className="w-4 h-4 text-[#ffd700]" /> {currentTarget.name}
                    </strong>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-black/60 border border-white/10 font-mono text-[#ffd700]">
                    {Math.round(currentTarget.x)}%, {Math.round(currentTarget.y)}%
                  </span>
                </div>

                {/* 🚀 Master Harness Commit & Sync to Trainee Card */}
                <div className="p-3 rounded-xl bg-gradient-to-r from-blue-950/90 to-cyan-950/90 border border-cyan-500/60 shadow-lg space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-white">
                    <span className="flex items-center gap-1.5 text-cyan-300">
                      <Send className="w-3.5 h-3.5" /> 교육생 화면 일치화
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                      hasUnsyncedChanges
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                        : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    }`}>
                      {hasUnsyncedChanges ? '일치화 필요' : '동기화 완료'}
                    </span>
                  </div>
                  <button
                    onClick={commitHarnessToTrainee}
                    className={`w-full py-2.5 rounded-lg font-extrabold text-xs flex items-center justify-center gap-2 transition shadow-lg ${
                      hasUnsyncedChanges
                        ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-[0_0_15px_#f59e0b] animate-pulse ring-2 ring-white'
                        : 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white'
                    }`}
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>⚡ 교육생 화면에 일치화 전송</span>
                  </button>
                  <p className="text-[10px] text-neutral-300 text-center font-mono">
                    최종 일치화: {harnessSyncedAt || '준비 완료'}
                  </p>
                </div>

                {/* 🛡️ Tactical Command Harness Card */}
                <div className={`p-2.5 rounded-xl border transition-all ${
                  harnessLocked 
                    ? 'bg-amber-950/40 border-amber-500/60 shadow-[0_0_15px_rgba(245,158,11,0.25)]' 
                    : 'bg-emerald-950/40 border-emerald-500/60 shadow-[0_0_15px_rgba(16,185,129,0.25)]'
                }`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-xs flex items-center gap-1.5 text-white">
                      <ShieldCheck className={`w-4 h-4 ${harnessLocked ? 'text-amber-400' : 'text-emerald-400'}`} />
                      교관 전술 통제 하네스
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold border ${
                      harnessLocked 
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse' 
                        : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    }`}>
                      {harnessLocked ? '🔒 임의 기동 차단 (동결)' : '⚡ 지령 허가 (ACTIVE)'}
                    </span>
                  </div>

                  <p className="text-[10px] text-neutral-300 leading-snug mb-2">
                    {harnessLocked 
                      ? '⚠️ [임의 기동 원천 차단] 모든 표적이 진지에 고정되어 있습니다. 교관의 명령 없이 절대 움직이지 않습니다.' 
                      : '✅ [교관 지령 모드] 교관이 직접 지정한 9개소 기동 경로 및 목적지로만 정밀하게 주행합니다.'}
                  </p>

                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => {
                        setHarnessLocked(true);
                        setTargets(prev => prev.map(t => ({ ...t, isMoving: false })));
                        playTacticalSound('click');
                        showToast('🛡️ [하네스 잠금] 모든 표적의 임의 기동이 즉시 정지 및 동결되었습니다.');
                      }}
                      className={`py-1.5 rounded-lg text-[11px] font-bold border transition ${
                        harnessLocked 
                          ? 'bg-amber-500 text-black border-amber-400 shadow-md font-extrabold' 
                          : 'bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10'
                      }`}
                    >
                      🔒 전체 기동 즉시 동결
                    </button>
                    <button
                      onClick={() => {
                        setHarnessLocked(false);
                        setIsPlaying(true);
                        setTargets(prev => {
                          const next = prev.map(t => {
                            const pts = (t.maneuverPoints && t.maneuverPoints.length > 0) ? t.maneuverPoints : DEFAULT_VALLEY5_POINTS;
                            return {
                              ...t,
                              isMoving: t.category === 'AFV' || t.category === 'SPH',
                              maneuverPoints: pts,
                              currentWpIndex: t.currentWpIndex ?? 0,
                            };
                          });
                          broadcastUpdate(next);
                          return next;
                        });
                        playTacticalSound('lase');
                        showToast('⚡ [하네스 해제] 교관의 지령에 의한 표적 기동이 시작되었습니다.');
                      }}
                      className={`py-1.5 rounded-lg text-[11px] font-bold border transition ${
                        !harnessLocked 
                          ? 'bg-emerald-600 text-white border-emerald-400 shadow-md font-extrabold' 
                          : 'bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10'
                      }`}
                    >
                      ⚡ 교관 지령 기동 허가
                    </button>
                  </div>
                </div>

                {/* 📍 Click-to-Place Target Relocation Card */}
                <div className="p-3 rounded-xl bg-gradient-to-r from-blue-950/80 to-indigo-950/80 border border-blue-400/50 space-y-2 shadow-lg">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white flex items-center gap-1.5 text-xs">
                      <Crosshair className="w-3.5 h-3.5 text-[#ffd700]" /> 📍 표적 위치 직접 지정 (화면 클릭)
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono">
                      현재: ({Math.round(currentTarget.x)}%, {Math.round(currentTarget.y)}%)
                    </span>
                  </div>

                  <p className="text-[11px] text-neutral-300 leading-snug">
                    아래 버튼을 누른 후 화면의 원하는 지형(도로, 계곡, 능선)을 클릭하면 <strong className="text-[#ffd700]">{currentTarget.name}</strong>이 그 자리로 즉시 이동 배치됩니다.
                  </p>

                  <button
                    onClick={() => {
                      setIsRelocatingTarget(prev => !prev);
                      setIsSelectingDestination(false);
                      setIsAdding9Waypoints(false);
                      playTacticalSound('click');
                      if (!isRelocatingTarget) {
                        showToast(`🎯 화면의 원하는 곳을 클릭하여 [${currentTarget.name}]의 위치를 콕 찍어 지정하세요!`);
                      }
                    }}
                    className={`w-full py-2.5 rounded-lg font-extrabold text-xs flex items-center justify-center gap-1.5 transition ${
                      isRelocatingTarget 
                        ? 'bg-amber-400 text-black shadow-[0_0_20px_#f59e0b] animate-pulse ring-2 ring-white' 
                        : 'bg-blue-600 hover:bg-blue-500 text-white shadow-md'
                    }`}
                  >
                    <Crosshair className="w-4 h-4" />
                    {isRelocatingTarget ? `[${currentTarget.code}] 위치 화면 클릭 대기 중... (화면 클릭)` : `📍 화면 클릭으로 [${currentTarget.code}] 위치 지정`}
                  </button>
                </div>

                {/* 1. Target Position Fine Control (D-Pad + Drag guidance) */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-neutral-300 font-semibold">
                    <span>위치 미세 조정 (또는 마우스 드래그)</span>
                    <span className="text-[#60a5fa] font-mono">거리: {currentTarget.distanceM}m</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 w-36 mx-auto">
                    <div />
                    <button
                      onClick={() => updateTarget(currentTarget.id, { y: Math.max(15, currentTarget.y - 2), distanceM: currentTarget.distanceM + 15 })}
                      className="p-2 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center"
                      title="위로 이동"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <div />
                    <button
                      onClick={() => updateTarget(currentTarget.id, { x: Math.max(5, currentTarget.x - 2) })}
                      className="p-2 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center"
                      title="좌로 이동"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                    </button>
                    <div className="p-1 rounded bg-black/50 text-[10px] flex items-center justify-center font-bold text-neutral-400">
                      이동
                    </div>
                    <button
                      onClick={() => updateTarget(currentTarget.id, { x: Math.min(95, currentTarget.x + 2) })}
                      className="p-2 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center"
                      title="우로 이동"
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                    <div />
                    <button
                      onClick={() => updateTarget(currentTarget.id, { y: Math.min(95, currentTarget.y + 2), distanceM: Math.max(500, currentTarget.distanceM - 15) })}
                      className="p-2 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center"
                      title="아래로 이동"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <div />
                  </div>
                </div>

                {/* 2. 🎯 최대 9개소 전술 기동 지점 & 각도 지정 (교관 커스텀 웨이포인트) */}
                <div className="p-3 rounded-xl bg-gradient-to-br from-blue-950/85 to-slate-900/95 border border-cyan-400/50 space-y-2.5 shadow-xl">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white flex items-center gap-1.5 text-xs">
                      <Compass className="w-3.5 h-3.5 text-[#00e5ff]" /> 9개소 기동 지점 & 각도 설정
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-mono font-bold border border-cyan-500/40">
                      {currentTarget.maneuverPoints?.length || 0} / 9개소 등록
                    </span>
                  </div>

                  <p className="text-[11px] text-neutral-300 leading-snug">
                    교관이 화면 지형을 클릭하여 **최대 9개소 기동 지점**을 찍고, 각 지점마다 **표적의 차체 각도(0°~315°)**를 함께 저장합니다.
                  </p>

                  {/* Main Action Buttons */}
                  <div className="grid grid-cols-2 gap-2 pt-0.5">
                    <button
                      onClick={() => {
                        setIsAdding9Waypoints(prev => !prev);
                        setIsSelectingDestination(false);
                        playTacticalSound('click');
                        if (!isAdding9Waypoints) {
                          showToast(`📍 화면의 원하는 도로/능선을 클릭하여 기동 지점을 추가하세요! (현재 ${currentTarget.maneuverPoints?.length || 0}/9개소)`);
                        }
                      }}
                      className={`py-2 px-1 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition ${
                        isAdding9Waypoints 
                          ? 'bg-amber-500 text-black shadow-[0_0_18px_#f59e0b] animate-pulse ring-2 ring-white' 
                          : 'bg-[#00e5ff]/20 text-[#00e5ff] border border-[#00e5ff]/50 hover:bg-[#00e5ff]/30'
                      }`}
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      {isAdding9Waypoints ? '화면 클릭 추가 중...' : '➕ 지점 추가 (최대 9개)'}
                    </button>

                    <button
                      onClick={() => {
                        const pts = (currentTarget.maneuverPoints && currentTarget.maneuverPoints.length > 0)
                          ? currentTarget.maneuverPoints
                          : DEFAULT_VALLEY5_POINTS;
                        setHarnessLocked(false);
                        setIsPlaying(true);
                        updateTarget(currentTarget.id, { maneuverPoints: pts, isMoving: true, currentWpIndex: 0 });
                        setIsAdding9Waypoints(false);
                        playTacticalSound('lase');
                        showToast(`🚀 [출발] ${currentTarget.name}이 1번 지점부터 순차 기동을 시작합니다!`);
                      }}
                      className={`py-2 px-1 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition ${
                        currentTarget.isMoving && currentTarget.maneuverPoints && currentTarget.maneuverPoints.length > 0
                          ? 'bg-emerald-600 text-white shadow-[0_0_15px_rgba(16,185,129,0.8)] animate-pulse'
                          : 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/50 hover:bg-emerald-600/40'
                      }`}
                    >
                      <Play className="w-3.5 h-3.5" /> 9개소 순차 기동
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        updateTarget(currentTarget.id, { isMoving: false });
                        playTacticalSound('click');
                        showToast('⏸️ 기동이 정지되었습니다.');
                      }}
                      className="flex-1 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-neutral-300 font-bold text-[11px] flex items-center justify-center gap-1"
                    >
                      <Pause className="w-3 h-3" /> 일시 정지
                    </button>
                    <button
                      onClick={() => {
                        updateTarget(currentTarget.id, { maneuverPoints: [], currentWpIndex: 0, isMoving: false });
                        setIsAdding9Waypoints(false);
                        playTacticalSound('click');
                        showToast('🗑️ 등록된 기동 지점이 모두 초기화되었습니다.');
                      }}
                      className="flex-1 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 font-bold text-[11px] flex items-center justify-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" /> 지점 전체 삭제
                    </button>
                  </div>

                  {/* Registered Waypoints List with Per-Waypoint Angle Controls */}
                  {currentTarget.maneuverPoints && currentTarget.maneuverPoints.length > 0 && (
                    <div className="space-y-2 pt-1 border-t border-white/10">
                      <span className="text-[10px] text-neutral-300 font-semibold block">
                        각 지점별 저장된 차체 각도 (클릭하여 변경):
                      </span>
                      <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                        {currentTarget.maneuverPoints.map((wp) => (
                          <div
                            key={wp.id}
                            className="p-1.5 rounded-lg bg-black/60 border border-white/15 space-y-1"
                          >
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-bold text-[#00e5ff] flex items-center gap-1">
                                <span className="w-4 h-4 rounded-full bg-[#00e5ff] text-black font-extrabold flex items-center justify-center text-[9px]">
                                  {wp.index}
                                </span>
                                {wp.id} ({Math.round(wp.x)}%, {Math.round(wp.y)}%)
                              </span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[#ffd700] font-mono text-[10px] font-bold">
                                  각도: {wp.aspectIndex}°
                                </span>
                                <button
                                  onClick={() => removeWaypoint(currentTarget.id, wp.index)}
                                  className="text-red-400 hover:text-red-300 p-0.5 text-xs font-bold"
                                  title="이 지점 삭제"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>

                            {/* 8-Aspect Angle Selector Buttons for this Waypoint */}
                            <div className="grid grid-cols-4 gap-1 text-[9px]">
                              {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
                                <button
                                  key={deg}
                                  onClick={() => updateWaypointAngle(currentTarget.id, wp.index, deg as 0 | 45 | 90 | 135 | 180 | 225 | 270 | 315)}
                                  className={`py-0.5 rounded border font-semibold transition ${
                                    wp.aspectIndex === deg 
                                      ? 'bg-[#00e5ff] text-black font-extrabold border-white shadow-[0_0_8px_#00e5ff]' 
                                      : 'bg-white/5 border-white/10 text-neutral-300 hover:bg-white/20'
                                  }`}
                                >
                                  {deg}°
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Preset 5-Point and 9-Point Tactical Courses */}
                  <div className="space-y-1 pt-1.5 border-t border-white/10">
                    <span className="text-[10px] text-neutral-400 font-medium block">교관 전술 코스 원클릭 자동 로드:</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        onClick={() => loadPreset9Waypoints(currentTarget.id, 'valley5')}
                        className="py-1 px-1.5 rounded bg-white/5 hover:bg-white/15 border border-white/10 text-[10px] text-neutral-200 text-left truncate"
                      >
                        🛣️ 계곡 도로 5개소 코스
                      </button>
                      <button
                        onClick={() => loadPreset9Waypoints(currentTarget.id, 'ridge9')}
                        className="py-1 px-1.5 rounded bg-white/5 hover:bg-white/15 border border-cyan-500/40 text-[10px] text-cyan-300 text-left truncate font-bold"
                      >
                        🌲 산림 9개소 풀코스
                      </button>
                    </div>
                  </div>
                </div>

                {/* 3. Motion Mode (Stationary vs Moving) */}
                <div className="space-y-1.5 pt-2 border-t border-white/10">
                  <span className="text-neutral-300 font-semibold block">기동 상태 제어:</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => {
                        updateTarget(currentTarget.id, { isMoving: false, destX: null, destY: null });
                        playTacticalSound('click');
                        showToast(`🛑 [${currentTarget.code}] 기동이 즉시 정지되어 진지에 고정되었습니다.`);
                      }}
                      className={`py-2 rounded-lg font-extrabold text-xs border transition flex items-center justify-center gap-1.5 ${
                        !currentTarget.isMoving 
                          ? 'bg-amber-500 text-black border-amber-400 shadow-[0_0_12px_#f59e0b]' 
                          : 'bg-red-600/30 hover:bg-red-600/50 text-red-200 border-red-500/40'
                      }`}
                    >
                      <Pause className="w-3.5 h-3.5" />
                      <span>🛑 정지 (진지 고정)</span>
                    </button>
                    <button
                      onClick={() => {
                        const pts = (currentTarget.maneuverPoints && currentTarget.maneuverPoints.length > 0)
                          ? currentTarget.maneuverPoints
                          : DEFAULT_VALLEY5_POINTS;
                        setHarnessLocked(false);
                        setIsPlaying(true);
                        updateTarget(currentTarget.id, { 
                          isMoving: true, 
                          maneuverPoints: pts, 
                          currentWpIndex: currentTarget.currentWpIndex ?? 0 
                        });
                        playTacticalSound('lase');
                        showToast(`🚀 [${currentTarget.name}] 기동이 시작되었습니다.`);
                      }}
                      className={`py-2 rounded-lg font-bold text-xs border transition flex items-center justify-center gap-1.5 ${
                        currentTarget.isMoving 
                          ? 'bg-emerald-600 text-white border-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.5)] animate-pulse' 
                          : 'bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10'
                      }`}
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>▶️ 기동 (주행 시작)</span>
                    </button>
                  </div>
                </div>

                {/* 3. 개별 표적 기동 속도 조절 (Individual Target Speed Control) */}
                <div className="p-2.5 rounded-xl bg-gradient-to-r from-slate-900/90 to-blue-950/70 border border-cyan-500/40 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-neutral-200 font-bold text-xs flex items-center gap-1.5">
                      <Gauge className="w-3.5 h-3.5 text-[#00e5ff]" /> 개별 기동 속도 조절:
                    </span>
                    <span className="px-2 py-0.5 rounded bg-black/80 border border-cyan-400/60 text-[#00e5ff] font-mono font-extrabold text-xs shadow-[0_0_8px_rgba(0,229,255,0.4)]">
                      {currentTarget.speedKmh ?? masterSpeedKmh} km/h
                    </span>
                  </div>

                  {/* Range Slider */}
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="0"
                      max="60"
                      step="1"
                      value={currentTarget.speedKmh ?? masterSpeedKmh}
                      onChange={(e) => {
                        const newSpeed = Number(e.target.value);
                        updateTarget(currentTarget.id, { speedKmh: newSpeed });
                      }}
                      className="w-full accent-cyan-400 cursor-pointer h-2 bg-neutral-700 rounded-lg"
                    />
                  </div>

                  {/* Speed Steppers & Presets */}
                  <div className="grid grid-cols-5 gap-1 text-[10px]">
                    {[
                      { spd: 0, label: '0 정지' },
                      { spd: 10, label: '10 포복' },
                      { spd: 20, label: '20 표준' },
                      { spd: 35, label: '35 고속' },
                      { spd: 50, label: '50 전속' },
                    ].map(({ spd, label }) => (
                      <button
                        key={spd}
                        onClick={() => {
                          updateTarget(currentTarget.id, { speedKmh: spd });
                          playTacticalSound('click');
                          showToast(`⚙️ [${currentTarget.code}] 기동 속도가 ${spd} km/h로 변경되었습니다.`);
                        }}
                        className={`py-1 rounded border font-bold text-[9px] transition ${
                          (currentTarget.speedKmh ?? masterSpeedKmh) === spd
                            ? 'bg-cyan-500 text-black border-cyan-300 font-extrabold shadow-[0_0_8px_#00e5ff]'
                            : 'bg-white/5 border-white/10 text-neutral-300 hover:bg-white/15'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Fine Adjustment Buttons (-5 / +5) */}
                  <div className="flex gap-1.5 pt-0.5">
                    <button
                      onClick={() => {
                        const cur = currentTarget.speedKmh ?? masterSpeedKmh;
                        const next = Math.max(0, cur - 5);
                        updateTarget(currentTarget.id, { speedKmh: next });
                        playTacticalSound('click');
                        showToast(`⚙️ [${currentTarget.code}] 속도 감속: ${next} km/h`);
                      }}
                      className="flex-1 py-1 rounded bg-white/5 hover:bg-white/10 border border-white/15 text-neutral-300 font-bold text-[10px] active:scale-95"
                    >
                      - 5 km/h
                    </button>
                    <button
                      onClick={() => {
                        const cur = currentTarget.speedKmh ?? masterSpeedKmh;
                        const next = Math.min(80, cur + 5);
                        updateTarget(currentTarget.id, { speedKmh: next });
                        playTacticalSound('click');
                        showToast(`⚙️ [${currentTarget.code}] 속도 가속: ${next} km/h`);
                      }}
                      className="flex-1 py-1 rounded bg-white/5 hover:bg-white/10 border border-cyan-400/30 text-cyan-300 font-bold text-[10px] active:scale-95"
                    >
                      + 5 km/h
                    </button>
                  </div>
                </div>

                {/* 3. Heading & Aspect Rotation (0° to 315°) */}
                <div className="p-2.5 rounded-xl bg-gradient-to-r from-blue-950/70 to-slate-900/80 border border-cyan-500/40 space-y-2">
                  <div className="flex justify-between items-center text-neutral-200">
                    <span className="font-bold text-xs flex items-center gap-1.5">
                      <Compass className="w-3.5 h-3.5 text-[#ffd700]" /> 차체 8방위 각도 (Aspect):
                    </span>
                    <span className="text-[#ffd700] font-mono font-extrabold text-xs px-2 py-0.5 rounded bg-black/60 border border-[#ffd700]/40">
                      {currentTarget.aspectIndex}° {getAspectName(currentTarget.aspectIndex)}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-1 text-[10px]">
                    {[
                      { deg: 0, label: '0° 후면', arrow: '↑' },
                      { deg: 45, label: '45° 우후방', arrow: '↗' },
                      { deg: 90, label: '90° 우측면', arrow: '→' },
                      { deg: 135, label: '135° 우전방', arrow: '↘' },
                      { deg: 180, label: '180° 정전면', arrow: '↓' },
                      { deg: 225, label: '225° 좌전방', arrow: '↙' },
                      { deg: 270, label: '270° 좌측면', arrow: '←' },
                      { deg: 315, label: '315° 좌후방', arrow: '↖' },
                    ].map(({ deg, label, arrow }) => (
                      <button
                        key={deg}
                        onClick={() => {
                          updateTarget(currentTarget.id, { 
                            aspectIndex: deg as 0 | 45 | 90 | 135 | 180 | 225 | 270 | 315,
                            headingDeg: deg,
                          });
                          playTacticalSound('lase');
                          showToast(`🧭 [${currentTarget.code}] 차체 8방위 각도가 ${deg}° (${getAspectName(deg)})로 변경되었습니다.`);
                        }}
                        className={`py-1.5 px-0.5 rounded-md border flex flex-col items-center justify-center gap-0.5 transition ${
                          currentTarget.aspectIndex === deg 
                            ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white border-white shadow-[0_0_12px_rgba(6,182,212,0.8)] font-extrabold scale-105 ring-1 ring-[#ffd700]' 
                            : 'bg-white/5 border-white/10 text-neutral-300 hover:bg-white/15 hover:text-white'
                        }`}
                        title={`${label} (${deg}°) 로 차체 회전`}
                      >
                        <span className="text-xs">{arrow}</span>
                        <span className="text-[8.5px] leading-none whitespace-nowrap">{label}</span>
                      </button>
                    ))}
                  </div>

                  <p className="text-[10px] text-neutral-400 leading-snug">
                    선택 시 <strong>지상 3D 나침반 링</strong>과 <strong>차체 3D 원근 투영</strong>이 즉시 회전하여 전술 방위각을 정확히 묘사합니다.
                  </p>
                </div>

                {/* 4. Target Destruction & Recovery Toggle */}
                <div className="space-y-1.5 pt-2 border-t border-white/10">
                  <span className="text-neutral-300 font-semibold block">표적 상태 판정:</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => updateTarget(currentTarget.id, { destroyed: true })}
                      className={`py-2 rounded-lg font-bold text-xs border transition ${
                        currentTarget.destroyed ? 'bg-red-600 text-white border-red-400' : 'bg-red-500/15 border-red-500/30 text-red-300'
                      }`}
                    >
                      💥 피탄 완파 (K-KILL)
                    </button>
                    <button
                      onClick={() => updateTarget(currentTarget.id, { destroyed: false })}
                      className={`py-2 rounded-lg font-bold text-xs border transition ${
                        !currentTarget.destroyed ? 'bg-blue-600 text-white border-blue-400' : 'bg-white/5 border-white/10 text-neutral-300'
                      }`}
                    >
                      🛡️ 정상 가동 복구
                    </button>
                  </div>
                </div>

                {/* 5. Delete This Target Button */}
                <div className="pt-2">
                  <button
                    onClick={() => deleteTarget(currentTarget.id)}
                    className="w-full py-2 rounded-lg bg-red-600/20 text-red-300 border border-red-500/40 hover:bg-red-600/30 font-bold text-xs flex items-center justify-center gap-1.5 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> 이 표적 화면에서 삭제
                  </button>
                </div>
              </div>
            )}

            {/* TAB 2: 새 표적 추가 배치 (INSTRUCTOR PLACEMENT PANEL) */}
            {rightPanelTab === 'placement' && role === 'instructor' && (
              <div className="min-h-0 flex-1 p-4 overflow-y-auto space-y-4 text-xs">
                <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 leading-snug">
                  <span className="font-bold block mb-1">📍 교관 실시간 표적 배치</span>
                  화면의 원하는 도로, 계곡, 능선을 클릭하면 해당 지점에 가상 표적이 즉시 생성되어 교육생 화면에 동기화됩니다.
                </div>

                <div className="space-y-2">
                  <span className="text-neutral-300 font-semibold">배치할 표적 종류 선택:</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setPlacingCategory('SPH')}
                      className={`p-2 rounded-lg border font-bold flex items-center gap-2 text-[11px] ${
                        placingCategory === 'SPH' ? 'bg-amber-600 text-white border-amber-400 shadow-md' : 'bg-white/5 border-white/10 text-neutral-300'
                      }`}
                    >
                      <span>🪖</span> 170mm 자주포 (SPH)
                    </button>
                    <button
                      onClick={() => setPlacingCategory('AFV')}
                      className={`p-2 rounded-lg border font-bold flex items-center gap-2 text-[11px] ${
                        placingCategory === 'AFV' ? 'bg-amber-600 text-white border-amber-400 shadow-md' : 'bg-white/5 border-white/10 text-neutral-300'
                      }`}
                    >
                      <span>🛡️</span> 장갑차 (AFV 기동)
                    </button>
                    <button
                      onClick={() => setPlacingCategory('CP')}
                      className={`p-2 rounded-lg border font-bold flex items-center gap-2 text-[11px] ${
                        placingCategory === 'CP' ? 'bg-amber-600 text-white border-amber-400 shadow-md' : 'bg-white/5 border-white/10 text-neutral-300'
                      }`}
                    >
                      <span>⛺</span> 지휘소 벙커 (CP)
                    </button>
                    <button
                      onClick={() => setPlacingCategory('INF')}
                      className={`p-2 rounded-lg border font-bold flex items-center gap-2 text-[11px] ${
                        placingCategory === 'INF' ? 'bg-amber-600 text-white border-amber-400 shadow-md' : 'bg-white/5 border-white/10 text-neutral-300'
                      }`}
                    >
                      <span>👤</span> 적 보병대 (INF)
                    </button>
                  </div>
                </div>

                {/* Target List with Quick Select */}
                <div className="space-y-1.5 pt-2 border-t border-white/10">
                  <div className="flex justify-between text-neutral-400 font-medium">
                    <span>배치된 표적 목록 ({targets.length}개)</span>
                    <button
                      onClick={() => {
                        setTargets([]);
                        broadcastUpdate([]);
                        showToast('🗑️ 모든 표적이 삭제되었습니다.');
                      }}
                      className="text-red-400 hover:underline text-[10px]"
                    >
                      전체 삭제
                    </button>
                  </div>
                  <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                    {targets.map(t => (
                      <div 
                        key={t.id} 
                        onClick={() => { setSelectedTargetId(t.id); setRightPanelTab('inspector'); }}
                        className={`flex items-center justify-between p-1.5 rounded border text-[11px] cursor-pointer ${
                          selectedTargetId === t.id ? 'bg-blue-600/30 border-blue-400 text-white' : 'bg-black/40 border-white/5 text-neutral-300 hover:bg-white/5'
                        }`}
                      >
                        <span className="truncate">{t.name}</span>
                        <span className="text-[#ffd700] font-mono text-[10px]">({Math.round(t.x)}%, {Math.round(t.y)}%)</span>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => {
                    broadcastUpdate(targets);
                    showToast('📡 교육생 화면으로 모든 표적과 평가 점수가 동기화되었습니다!');
                  }}
                  className="w-full py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-emerald-600 text-white font-bold text-xs shadow-lg flex items-center justify-center gap-1.5 hover:brightness-110 active:scale-[0.98] transition"
                >
                  <Send className="w-3.5 h-3.5" /> 교육생 화면에 즉시 동기화 (SYNC)
                </button>
              </div>
            )}

            {/* TAB 3: 교관 평가 (점수판 - TRAINEE DEFAULT & INSTRUCTOR SCORE TAB) */}
            {(role === 'trainee' || rightPanelTab === 'score') && (
              <div className="min-h-0 flex-1 p-4 overflow-y-auto space-y-4 text-neutral-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neutral-400 font-medium">종합 평가</span>
                  <span className="text-[11px] text-blue-400">실시간 채점</span>
                </div>

                {/* Radial Circular Score Gauge: 85 / 100 */}
                <div className="flex flex-col items-center justify-center py-2">
                  <div className="relative w-24 h-24 flex items-center justify-center">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                      <path
                        className="text-neutral-800"
                        strokeWidth="3"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <path
                        className="text-emerald-400"
                        strokeDasharray={`${totalScore}, 100`}
                        strokeWidth="3.2"
                        strokeLinecap="round"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                    </svg>
                    <div className="absolute flex flex-col items-center">
                      <span className="text-2xl font-bold text-white tracking-tight">{totalScore}</span>
                      <span className="text-[10px] text-neutral-400 -mt-1">/100</span>
                    </div>
                  </div>
                  <span className="mt-2 text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    {totalScore >= 80 ? '우수' : totalScore >= 60 ? '보통' : '미흡'}
                  </span>
                </div>

                {/* 5-Criteria Evaluation Breakdown */}
                <div className="space-y-2 pt-1 border-t border-white/10 text-xs">
                  <div className="text-[11px] font-semibold text-neutral-400 mb-1">평가 항목</div>
                  <div className="flex justify-between items-center py-0.5">
                    <span className="text-neutral-300">표적 식별</span>
                    <span className="font-mono font-bold text-white">{scores.identification}/20</span>
                  </div>
                  <div className="flex justify-between items-center py-0.5">
                    <span className="text-neutral-300">정보 보고</span>
                    <span className="font-mono font-bold text-white">{scores.report}/20</span>
                  </div>
                  <div className="flex justify-between items-center py-0.5">
                    <span className="text-neutral-300">사격요구</span>
                    <span className="font-mono font-bold text-white">{scores.callForFire}/20</span>
                  </div>
                  <div className="flex justify-between items-center py-0.5">
                    <span className="text-neutral-300">안전 확인</span>
                    <span className="font-mono font-bold text-white">{scores.safety}/20</span>
                  </div>
                  <div className="flex justify-between items-center py-0.5">
                    <span className="text-neutral-300">결과 보고</span>
                    <span className="font-mono font-bold text-white">{scores.bda}/20</span>
                  </div>
                </div>

                {/* Feedback Text Box */}
                <div className="p-2.5 rounded-lg bg-black/40 border border-white/10 text-xs space-y-1">
                  <div className="text-[11px] font-semibold text-neutral-400">피드백</div>
                  {role === 'instructor' ? (
                    <textarea
                      value={instructorFeedback}
                      onChange={(e) => {
                        setInstructorFeedback(e.target.value);
                        broadcastUpdate(targets, scores, e.target.value);
                      }}
                      rows={3}
                      className="w-full bg-neutral-900 border border-white/20 rounded p-1.5 text-white text-[11px]"
                    />
                  ) : (
                    <p className="text-neutral-300 text-[11px] leading-relaxed">
                      {instructorFeedback}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* TAB 4: 전체 기동 및 환경 설정 (FLEET CONTROLLER - INSTRUCTOR ONLY) */}
            {role === 'instructor' && rightPanelTab === 'menu' && (
              <div className="min-h-0 flex-1 p-4 overflow-y-auto space-y-4 text-xs">
                {/* Fleet Master Control */}
                <div className="space-y-1.5">
                  <span className="text-neutral-300 font-semibold block">전체 표적 동시 제어:</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => {
                        const nextPlaying = !isPlaying;
                        setIsPlaying(nextPlaying);
                        if (nextPlaying) {
                          setHarnessLocked(false);
                          setTargets(prev => {
                            const next = prev.map(t => {
                              const pts = (t.maneuverPoints && t.maneuverPoints.length > 0) ? t.maneuverPoints : DEFAULT_VALLEY5_POINTS;
                              return {
                                ...t,
                                isMoving: t.category === 'AFV' || t.category === 'SPH',
                                maneuverPoints: pts,
                                currentWpIndex: t.currentWpIndex ?? 0,
                              };
                            });
                            broadcastUpdate(next);
                            return next;
                          });
                          playTacticalSound('lase');
                          showToast('▶️ [전체 기동 시작] 교관 명령에 의한 모든 표적 주행이 시작되었습니다!');
                        } else {
                          setTargets(prev => {
                            const next = prev.map(t => ({ ...t, isMoving: false }));
                            broadcastUpdate(next);
                            return next;
                          });
                          playTacticalSound('click');
                          showToast('🛑 [전체 기동 정지] 모든 표적의 기동이 동결되었습니다.');
                        }
                      }}
                      className={`py-2 rounded-lg font-bold flex items-center justify-center gap-1.5 transition ${
                        isPlaying ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      }`}
                    >
                      {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      {isPlaying ? '전체 기동 정지' : '전체 기동 시작'}
                    </button>
                    <button
                      onClick={() => {
                        const updated = targets.map(t => ({ ...t, destroyed: false }));
                        setTargets(updated);
                        broadcastUpdate(updated);
                        setCffState('STANDBY');
                        showToast('🔄 모든 표적 상태가 초기화되었습니다.');
                      }}
                      className="py-2 rounded-lg font-bold bg-blue-600/20 text-blue-300 border border-blue-500/40 hover:bg-blue-600/30 flex items-center justify-center gap-1"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> 전체 복구 리셋
                    </button>
                  </div>
                </div>

                {/* Master Speed Slider */}
                <div className="space-y-1.5 pt-2 border-t border-white/10">
                  <div className="flex justify-between text-neutral-300 font-semibold">
                    <span>전체 기본 기동 속도</span>
                    <span className="text-emerald-400 font-bold">{masterSpeedKmh} km/h</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="40"
                    step="5"
                    value={masterSpeedKmh}
                    onChange={(e) => setMasterSpeedKmh(Number(e.target.value))}
                    className="w-full h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>

                {/* Road Course Presets */}
                <div className="space-y-1.5 pt-2 border-t border-white/10">
                  <span className="text-neutral-400 font-medium">도로 코스 선택:</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => resetRoadWaypoints('valley')}
                      className="py-1.5 rounded bg-white/10 hover:bg-white/20 text-[#60a5fa] font-bold text-[11px] border border-white/10"
                    >
                      🏞️ 계곡도로
                    </button>
                    <button
                      onClick={() => resetRoadWaypoints('bridge')}
                      className="py-1.5 rounded bg-white/10 hover:bg-white/20 text-[#ffd700] font-bold text-[11px] border border-white/10"
                    >
                      🌉 교량도로
                    </button>
                  </div>
                </div>

                {/* Background Selector */}
                <div className="space-y-1.5 pt-2 border-t border-white/10">
                  <span className="text-neutral-400 font-medium">관측소 배경 변경:</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => { setBgMode('mountain'); playTacticalSound('click'); }}
                      className={`py-1 rounded text-[11px] font-medium border ${bgMode === 'mountain' ? 'bg-blue-600 text-white border-blue-400' : 'border-white/10 text-neutral-300'}`}
                    >
                      산악 관측소
                    </button>
                    <button
                      onClick={() => { setBgMode('urban'); playTacticalSound('click'); }}
                      className={`py-1 rounded text-[11px] font-medium border ${bgMode === 'urban' ? 'bg-blue-600 text-white border-blue-400' : 'border-white/10 text-neutral-300'}`}
                    >
                      도심 관측소
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>
      )}

      {/* ── Bottom Navigation Toolbar (5 Tactical Steps) ── */}
      {uiVisible && (
        <nav className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 p-1.5 rounded-2xl bg-[#0a1525]/85 backdrop-blur-md border border-[#1e3a5f] shadow-2xl">
          <button
            onClick={() => { setActiveStep(1); playTacticalSound('click'); }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition ${
              activeStep === 1 
                ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-[0_0_15px_rgba(59,130,246,0.6)]' 
                : 'text-neutral-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <Crosshair className="w-4 h-4" />
            <span>표적 식별</span>
          </button>

          <button
            onClick={() => { 
              setActiveStep(2); 
              playTacticalSound('click');
              setScores(s => ({ ...s, report: 20 }));
              showToast('📄 표적 제원(GRID, 방위각, 사거리) 정보가 FDC에 보고되었습니다.');
            }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition ${
              activeStep === 2 
                ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-[0_0_15px_rgba(59,130,246,0.6)]' 
                : 'text-neutral-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>정보 보고</span>
          </button>

          <button
            onClick={() => { 
              startCallForFire();
            }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition ${
              activeStep === 3 
                ? 'bg-gradient-to-r from-red-600 to-amber-600 text-white shadow-[0_0_18px_rgba(239,68,68,0.6)]' 
                : 'text-neutral-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <Target className="w-4 h-4" />
            <span>사격요구</span>
          </button>

          <button
            onClick={() => { 
              setActiveStep(4); 
              playTacticalSound('click');
              setScores(s => ({ ...s, safety: 20 }));
              showToast('🛡️ 아군 피해 예상 반경 및 사격 방위 안전 확인 완료.');
            }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition ${
              activeStep === 4 
                ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-[0_0_15px_rgba(59,130,246,0.6)]' 
                : 'text-neutral-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>안전 확인</span>
          </button>

          <button
            onClick={() => { 
              setActiveStep(5); 
              playTacticalSound('click');
              showToast('📋 BDA 피해평가: 표적 기능 완전 상실(K-KILL) 보고 완료.');
            }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition ${
              activeStep === 5 
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-[0_0_15px_rgba(16,185,129,0.6)]' 
                : 'text-neutral-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            <span>결과 보고</span>
          </button>
        </nav>
      )}

      {/* ── Bottom Right: Camera Shutter Button ── */}
      {uiVisible && (
        <div className="absolute bottom-4 right-4 z-30 flex items-center gap-2">
          <button
            onClick={() => { showToast('📸 현재 관측 화면 캡처 저장 완료'); playTacticalSound('click'); }}
            className="w-11 h-11 rounded-full bg-white/90 border-2 border-neutral-300 shadow-xl hover:scale-105 active:scale-95 transition flex items-center justify-center"
            title="관측 사진 촬영"
          >
            <div className="w-8 h-8 rounded-full border border-neutral-400" />
          </button>
        </div>
      )}

      {/* ── 📡 실시간 동기화 상태 및 모바일 연동 안내 모달 ── */}
      {showSyncModal && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[#0a1525] border border-cyan-500/50 rounded-2xl p-6 shadow-[0_0_50px_rgba(0,229,255,0.3)] space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Radio className="w-5 h-5 text-cyan-400 animate-pulse" />
                <h3 className="font-bold text-base text-white">교관 ↔ 교육생 실시간 동기화 확인 가이드</h3>
              </div>
              <button 
                onClick={() => setShowSyncModal(false)}
                className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 text-base"
              >
                ✕
              </button>
            </div>

            {/* Current Sync Status Badge */}
            <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
                <div>
                  <span className="text-xs font-bold text-emerald-300 block">실시간 동기화 채널 정상 가동 중</span>
                  <span className="text-[11px] text-neutral-300">W3C BroadcastChannel (0ms 초저지연) + REST API Polling (1.2초 주기)</span>
                </div>
              </div>
              <span className="text-[10px] px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold border border-emerald-500/30">
                연결 정상
              </span>
            </div>

            {/* Method 1: Dual View on Same PC */}
            <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                  <Monitor className="w-4 h-4" /> 방법 1. 동일 PC 분할 창으로 확인 (가장 확실 & 추천!)
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold">
                  0ms 실시간
                </span>
              </div>
              <p className="text-xs text-neutral-300 leading-relaxed">
                아래 버튼을 누르면 <strong>[교육생 관측 전용 화면]</strong>이 새 창으로 즉시 뜹니다. 모니터 한쪽에 교관 창, 다른 쪽에 교육생 창을 분할 배치하고, 교관 창에서 표적을 배치/수정한 후 <strong>[⚡ 교육생 화면에 일치화]</strong> 버튼을 누르면 교육생 창에 동일하게 일치되어 전개됩니다.
              </p>
              <button
                onClick={() => {
                  window.open('/tactical-ar/trainee', '_blank', 'width=1100,height=800');
                  setShowSyncModal(false);
                  showToast('📱 교육생 관측 화면이 새 창으로 실행되었습니다!');
                }}
                className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-md transition"
              >
                <ExternalLink className="w-3.5 h-3.5" /> 🪟 교육생 화면 새 창 분할 실행하기
              </button>
            </div>

            {/* Method 2: Cloudflare Deployment URLs */}
            <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#ffd700] flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4" /> 방법 2. 클라우드플레어 공식 배포 주소 (모바일/PC 어디서나 접속)
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                  글로벌 배포 LIVE
                </span>
              </div>
              
              {/* Trainee URL Box */}
              <div className="space-y-1">
                <div className="text-[11px] font-semibold text-cyan-300 flex items-center justify-between">
                  <span>👨‍🎓 교육생용 홈페이지 (관측·훈련·점수판)</span>
                  <a href="/tactical-ar/trainee" className="text-[10px] text-cyan-400 hover:underline flex items-center gap-0.5">
                    바로 열기 <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
                <div className="p-2 rounded-lg bg-black/60 border border-white/10 flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] text-cyan-200 truncate select-all">
                    {`${currentOrigin}/tactical-ar/trainee`}
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${currentOrigin}/tactical-ar/trainee`);
                      playTacticalSound('click');
                      showToast('📋 [교육생용 주소 복사 완료] 스마트폰이나 교육생 PC에 전달하세요!');
                    }}
                    className="px-2.5 py-1 rounded bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-200 text-xs font-bold whitespace-nowrap flex items-center gap-1 transition"
                  >
                    <Copy className="w-3 h-3" /> 복사
                  </button>
                </div>
              </div>

              {/* Instructor URL Box */}
              <div className="space-y-1">
                <div className="text-[11px] font-semibold text-amber-300 flex items-center justify-between">
                  <span>🎖️ 교관용 홈페이지 (전술통제·하네스·채점)</span>
                  <a href="/tactical-ar/instructor" className="text-[10px] text-amber-400 hover:underline flex items-center gap-0.5">
                    바로 열기 <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
                <div className="p-2 rounded-lg bg-black/60 border border-white/10 flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] text-amber-200 truncate select-all">
                    {`${currentOrigin}/tactical-ar/instructor`}
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${currentOrigin}/tactical-ar/instructor`);
                      playTacticalSound('click');
                      showToast('📋 [교관용 주소 복사 완료] 교관 관제실 주소가 복사되었습니다!');
                    }}
                    className="px-2.5 py-1 rounded bg-amber-600/30 hover:bg-amber-600/50 text-amber-200 text-xs font-bold whitespace-nowrap flex items-center gap-1 transition"
                  >
                    <Copy className="w-3 h-3" /> 복사
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowSyncModal(false)}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-neutral-200 text-xs font-bold transition"
              >
                확인 완료
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
