// ============================================================================
// 内容中台 + OTA 协议 —— 类型定义（与 spec/openapi.yaml、spec/ota-protocol.v1.md 严格对应）
// 字段名/枚举值四端（Flutter / Tauri / RN / ArkTS）共用同一份，禁止改名。
// ============================================================================

export type Platform =
  | "android"
  | "ios"
  | "harmonyos"
  | "windows"
  | "macos"
  | "linux";

export type Arch = "x86_64" | "arm64" | "armv7" | "x86";

export type Channel = "stable" | "beta" | "nightly";

export type Quality =
  | "auto"
  | "240p"
  | "360p"
  | "480p"
  | "720p"
  | "1080p"
  | "2k"
  | "4k";

export type Container = "hls" | "dash" | "mp4" | "webm";

export interface VideoSource {
  quality: Quality;
  url: string;
  container: Container;
  codec?: string;
  bitrate_kbps?: number;
  size_bytes?: number;
}

export interface SubtitleTrack {
  lang: string;
  label: string;
  url: string;
  format: "vtt" | "srt" | "ass";
  is_default?: boolean;
}

export interface SeriesBase {
  id: string;
  title: string;
  original_title?: string | null;
  cover: string;
  poster?: string | null;
  banner?: string | null;
  synopsis: string;
  tags: string[];
  category_id: string;
  region: string;
  release_year: number;
  status: "ongoing" | "completed" | "upcoming";
  total_episodes: number;
  score: number;
  views: number;
  is_vip: boolean;
  age_rating: "all" | "13" | "16" | "18";
}

export interface Episode {
  id: string;
  series_id: string;
  index: number;
  title: string;
  thumbnail?: string | null;
  duration_sec: number;
  is_free: boolean;
  sources: VideoSource[];
  subtitles: SubtitleTrack[];
}

export interface Series extends SeriesBase {
  episodes: Episode[];
}

export interface HomeSection {
  id: string;
  title: string;
  layout: "swipe" | "grid" | "list" | "rank";
  items: SeriesBase[];
}

export interface Category {
  id: string;
  name: string;
  icon?: string | null;
}

export interface Page {
  page: number;
  size: number;
  total: number;
  has_more: boolean;
}

// ----------------------------- OTA 协议 -----------------------------

export type ArtifactType =
  | "apk" | "aab" | "ipa" | "hap" | "app"
  | "msix" | "exe" | "dmg" | "pkg"
  | "appimage" | "deb" | "rpm" | "tar_gz" | "zip";

export interface Artifact {
  type: ArtifactType;
  url: string;
  size: number;
  sha256: string;
  signature?: string; // 格式 ed25519:<base64>
  install_args?: string[];
}

export interface Delta {
  available: boolean;
  from_versions: string[];
  url: string;
  size: number;
  sha256: string;
}

export interface OtaRelease {
  version: string;
  build: number;
  channel: Channel;
  released_at: string;
  min_supported_version: string;
  notes_i18n: Record<string, string>;
  artifact: Artifact;
  delta?: Delta | null;
}

export type OtaPolicy = "suggest" | "forced" | "silent";

export interface StoreFallback {
  enabled: boolean;
  url: string;
  reason: string;
}

export interface OtaCheckResponse {
  has_update: boolean;
  policy: OtaPolicy;
  release: OtaRelease;
  store_fallback?: StoreFallback | null;
}

export type OtaEvent =
  | "downloaded"
  | "installed"
  | "failed"
  | "skipped"
  | "unsupported";

export interface OtaReportPayload {
  device_id: string;
  platform: Platform;
  version: string;
  build: number;
  event: OtaEvent;
  reason?: string;
  elapsed_ms?: number;
}
