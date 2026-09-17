// ============================================================================
// 桌面端安装逻辑 —— 体现平台差异（Windows / macOS / Linux）
//
// 前置条件：传入的文件已通过 SHA256 + Ed25519 校验。本模块只负责“拉起系统安装器”。
//
// 平台差异（与 spec/ota-protocol.v1.md §4 矩阵一致）：
//  • Windows：MSIX → PowerShell `Add-AppxPackage`；EXE → `/VERYSILENT`（被动用 `/quiet`）。
//              install_args 由服务端下发的白名单参数拼接。
//  • macOS  ：必须开发者签名，否则 Gatekeeper 拦截。
//              dmg → 挂载 → 拷贝 .app 到 /Applications；pkg → `installer -pkg`。
//  • Linux  ：AppImage 自替换 + chmod +x；deb → pkexec dpkg -i；tar.gz → 解压自替换。
//              tar.gz/AppImage 需要写权限，deb 需要 polkit 提权。
// ============================================================================

import { Command } from "@tauri-apps/plugin-shell";
import { appCacheDir, tempDir } from "@tauri-apps/plugin-os";
import type { Artifact } from "../api/types";

/** 临时下载目录下的文件名（与 download.ts 对应）。 */
function downloadedPath(artifact: Artifact): string {
  return `${tempDir()}/ota/manju-update-${artifact.type}`;
}

export interface InstallResult {
  ok: boolean;
  message?: string;
}

/**
 * 按产物类型与当前平台执行安装。调用方需保证已校验。
 * 安装完成后通常需重启应用：通过 plugin-process 的 relaunch 处理（见 engine.ts）。
 */
export async function installArtifact(
  artifact: Artifact,
  platform: "windows" | "macos" | "linux",
): Promise<InstallResult> {
  const path = downloadedPath(artifact);
  const args = artifact.install_args ?? [];

  switch (platform) {
    case "windows":
      return installWindows(artifact, path, args);
    case "macos":
      return installMacos(artifact, path);
    case "linux":
      return installLinux(artifact, path);
    default:
      return { ok: false, message: "未知平台" };
  }
}

// ----------------------------- Windows -----------------------------
async function installWindows(
  artifact: Artifact,
  path: string,
  args: string[],
): Promise<InstallResult> {
  try {
    if (artifact.type === "msix") {
      // MSIX 走系统包管理器，静默安装。
      await run("powershell", [
        "-NoProfile",
        "-Command",
        `Add-AppxPackage -Path '${path}'`,
      ]);
      return { ok: true };
    }
    if (artifact.type === "exe") {
      // EXE 安装包：/VERYSILENT 完全静默，/quiet 被动（显示进度但无交互）。
      // 默认被动模式；服务端 install_args 追加（白名单校验过）。
      await run("powershell", [
        "-NoProfile",
        "-Command",
        `Start-Process -FilePath '${path}' -ArgumentList '/quiet',${args
          .map((a) => `'${a}'`)
          .join(",")} -Wait`,
      ]);
      return { ok: true };
    }
    return { ok: false, message: `Windows 不支持的产物类型：${artifact.type}` };
  } catch (e) {
    return { ok: false, message: `Windows 安装失败：${e}` };
  }
}

// ------------------------------ macOS ------------------------------
async function installMacos(
  artifact: Artifact,
  path: string,
): Promise<InstallResult> {
  try {
    if (artifact.type === "dmg") {
      // 挂载 dmg → 拷贝 .app 到 /Applications → 卸载。
      // 注意：未签名的产物会被 Gatekeeper 拦截，必须签名或用户手动放行。
      const mount = await run(
        "bash",
        ["-c", `hdiutil attach '${path}' | grep Volumes | awk '{print $NF}'`],
        { capture: true },
      );
      const vol = (mount.stdout ?? "").trim();
      if (!vol) return { ok: false, message: "挂载 dmg 失败" };
      await run("bash", [
        "-c",
        `cp -R '${vol}'/*.app /Applications/ && hdiutil detach '${vol}'`,
      ]);
      return { ok: true };
    }
    if (artifact.type === "pkg") {
      await run("bash", ["-c", `sudo installer -pkg '${path}' -target /`]);
      return { ok: true };
    }
    return { ok: false, message: `macOS 不支持的产物类型：${artifact.type}` };
  } catch (e) {
    return { ok: false, message: `macOS 安装失败：${e}` };
  }
}

// ------------------------------ Linux ------------------------------
async function installLinux(
  artifact: Artifact,
  path: string,
): Promise<InstallResult> {
  try {
    if (artifact.type === "appimage") {
      // AppImage：自替换到缓存目录并赋予可执行权限。
      const target = `${appCacheDir()}/manju.appimage`;
      await run("bash", ["-c", `cp '${path}' '${target}' && chmod +x '${target}'`]);
      return { ok: true };
    }
    if (artifact.type === "deb") {
      // deb 需要提权，走 pkexec。
      await run("bash", ["-c", `pkexec dpkg -i '${path}'`]);
      return { ok: true };
    }
    if (artifact.type === "tar_gz" || artifact.type === "zip") {
      const target = appCacheDir();
      const cmd =
        artifact.type === "tar_gz"
          ? `tar -xzf '${path}' -C '${target}'`
          : `unzip -o '${path}' -d '${target}'`;
      await run("bash", ["-c", cmd]);
      return { ok: true };
    }
    return { ok: false, message: `Linux 不支持的产物类型：${artifact.type}` };
  } catch (e) {
    return { ok: false, message: `Linux 安装失败：${e}` };
  }
}

async function run(
  program: string,
  args: string[],
  opts: { capture?: boolean } = {},
): Promise<{ stdout?: string; stderr?: string; code: number }> {
  const cmd = Command.create(program, args);
  const out: string[] = [];
  const err: string[] = [];
  cmd.stdout.on("data", (d: string) => out.push(d));
  cmd.stderr.on("data", (d: string) => err.push(d));
  const child = await cmd.spawn();
  const status = await child.wait();
  if (opts.capture) {
    return { stdout: out.join(""), stderr: err.join(""), code: status.code };
  }
  return { code: status.code };
}
