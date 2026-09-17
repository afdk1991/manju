// 设备信息：平台 / 架构 / 匿名设备指纹。用于 OTA 检查请求。
import { platform as osPlatform, arch as osArch } from "@tauri-apps/plugin-os";
import { Store } from "@tauri-apps/plugin-store";
import type { Arch, Platform } from "../api/types";

/** 把 Tauri os plugin 的返回值映射为 OTA 协议枚举。 */
export function normalizePlatform(p: string): Platform {
  switch (p) {
    case "windows":
      return "windows";
    case "macos":
      return "macos";
    case "linux":
      return "linux";
    default:
      return "windows"; // 桌面端兜底
  }
}

export function normalizeArch(a: string): Arch {
  switch (a) {
    case "x86_64":
    case "x64":
      return "x86_64";
    case "aarch64":
    case "arm64":
      return "arm64";
    case "arm":
    case "armv7":
      return "armv7";
    case "x86":
      return "x86";
    default:
      return "x86_64";
  }
}

let cachedDeviceId: string | null = null;

/** 获取或创建匿名设备指纹（≤64 字符，不含 PII）。持久化在 store 中。 */
export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  const store = await Store.load("store.bin", { autoSave: true });
  const existing = (await store.get<string>("device_id")) ?? null;
  if (existing) {
    cachedDeviceId = existing;
    return existing;
  }
  // 用随机 UUID，不依赖任何硬件标识。
  const uuid =
    (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)) +
    Date.now().toString(36);
  const id = uuid.replace(/-/g, "").slice(0, 64);
  await store.set("device_id", id);
  await store.save();
  cachedDeviceId = id;
  return id;
}

export interface DeviceInfo {
  platform: Platform;
  arch: Arch;
  deviceId: string;
}

export async function getDeviceInfo(): Promise<DeviceInfo> {
  const p = normalizePlatform(await osPlatform());
  const a = normalizeArch(await osArch());
  const deviceId = await getDeviceId();
  return { platform: p, arch: a, deviceId };
}
