/**
 * 与原生侧（Android `UpdaterModule.kt`）约定的桥接层。
 *
 * 通道名：`com.manju.updater`（与 Kotlin 端 ReactPackage 注册一致）。
 *
 * 重要：iOS / HarmonyOS 没有也不允许静默安装，因此本桥接只承载 Android 的
 * `PackageInstaller` 会话安装能力。iOS 的商店跳转在 JS 侧用 `Linking.openURL`
 * 完成（见 index.ts），不依赖任何原生模块。
 */
import {NativeModules, Platform} from 'react-native';

interface UpdaterNativeModule {
  canInstallPackages: () => Promise<boolean>;
  openInstallPermissionSettings: () => Promise<boolean>;
  installApk: (params: {path: string}) => Promise<boolean>;
}

const RNUpdater = (NativeModules as any).Updater as UpdaterNativeModule | undefined;

/** 仅在 Android 且模块已注册时返回 true。 */
export function isAndroidUpdaterAvailable(): boolean {
  return Platform.OS === 'android' && !!RNUpdater;
}

/** 询问系统：本应用当前是否被允许安装未知来源 APK。 */
export async function androidCanInstallPackages(): Promise<boolean> {
  if (!RNUpdater) return false;
  try {
    return (await RNUpdater.canInstallPackages()) === true;
  } catch {
    return false;
  }
}

/** 打开系统设置页，让用户授予"允许安装未知来源应用"权限。 */
export async function androidOpenInstallSettings(): Promise<boolean> {
  if (!RNUpdater) return false;
  try {
    return (await RNUpdater.openInstallPermissionSettings()) === true;
  } catch {
    return false;
  }
}

/**
 * 调起系统安装界面。走到这里说明 APK 已通过 SHA256 + Ed25519 校验。
 * Android 8.0+ 必须通过 PackageInstaller 会话安装。
 */
export async function androidInstallApk(path: string): Promise<boolean> {
  if (!RNUpdater) return false;
  try {
    return (await RNUpdater.installApk({path})) === true;
  } catch {
    return false;
  }
}
