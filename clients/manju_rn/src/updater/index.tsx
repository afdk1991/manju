/**
 * OTA 更新门面：把「检查 → 下载 → 校验 → 安装」串成完整链路。
 *
 * 平台分发规则（核心，不可违背，对应 spec/ota-protocol.v1.md §4）：
 *   - Android：下载 → SHA256 + Ed25519 校验 → 通过 PackageInstaller 会话安装
 *              （需用户先授予"允许来自此来源的应用"，属"有条件"自动更新）。
 *   - iOS：❌ 禁止静默安装。只能检测更新 → 展示说明 → 跳转 App Store。
 *   - HarmonyOS：本 RN 工程不运行于鸿蒙，但红线逻辑同样拦截：只能跳转华为应用市场。
 *              鸿蒙端真实实现在 `harmony/` 目录（ArkTS），独立代码库靠同一份 API 契约保持一致。
 *
 * 即便服务端错误地下发了产物，本门面也会在开头再次拦截 iOS / HarmonyOS，绝不执行安装。
 */
import React, {createContext, useContext, useRef, ReactNode} from 'react';
import {Linking, Alert} from 'react-native';
import RNFS from 'react-native-fs';

import {
  OtaChannel,
  OtaCheckResponse,
  OtaPlatform,
  OtaReportEvent,
  canSelfInstall,
  pickNotes,
} from './types';
import {
  apiClient,
  isNewer,
} from '../api/client';
import {
  currentOtaPlatform,
  currentOtaArch,
  getOrCreateDeviceId,
  getAppVersion,
  getAppBuild,
  currentLocaleName,
} from '../device';
import {downloadArtifact} from './download';
import {verifyArtifact} from './verify';
import {
  androidCanInstallPackages,
  androidOpenInstallSettings,
  androidInstallApk,
} from './native';

/** 更新流程状态。 */
export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'verifying'
  | 'installing'
  | 'waitingRestart'
  | 'waitingStore'
  | 'done'
  | 'failed'
  | 'storeOnly';

/** 更新进度快照，供 UI 渲染。 */
export interface UpdateProgress {
  phase: UpdatePhase;
  ratio: number; // 0~1，仅 downloading 阶段有效
  message?: string;
  release?: OtaCheckResponse['release'];
  error?: string;
}

export interface CheckResult {
  hasUpdate: boolean;
  response?: OtaCheckResponse;
  errorCode?: string;
  errorMessage?: string;
}

/** 商店跳转文案（体现平台红线）。 */
function storeOnlyMessage(platform: OtaPlatform): string {
  switch (platform) {
    case 'ios':
      return 'iOS 不支持应用内自动安装，即将前往 App Store 完成升级';
    case 'harmonyos':
      return '鸿蒙不支持应用内自动安装，即将前往华为应用市场完成升级';
    default:
      return '当前平台需通过应用商店升级';
  }
}

export class Updater {
  channel: OtaChannel = 'stable';
  baseUrl?: string;

  private lastEtag?: string;

  constructor(opts?: {channel?: OtaChannel; baseUrl?: string}) {
    if (opts?.channel) this.channel = opts.channel;
    if (opts?.baseUrl) {
      this.baseUrl = opts.baseUrl;
      if (apiClient.baseUrl) apiClient.baseUrl = opts.baseUrl;
    }
  }

  async check(): Promise<CheckResult> {
    const platform = currentOtaPlatform();
    const arch = await currentOtaArch();
    const deviceId = await getOrCreateDeviceId();
    const version = await getAppVersion();
    const build = await getAppBuild();
    const locale = currentLocaleName();

    try {
      const {status, etag, data} = await apiClient.otaCheck({
        platform,
        arch,
        channel: this.channel,
        version,
        build,
        device_id: deviceId,
        locale,
        etag: this.lastEtag,
      });
      if (etag) this.lastEtag = etag;

      if (status === 204 || status === 304) {
        return {hasUpdate: false};
      }
      if (!data || !data.has_update || !data.release) {
        return {hasUpdate: false};
      }

      // 客户端侧兜底：拒绝服务端下发的降级版本（协议 §7.6）
      if (
        !isNewer(
          data.release.version,
          data.release.build,
          version,
          build,
        )
      ) {
        return {
          hasUpdate: false,
          errorMessage: '服务端返回了比当前更旧的版本，已拒绝（疑似降级）',
        };
      }

      return {hasUpdate: true, response: data};
    } catch (e) {
      return {hasUpdate: false, errorMessage: String(e)};
    }
  }

