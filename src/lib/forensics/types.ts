export interface ForensicsTool {
  id: string;
  name: string;
  description: string;
  category: 'metadata' | 'steganalysis' | 'ai-detection' | 'ela' | 'noise' | 'nsfw' | 'ocr' | 'hash' | 'embedded' | 'yara' | 'redaction' | 'report';
  configured: boolean;
}

export interface MetadataEntry {
  key: string;
  value: string;
  group?: string;
  sensitive?: boolean;
}

export interface MetadataResult {
  entries: MetadataEntry[];
  total: number;
  hasGps: boolean;
  gps?: { lat: number; lng: number };
  hasTimestamps: boolean;
  software?: string;
  device?: string;
}

export interface ElaResult {
  score: number;
  mean: number;
  stddev: number;
  histogram: number[];
  suspicious: boolean;
  regions: ElaRegion[];
}

export interface ElaRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
  severity: 'low' | 'medium' | 'high';
}

export interface SteganalysisResult {
  lsbDetected: boolean;
  lsbConfidence: number;
  primaryMethod: string;
  methods: StegoMethodResult[];
  estimatedCapacity?: number;
  suspiciousChannels: string[];
}

export interface StegoMethodResult {
  name: string;
  detected: boolean;
  confidence: number;
  description: string;
}

export interface AiDetectionResult {
  isAiGenerated: boolean;
  confidence: number;
  score: number;
  signals: AiSignal[];
}

export interface AiSignal {
  name: string;
  value: number;
  threshold: number;
  passed: boolean;
  description: string;
}

export interface NoiseResult {
  meanNoise: number;
  stddevNoise: number;
  snr: number;
  uniformityScore: number;
  suspicious: boolean;
  bandingDetected: boolean;
}

export interface NsfwResult {
  isNsfw: boolean;
  confidence: number;
  categories: NsfwCategory[];
}

export interface NsfwCategory {
  name: string;
  score: number;
}

export interface OcrResult {
  text: string;
  confidence: number;
  boxes: TextBox[];
  piiFound: PiiEntity[];
}

export interface TextBox {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
}

export interface PiiEntity {
  type: string;
  text: string;
  confidence: number;
}

export interface HashResult {
  sha256: string;
  md5?: string;
  crc32?: string;
  fileSize: number;
  mimeType: string;
}

export interface EmbeddedFileResult {
  count: number;
  files: EmbeddedFile[];
}

export interface EmbeddedFile {
  offset: number;
  size: number;
  type: string;
  signature: string;
  description: string;
}

export interface YaraMatch {
  rule: string;
  description: string;
  severity: 'info' | 'warning' | 'malicious';
  tags: string[];
}

export interface YaraResult {
  matches: YaraMatch[];
  totalRules: number;
  matchedRules: number;
  riskLevel: 'safe' | 'suspicious' | 'malicious';
}

export interface RedactionResult {
  redactedImageBase64?: string;
  piiRemoved: number;
  metadataStripped: boolean;
  originalSize: number;
  processedSize: number;
}

export interface ForensicsReport {
  summary: string;
  riskLevel: 'safe' | 'suspicious' | 'likely_manipulated' | 'malicious';
  riskScore: number;
  findings: ReportFinding[];
  toolsUsed: string[];
  timestamp: string;
  fileName: string;
}

export interface ReportFinding {
  category: string;
  title: string;
  description: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  score: number;
}

export interface AnalysisResult {
  ok: boolean;
  fileName: string;
  fileSize: number;
  mimeType: string;
  error?: string;
  metadata?: MetadataResult;
  ela?: ElaResult;
  steganalysis?: SteganalysisResult;
  aiDetection?: AiDetectionResult;
  noise?: NoiseResult;
  nsfw?: NsfwResult;
  ocr?: OcrResult;
  hash?: HashResult;
  embedded?: EmbeddedFileResult;
  yara?: YaraResult;
  report?: ForensicsReport;
  toolsRun: string[];
  elapsedMs: number;
}

export type AnalysisMode = 'quick' | 'standard' | 'deep';

export interface AnalysisRequest {
  tools?: string[];
  mode?: AnalysisMode;
  redact?: boolean;
  redactPii?: boolean;
  stripMetadata?: boolean;
}
