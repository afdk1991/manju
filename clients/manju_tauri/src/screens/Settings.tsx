// 设置页：展示当前版本号，并提供「手动检查更新」入口。
// 更新状态与全局 UpdaterModal 共享（经 UpdaterProvider）。
import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { useUpdater } from "../updater/useUpdater";
import { APP_BUILD } from "../updater/engine";

export function Settings() {
  const { state, policy, check } = useUpdater();
  const [version, setVersion] = useState<string>("--");

  useEffect(() => {
    // 版本号来自应用清单（tauri.conf.json 的 version）；
    // 构建号使用与 OTA 上报一致的常量 APP_BUILD（@tauri-apps/api/app 无 getBuildNumber）。
    getVersion().then(setVersion).catch(() => setVersion("1.0.0"));
  }, []);

  // 把更新阶段映射为中文提示。
  const phaseText: Record<string, string> = {
    checking: "正在检查更新…",
    downloading: "正在下载更新包",
    verifying: "正在校验安装包",
    installing: "正在安装",
    waitingRestart: "安装完成，即将重启",
    failed: `检查失败：${state.error ?? ""}`,
  };

  return (
    <div className="settings">
      <h3 className="section-title">设置</h3>

      <div className="setting-row">
        <span className="setting-label">当前版本</span>
        <span className="setting-value">
          {version}（构建号 {APP_BUILD}）
        </span>
      </div>

      <div className="setting-row">
        <span className="setting-label">更新策略</span>
        <span className="setting-value">
          {policy ? `本次策略：${policy}` : "未检查 / 已是最新"}
        </span>
      </div>

      <div className="setting-row">
        <button className="btn-primary" onClick={() => check()}>
          检查更新
        </button>
        {state.phase !== "idle" && state.phase !== "checking" && (
          <span className="setting-status">{phaseText[state.phase] ?? ""}</span>
        )}
      </div>

      <p className="setting-tip">
        桌面端（Windows / macOS / Linux）支持检测到新版本后自动下载并安装；
        iOS / 鸿蒙端受平台限制只能跳转应用商店。更新包会经过 SHA256 与
        Ed25519 签名双重校验，校验不通过将立即中止。
      </p>
    </div>
  );
}
