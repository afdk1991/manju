// ============================================================================
// 更新编排器（检查 → 下载 → 校验 → 安装 → 重启）
//
// ┌──────────────────────────────────────────────────────────────────────┐
// │  两条更新路径（核心设计，二选一，互不冲突）                              │
// │                                                                        │
// │  【路径 A · 官方 Tauri Updater Plugin】                                 │
// │    - 适用于：产物**已签名**、通过 tauri.conf.json 的 `endpoints`        │
// │      分发的场景（Tauri 官方推荐）。                                     │
// │    - 优点：开箱即用、自动校验签名、内置进度。                            │
// │    - 前提：必须在 tauri.conf.json 配置 `pubkey` + 签名产物；            │
// │      未签名时会直接报错（或被迫开 `dangerousInsecureTransportProtocol`， │
// │      **仅限内网/测试，严禁生产使用**）。                                │
// │    - 代码见下方 `runOfficialUpdater()`。                                │
// │                                                                        │
// │  【路径 B · 自定义下载 + 安装（本项目采用）】                            │
// │    - 适用于：走本项目自有 OTA 协议（GET /api/v1/ota/check），           │
// │      产物可能尚未接入 Tauri 签名体系，或需要 delta 差分/灰度放量。       │
// │    - 自己用 plugin-http 下载、plugin-fs 落盘、本项目公钥做 Ed25519 验签  │
// │      （verify.ts），最后按平台拉起系统安装器（install.ts）。            │
// │    - 优点：与 Flutter / RN 三端共用同一份 JS 契约，行为完全一致。        │
// │                                                                        │
// │  红线：桌面三端（Windows/macOS/Linux）**具备静默安装能力**，            │
// │       可真正无感升级；但 iOS/鸿蒙不在此客户端范围内。                    │
// └──────────────────────────────────────────────────────────────────────┘
// ============================================================================

import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import { otaApi } from "../api/client";
import type { OtaCheckResponse, OtaRelease, Platform } from "../api/types";
import { getDeviceInfo } from "./device";
import { downloadArtifact } from "./download";
import { installArtifact } from "./install";
import { verifyArtifact } from "./verify";

/**
 * 构建号：服务端判断更新的主依据，发布新版时务必同步递增。
 * 说明：`@tauri-apps/api/app` 仅导出 `getVersion()`，没有 `getBuildNumber()`，
 * 而 `tauri.conf.json` 也只有 `version` 字段，因此 build 由本常量统一提供。
 */
export const APP_BUILD = 100;

/** 兜底版本号：仅当脱离 Tauri 运行时（如纯前端预览）才使用，正常应来自清单。 */
const FALLBACK_VERSION = "1.0.0";

export type UpdatePhase =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "verifying"
  | "installing"
  | "waitingRestart"
  | "done"
  | "failed";

export interface UpdateState {
  phase: UpdatePhase;
  ratio: number;
  message?: string;
  release?: OtaRelease;
  error?: string;
}

let lastEtag: string | null = null;

/** 判断平台是否为桌面三端之一（具备静默自安装能力）。类型谓词，便于后续收窄。 */
function isDesktopPlatform(p: Platform): p is "windows" | "macos" | "linux" {
  return p === "windows" || p === "macos" || p === "linux";
}

/** 语义化版本比较，判断 newV/newBuild 是否比 curV/curBuild 更新。 */
function isNewer(
  newV: string,
  newBuild: number,
  curV: string,
  curBuild: number,
): boolean {
  if (newBuild > curBuild) return true;
  if (newBuild < curBuild) return false;
  const pa = curV.split(/[.+]/).map((n) => parseInt(n, 10) || 0);
  const pb = newV.split(/[.+]/).map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pb[i] ?? 0) !== (pa[i] ?? 0)) return (pb[i] ?? 0) > (pa[i] ?? 0);
  }
  return false;
}

/** 检查更新（按协议必填参数请求，含 304 协商）。 */
export async function checkForUpdate(): Promise<OtaCheckResponse | null> {
  const { platform, arch, deviceId } = await getDeviceInfo();
  // 当前版本从应用清单读取（与 tauri.conf.json 的 version 一致）；
  // 构建号取统一常量 APP_BUILD（@tauri-apps/api/app 不提供 getBuildNumber）。
  // 脱离 Tauri 运行时（纯前端预览）时回退到兜底值，避免崩溃。
  let appVersion = FALLBACK_VERSION;
  let appBuild = APP_BUILD;
  try {
    appVersion = await getVersion();
  } catch {
    /* 非 Tauri 环境，使用兜底值 */
  }

  // iOS/鸿蒙不在桌面端，无需 store_fallback 分支，但保留兜底逻辑。
  const res = await otaApi.check({
    platform,
    arch,
    channel: "stable",
    version: appVersion,
    build: appBuild,
    device_id: deviceId,
    locale: "zh-CN",
    lastEtag,
  });
  if (!res) return null;
  lastEtag = res.etag;

  const body = res.body;
  // 客户端侧兜底：拒绝降级（除非 channel 切换，此处从 stable 仅接受更新）。
  if (!body.has_update || !body.release) return null;
  if (!isNewer(body.release.version, body.release.build, appVersion, appBuild)) {
    throw new Error("rollback_attempt: 服务端返回了更旧的版本，已拒绝");
  }
  return body;
}

