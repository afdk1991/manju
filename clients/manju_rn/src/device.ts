/**
 * 设备与环境信息：为 OTA 检查提供 platform / arch / device_id / 版本号。
 *
 * 注意：本 RN 工程只在 Android 与 iOS 上运行；鸿蒙端是 `harmony/` 目录下的
 * 另一套 ArkTS 代码，不在此处。因此这里只会返回 'android' 或 'ios'。
 */
import {Platform} from 'react-native';
import DeviceInfo from 'react-native-device-info';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {OtaArch, OtaPlatform} from './updater/types';

export function currentOtaPlatform(): OtaPlatform {
  return Platform.OS === 'ios' ? 'ios' : 'android';
}

/** 把底层 ABI 字符串映射到 OTA 协议的 arch 枚举。 */
function mapAbiToOtaArch(abi: string): OtaArch | null {
  switch (abi) {
    case 'arm64-v8a':
    case 'arm64':
      return 'arm64';
    case 'armeabi-v7a':
    case 'armv7':
      return 'armv7';
    case 'x86':
      return 'x86';
    case 'x86_64':
      return 'x86_64';
    default:
      return null;
  }
}

/**
 * 取 CPU 架构（x86_64 / arm64 ...）。
 * 优先用 DeviceInfo.getSupportedAbis()（返回该设备支持的 ABI 列表），
 * 映射到协议枚举；类型里若连 getSupportedAbis 都没有，则退化为读取
 * Platform.constants（RN 自带、类型安全的 DeviceInfo 作为兜底）。
 */
export async function currentOtaArch(): Promise<OtaArch> {
  try {
    const abis: string[] = await DeviceInfo.supportedAbis();
    for (const abi of abis) {
      const mapped = mapAbiToOtaArch(abi);
      if (mapped) return mapped;
    }
    // 次选：Platform.constants 上的原生信息（android 有 'CPU_ABI'）
    const constants = Platform.constants as {CPU_ABI?: string; cpuArchitecture?: string};
    const raw = constants.CPU_ABI ?? constants.cpuArchitecture;
    if (raw) {
      const mapped = mapAbiToOtaArch(raw);
      if (mapped) return mapped;
    }
  } catch {
    /* 忽略，走兜底 */
  }
  return Platform.OS === 'ios' ? 'arm64' : 'arm64';
}

/** 匿名设备指纹：本地随机生成并持久化，≤64 字符，不含 PII。 */
export async function getOrCreateDeviceId(): Promise<string> {
  const KEY = 'manju_device_id';
  try {
    const cached = await AsyncStorage.getItem(KEY);
    if (cached && cached.length > 0) return cached;
    const id =
      'd_' +
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 10);
    const finalId = id.slice(0, 64);
    await AsyncStorage.setItem(KEY, finalId);
    return finalId;
  } catch {
    return 'anonymous';
  }
}

export async function getAppVersion(): Promise<string> {
  return DeviceInfo.getVersion();
}

export async function getAppBuild(): Promise<number> {
  const b = await DeviceInfo.getBuildNumber();
  return parseInt(b, 10) || 0;
}

/** 当前系统语言，用于请求 locale 文案。 */
export function currentLocaleName(): string {
  return 'zh-CN';
}
