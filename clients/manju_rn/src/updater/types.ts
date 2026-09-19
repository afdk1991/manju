/**
 * OTA 更新协议 v1 的 TypeScript 数据模型（单一事实来源：spec/ota-protocol.v1.md）。
 *
 * 字段名、枚举值与服务端及 Flutter / Tauri / ArkTS 三端严格一致，不得自定义。
 * 协议中的下划线字段（如 has_update / sha256 / store_fallback）原样保留。
 */

/** 目标平台。 */
export type OtaPlatform = 'android' | 'ios' | 'harmonyos' | 'windows' | 'macos' | 'linux';

/** CPU 架构。 */
export type OtaArch = 'x86_64' | 'arm64' | 'armv7' | 'x86';

/** 发布通道。 */
export type OtaChannel = 'stable' | 'beta' | 'nightly';

/** 更新安装策略。 */
export type UpdatePolicy = 'suggest' | 'forced' | 'silent';

/** 上报事件。 */
export type OtaReportEvent =
  | 'downloaded'
  | 'installed'
  | 'failed'
  | 'skipped'
  | 'unsupported';

/** 安装包产物。 */
export interface OtaArtifact {
  type:
    | 'apk'
    | 'aab'
    | 'ipa'
    | 'hap'
    | 'app'
    | 'msix'
    | 'exe'
    | 'dmg'
    | 'pkg'
    | 'appimage'
    | 'deb'
    | 'rpm'
    | 'tar_gz'
    | 'zip';
  url: string;
  size: number;
  /** 十六进制小写 SHA256，客户端必须校验。 */
  sha256: string;
  /** Ed25519 签名，格式 `ed25519:<base64>`。 */
  signature?: string;
  install_args?: string[];
}

/** 增量更新包（可选）。 */
export interface OtaDelta {
  available: boolean;
  from_versions: string[];
  url?: string;
  size?: number;
  sha256?: string;
}

/** 一个已发布的版本。 */
export interface OtaRelease {
  version: string;
  build: number;
  channel: OtaChannel;
  released_at: string;
  /** 低于此版本的客户端会被服务端标记为 forced 强制更新。 */
  min_supported_version: string;
  notes_i18n: Record<string, string>;
  artifact: OtaArtifact;
  delta?: OtaDelta | null;
}

/** 商店兜底信息（iOS / HarmonyOS 必填）。 */
export interface StoreFallback {
  enabled: boolean;
  url: string;
  reason: string;
}

/** GET /api/v1/ota/check 的响应。 */
export interface OtaCheckResponse {
  has_update: boolean;
  policy: UpdatePolicy;
  release?: OtaRelease;
  store_fallback?: StoreFallback;
}

/** POST /api/v1/ota/report 的请求体。 */
export interface OtaReportPayload {
  device_id: string;
  platform: OtaPlatform;
  version: string;
  build: number;
  event: OtaReportEvent;
  reason?: string;
  elapsed_ms?: number;
}

/** 该平台是否具备"下载后静默自安装"能力（操作系统级限制，非实现问题）。 */
export function canSelfInstall(platform: OtaPlatform): boolean {
  switch (platform) {
    // 桌面端：可静默自安装
    case 'windows':
    case 'macos':
    case 'linux':
      return true;
    // Android：需用户先授予"允许来自此来源的应用"，属于有条件支持
    case 'android':
      return true;
    // iOS / HarmonyOS：严禁声称支持自动安装
    case 'ios':
    case 'harmonyos':
      return false;
  }
}

/** 该平台自安装是否需要用户事先授权（Android 的未知来源开关）。 */
export function requiresInstallPermission(platform: OtaPlatform): boolean {
  return platform === 'android';
}

/** 取指定 locale 的更新说明，找不到时降级到中文 / 英文 / 首条。 */
export function pickNotes(
  notes: Record<string, string> | undefined,
  locale: string,
): string {
  if (!notes) return '';
  return (
    notes[locale] ??
    notes['zh-CN'] ??
    notes['en'] ??
    (Object.keys(notes).length > 0 ? notes[Object.keys(notes)[0]] : '')
  );
}