/** 路径 B：自定义下载 + 校验 + 安装。 */
export async function applyCustomUpdate(
  release: OtaRelease,
  onProgress: (s: UpdateState) => void,
): Promise<boolean> {
  const device = await getDeviceInfo();
  const { platform, deviceId } = device;
  const artifact = release.artifact;
  const sw = performance.now();

  // 红线：桌面三端（windows/macos/linux）才具备静默自安装能力；
  // 其余平台（理论不会在桌面端出现）直接上报 unsupported 并拒绝，保持与 Flutter/RN 端一致。
  if (!isDesktopPlatform(platform)) {
    await otaApi.report({
      device_id: deviceId,
      platform,
      version: release.version,
      build: release.build,
      event: "unsupported",
      reason: "platform_not_self_installable",
    });
    onProgress({
      phase: "failed",
      ratio: 1,
      release,
      error: `当前平台 ${platform} 不支持自动安装`,
    });
    return false;
  }

  try {
    // 1. 下载
    onProgress({
      phase: "downloading",
      ratio: 0,
      release,
      message: "正在下载更新包",
    });
    const bytes = await downloadArtifact(artifact, (p) =>
      onProgress({ phase: "downloading", ratio: p.ratio, release }),
    );
    await otaApi.report({
      device_id: deviceId,
      platform,
      version: release.version,
      build: release.build,
      event: "downloaded",
      elapsed_ms: Math.round(performance.now() - sw),
    });

    // 2. 校验（生命线）
    onProgress({ phase: "verifying", ratio: 1, release, message: "正在校验安装包" });
    const v = verifyArtifact(
      bytes,
      artifact.sha256,
      release.version,
      release.build,
      artifact.url,
      artifact.signature,
    );
    if (!v.ok) {
      await otaApi.report({
        device_id: deviceId,
        platform,
        version: release.version,
        build: release.build,
        event: "failed",
        reason: v.reason,
      });
      onProgress({
        phase: "failed",
        ratio: 1,
        release,
        error: v.detail ?? v.reason,
      });
      return false;
    }

    // 3. 安装
    onProgress({ phase: "installing", ratio: 1, release, message: "正在安装" });
    const r = await installArtifact(artifact, platform);
    if (!r.ok) {
      await otaApi.report({
        device_id: deviceId,
        platform,
        version: release.version,
        build: release.build,
        event: "failed",
        reason: "install_failed",
      });
      onProgress({ phase: "failed", ratio: 1, release, error: r.message });
      return false;
    }

    await otaApi.report({
      device_id: deviceId,
      platform,
      version: release.version,
      build: release.build,
      event: "installed",
      elapsed_ms: Math.round(performance.now() - sw),
    });
    onProgress({
      phase: "waitingRestart",
      ratio: 1,
      release,
      message: "安装完成，即将重启应用",
    });
    return true;
  } catch (e) {
    onProgress({
      phase: "failed",
      ratio: 1,
      release,
      error: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}

/**
 * 路径 A：官方 Tauri Updater Plugin（已签名产物时使用）。
 * 需 tauri.conf.json 配置 pubkey + endpoints，且产物已签名。
 * 未签名时若强行开启 `dangerousInsecureTransportProtocol` 仅限测试环境。
 */
export async function runOfficialUpdater(
  onProgress: (s: UpdateState) => void,
): Promise<boolean> {
  const { check } = await import("@tauri-apps/plugin-updater");
  onProgress({ phase: "checking", ratio: 0, message: "正在检查更新" });
  const update = await check();
  if (!update) {
    onProgress({ phase: "done", ratio: 1, message: "已是最新" });
    return false;
  }
  let downloaded = 0;
  let contentLength = 0;
  // 注意：downloadAndInstall 是 Update 实例的方法，而非模块级导出。
  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case "Started":
        contentLength = event.data.contentLength ?? 0;
        onProgress({ phase: "downloading", ratio: 0, message: "正在下载更新包" });
        break;
      case "Progress":
        downloaded += event.data.chunkLength;
        onProgress({
          phase: "downloading",
          ratio: contentLength ? downloaded / contentLength : 0,
          message: "正在下载更新包",
        });
        break;
      case "Finished":
        onProgress({ phase: "installing", ratio: 1, message: "正在安装" });
        break;
    }
  });
  onProgress({ phase: "waitingRestart", ratio: 1, message: "安装完成，即将重启" });
  return true;
}

/** 重启应用（安装完成后调用）。 */
export async function restartApp(): Promise<void> {
  await relaunch();
}
