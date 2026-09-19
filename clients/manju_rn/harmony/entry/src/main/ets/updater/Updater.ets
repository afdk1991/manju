/**
 * 鸿蒙端 OTA 更新器（ArkTS）。
 *
 * ⚠️ 平台红线（对应 spec/ota-protocol.v1.md §4）：
 *    鸿蒙**没有向第三方应用开放静默安装 API**。唯一合规的分发路径是
 *    华为应用市场（AppGallery），或企业场景下的 MDM 设备管理器下发。
 *    因此鸿蒙端**严禁**实现"下载 hap 并安装"，正确行为只有一种：
 *    检测更新 → 展示说明 → 用户确认 → 跳转华为应用市场。
 *
 * 与服务端约定的字段名（platform / version / build / sha256 / store_fallback 等）
 * 与四端共用同一份契约，不得改名。
 */
import { bundleManager } from '@kit.AbilityKit';
import { http } from '@kit.NetworkKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { common } from '@kit.AbilityKit';

/** 与协议一致的更新策略枚举子集。 */
export type UpdatePolicy = 'suggest' | 'forced' | 'silent';

/** 商店兜底信息。 */
export interface StoreFallback {
  enabled: boolean;
  url: string;
  reason: string;
}

/** OTA 检查响应（仅保留鸿蒙端关心的字段）。 */
export interface OtaCheckResponse {
  has_update: boolean;
  policy: UpdatePolicy;
  release?: {
    version: string;
    build: number;
    notes_i18n: Record<string, string>;
    artifact: { type: string; url: string; sha256: string; signature?: string };
  };
  store_fallback?: StoreFallback;
}

/** 华为应用市场详情页地址（请将 Cxxxx 替换为真实应用 ID）。 */
const HUAWEI_APPGALLERY_URL = 'store://appgallery/detail?id=C100000000';

/**
 * 读取当前应用版本（versionName / versionCode）。
 * 依赖 @ohos.bundle（此处用 @kit.AbilityKit 的 bundleManager）。
 */
export function readAppVersion(): { version: string; build: number } {
  try {
    const info = bundleManager.getBundleInfoForSelfSync(
      bundleManager.BundleFlag.GET_BUNDLE_INFO_DEFAULT
    );
    return {
      version: info.versionName ?? '0.0.0',
      build: info.versionCode ?? 0,
    };
  } catch (e) {
    console.error('读取应用版本失败', e);
    return { version: '0.0.0', build: 0 };
  }
}

/**
 * 跳转华为应用市场。
 * 鸿蒙无公开静默安装 API，升级只能引导用户到应用市场手动完成。
 */
export function openAppGallery(context: common.UIAbilityContext, url?: string): void {
  const target = url && url.length > 0 ? url : HUAWEI_APPGALLERY_URL;
  const want = {
    action: 'ohos.want.action.appdetail',
    uri: target,
  };
  try {
    context.startAbility(want);
  } catch (e) {
    const err = e as BusinessError;
    console.error('跳转应用市场失败', err.code, err.message);
  }
}

/**
 * 检查更新。返回服务端响应；若需升级，调用方应引导用户跳转商店。
 * @param baseUrl 内容/OTA 服务地址
 * @param deviceId 匿名设备指纹
 */
export async function checkForUpdate(
  baseUrl: string,
  deviceId: string
): Promise<OtaCheckResponse | null> {
  const { version, build } = readAppVersion();
  const qs =
    `platform=harmonyos&arch=arm64&channel=stable` +
    `&version=${encodeURIComponent(version)}&build=${build}` +
    `&device_id=${encodeURIComponent(deviceId)}&locale=zh-CN`;

  return new Promise((resolve) => {
    const req = http.createHttp();
    req.request(
      `${baseUrl}/api/v1/ota/check?${qs}`,
      { method: http.RequestMethod.GET },
      (err: BusinessError, response) => {
        req.destroy();
        if (err) {
          console.error('OTA 检查失败', err.code, err.message);
          resolve(null);
          return;
        }
        if (response.responseCode === 204 || response.responseCode === 304) {
          resolve(null); // 无更新
          return;
        }
        if (response.responseCode !== 200) {
          resolve(null);
          return;
        }
        try {
          resolve(JSON.parse(response.result as string) as OtaCheckResponse);
        } catch (e) {
          console.error('解析 OTA 响应失败', e);
          resolve(null);
        }
      }
    );
  });
}