  /**
   * 下载并安装（或跳转商店）。通过 onProgress 推送进度。
   * @returns true 表示"安装器已拉起"或"已跳转商店"；false 需查看 progress.error。
   */
  async downloadAndInstall(
    response: OtaCheckResponse,
    onProgress: (p: UpdateProgress) => void,
  ): Promise<boolean> {
    const release = response.release;
    const platform = currentOtaPlatform();

    // ---- 红线拦截：iOS / HarmonyOS 绝不允许走下载安装 ----
    if (!canSelfInstall(platform)) {
      const url = response.store_fallback?.url ?? '';
      onProgress({
        phase: 'storeOnly',
        ratio: 0,
        message: storeOnlyMessage(platform),
        release,
      });
      await this.report('unsupported', release, 'platform_restricted');

      if (url) {
        const ok = await this.openStore(url);
        onProgress({
          phase: ok ? 'waitingStore' : 'failed',
          ratio: 0,
          message: ok
            ? '已为你打开商店，请在商店中完成升级'
            : '无法打开商店地址，请手动前往应用商店更新',
          release,
        });
        return ok;
      }
      onProgress({
        phase: 'failed',
        ratio: 0,
        error: '服务端未下发商店地址，无法引导升级',
        release,
      });
      return false;
    }

    if (!release) {
      onProgress({phase: 'failed', ratio: 0, error: '未包含版本信息'});
      return false;
    }

    const artifact = release.artifact;
    const startedAt = Date.now();

    // ---- 1. 下载 ----
    onProgress({phase: 'downloading', ratio: 0, message: '正在下载更新包', release});
    const dl = await downloadArtifact(artifact, (ratio) =>
      onProgress({phase: 'downloading', ratio, release}),
    );
    if (!dl.ok || !dl.path) {
      onProgress({phase: 'failed', ratio: 0, error: dl.error ?? '下载失败', release});
      await this.report('failed', release, 'download_failed');
      return false;
    }
    await this.report('downloaded', release, undefined, Date.now() - startedAt);

    // ---- 2. 校验（生命线）----
    onProgress({phase: 'verifying', ratio: 1, message: '正在校验安装包', release});
    const verify = await verifyArtifact(dl.path, artifact, release.version, release.build);
    if (!verify.ok) {
      // 校验失败必须删除文件，绝不能留下未验证的可执行文件
      try {
        await RNFS.unlink(dl.path);
      } catch {
        /* noop */
      }
      onProgress({
        phase: 'failed',
        ratio: 0,
        release,
        error: verify.detail ?? verify.reason ?? '校验失败',
      });
      await this.report('failed', release, verify.reason ?? 'verify_failed');
      return false;
    }

    // ---- 3. 安装 ----
    onProgress({phase: 'installing', ratio: 1, message: '正在安装', release});
    const installed = await this.install(platform, dl.path);
    if (installed) {
      await this.report('installed', release, undefined, Date.now() - startedAt);
      onProgress({
        phase: 'waitingRestart',
        ratio: 1,
        message: '安装完成，即将重启应用',
        release,
      });
      return true;
    }

    onProgress({phase: 'failed', ratio: 0, release, error: '拉起安装器失败，请手动前往设置授权'});
    await this.report('failed', release, 'install_failed');
    return false;
  }

  /** 按平台分发安装（仅 Android 走到这里）。 */
  private async install(platform: OtaPlatform, path: string): Promise<boolean> {
    if (platform !== 'android') return false; // 理论到不了（已前置拦截）

    const can = await androidCanInstallPackages();
    if (!can) {
      // 引导用户去设置页授权；授权是异步操作，需用户在页面 resumed 后再次触发
      await androidOpenInstallSettings();
      return false;
    }
    return androidInstallApk(path);
  }

  /** 跳转商店。storeUrl 来自服务端 store_fallback.url。 */
  async openStore(storeUrl: string): Promise<boolean> {
    try {
      const supported = await Linking.canOpenURL(storeUrl);
      if (!supported) {
        // 兜底：iOS 上直接用 App Store 链接，鸿蒙用华为应用市场链接
        return false;
      }
      await Linking.openURL(storeUrl);
      return true;
    } catch {
      return false;
    }
  }

  /** 跳过本次更新并上报。 */
  async skip(response: OtaCheckResponse): Promise<void> {
    await this.report('skipped', response.release);
  }

  private async report(
    event: OtaReportEvent,
    release?: OtaCheckResponse['release'],
    reason?: string,
    elapsedMs?: number,
  ): Promise<void> {
    try {
      const platform = currentOtaPlatform();
      const version = release?.version ?? (await getAppVersion());
      const build = release?.build ?? (await getAppBuild());
      const deviceId = await getOrCreateDeviceId();
      await apiClient.otaReport({
        device_id: deviceId,
        platform,
        version,
        build,
        event,
        reason,
        elapsed_ms: elapsedMs,
      });
    } catch {
      /* 上报失败不影响主流程 */
    }
  }
}

// ---------- React Context ----------

const UpdaterContext = createContext<Updater | null>(null);

export function UpdaterProvider({
  children,
  channel = 'stable',
  baseUrl,
}: {
  children: ReactNode;
  channel?: OtaChannel;
  baseUrl?: string;
}) {
  const ref = useRef<Updater | null>(null);
  if (!ref.current) {
    ref.current = new Updater({channel, baseUrl});
  }
  return (
    <UpdaterContext.Provider value={ref.current}>
      {children}
    </UpdaterContext.Provider>
  );
}

export function useUpdater(): Updater {
  const ctx = useContext(UpdaterContext);
  if (!ctx) {
    throw new Error('useUpdater 必须在 UpdaterProvider 内使用');
  }
  return ctx;
}

/** 供 UI 直接使用的便捷提示：展示更新说明弹窗。 */
export function showUpdateAlert(
  response: OtaCheckResponse,
  onConfirm: () => void,
  onSkip?: () => void,
) {
  const release = response.release;
  if (!release) return;
  const notes = pickNotes(release.notes_i18n, currentLocaleName());
  const forced = response.policy === 'forced';
  Alert.alert(
    `发现新版本 ${release.version}`,
    notes || '有新版本可用',
    [
      onSkip && !forced
        ? {text: '稍后', style: 'cancel', onPress: onSkip}
        : {text: '暂不更新', style: 'cancel', onPress: onSkip},
      {text: '立即更新', onPress: onConfirm},
    ],
    {cancelable: !forced},
  );
}
