/**
 * 鸿蒙（HarmonyOS）端更新插件。
 *
 * ## 重要：鸿蒙不支持应用内静默安装
 *
 * HarmonyOS 没有向第三方应用开放"下载 APK/HAP 后自行安装"的公开 API。
 * 唯一合规的分发路径是：
 *   1. 华为应用市场（普通用户）
 *   2. 企业 MDM 设备管理器下发（企业场景）
 *
 * 因此本端的"自动更新"正确实现是：
 *   检测更新 → 展示说明 → 用户确认 → 拉起应用市场 → 上报转化
 *
 * 严禁在此文件中实现任何绕过应用市场的安装逻辑。
 */

import { BusinessError } from '@kit.BasicServicesKit';
import { common, Want } from '@kit.AbilityKit';
import { bundleManager } from '@kit.AbilityKit';
import { promptAction } from '@kit.ArkUI';
import Logger from '../common/Logger';

const TAG: string = 'UpdaterPlugin';

/**
 * 更新检查结果。
 */
export interface OtaCheckResult {
  hasUpdate: boolean;
  policy: string; // suggest | forced | silent
  version: string;
  build: number;
  notes: string;
  storeUrl: string; // 鸿蒙端唯一可用的升级入口
}

/**
 * 鸿蒙端更新器。
 */
export class UpdaterPlugin {
  private context: common.UIAbilityContext;

  constructor(context: common.UIAbilityContext) {
    this.context = context;
  }

  /**
   * 读取当前应用的版本号与构建号。
   */
  async getCurrentVersion(): Promise<{ version: string; build: number }> {
    try {
      const flags = bundleManager.BundleFlag.GET_BUNDLE_INFO_WITH_APPLICATION;
      const info = await bundleManager.getBundleInfoForSelf(flags);
      return {
        version: info.versionName ?? '1.0.0',
        build: info.versionCode ?? 1,
      };
    } catch (err) {
      Logger.error(TAG, `读取版本信息失败: ${JSON.stringify(err)}`);
      return { version: '1.0.0', build: 1 };
    }
  }

  /**
   * 检查更新。
   *
   * 服务端对 harmonyos 平台强制返回 store_fallback，
   * 客户端直接消费 storeUrl 即可。
   */
  async checkUpdate(apiBase: string): Promise<OtaCheckResult | null> {
    const cur = await this.getCurrentVersion();
    // 鸿蒙设备架构统一按 arm64 上报
    const url =
      `${apiBase}/api/v1/ota/check?platform=harmonyos&arch=arm64` +
      `&channel=stable&version=${cur.version}&build=${cur.build}` +
      `&device_id=${this.getDeviceId()}`;

    try {
      const resp = await fetch(url, { method: 'GET' });
      if (resp.responseCode === 204 || resp.responseCode === 304) {
        return null; // 无更新
      }
      const raw = JSON.parse(resp.result.toString()) as Record<string, Object>;
      const hasUpdate = raw['has_update'] as boolean;
      if (!hasUpdate) {
        return null;
      }
      const release = raw['release'] as Record<string, Object>;
      const fallback = raw['store_fallback'] as Record<string, Object>;
      const notesMap = release['notes_i18n'] as Record<string, string>;

      return {
        hasUpdate: true,
        policy: (raw['policy'] as string) ?? 'suggest',
        version: (release['version'] as string) ?? '',
        build: (release['build'] as number) ?? 0,
        notes: notesMap?.['zh-CN'] ?? '本次更新包含问题修复与体验优化',
        storeUrl: (fallback?.['url'] as string) ?? '',
      };
    } catch (err) {
      Logger.error(TAG, `检查更新失败: ${JSON.stringify(err)}`);
      return null;
    }
  }

  /**
   * 上报更新事件（用于统计跳转商店后的真实转化率）。
   */
  async reportEvent(
    apiBase: string,
    event: string,
    reason: string = '',
  ): Promise<void> {
    try {
      const cur = await this.getCurrentVersion();
      await fetch(`${apiBase}/api/v1/ota/report`, {
        method: 'POST',
        header: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: this.getDeviceId(),
          platform: 'harmonyos',
          version: cur.version,
          build: cur.build,
          event: event,
          reason: reason,
        }),
      });
    } catch (err) {
      Logger.error(TAG, `上报失败: ${JSON.stringify(err)}`);
    }
  }

  /**
   * 拉起华为应用市场的应用详情页。
   *
   * 这是鸿蒙端**唯一**可用的升级入口。
   */
  async openAppGallery(storeUrl: string): Promise<boolean> {
    try {
      let want: Want;
      if (storeUrl.startsWith('store://')) {
        // store://appgallery/detail?id=xxx 可直接拉起应用市场 App
        want = { uri: storeUrl };
      } else {
        // https://appgallery.huawei.com/app/detail?id=xxx 用浏览器/市场打开
        want = {
          action: 'ohos.want.action.viewData',
          entities: ['entity.system.browsable'],
          uri: storeUrl,
        };
      }
      await this.context.startAbility(want);
      await this.reportEvent('http://localhost:8000', 'unsupported', 'platform_restricted');
      return true;
    } catch (err) {
      const e = err as BusinessError;
      Logger.error(TAG, `拉起应用市场失败: ${e.code} ${e.message}`);
      promptAction.showToast({ message: '无法打开应用市场，请手动更新' });
      return false;
    }
  }

  /**
   * 获取（或生成）匿名设备标识，仅用于灰度分桶。
   */
  private getDeviceId(): string {
    // 生产环境建议使用 @ohos.deviceInfo 结合持久化存储，
    // 这里用简化实现避免引入额外权限申请。
    return 'harmonyos-device';
  }
}
