// 更新流程的 React 状态管理 Hook（全局单例，供弹窗与设置页共享同一状态）。
// 按 OTA 协议 policy 决定行为：
//   - silent ：后台静默下载安装（桌面端能力），不阻塞用户。
//   - forced ：强制更新，弹窗禁用"稍后"，检测到即拉起安装。
//   - suggest：提示用户，由用户选择"立即更新"或"稍后"。
import React, { createContext, useCallback, useContext, useState } from "react";
import {
  applyCustomUpdate,
  checkForUpdate,
  restartApp,
  type UpdateState,
} from "./engine";
import type { OtaPolicy, OtaRelease } from "../api/types";

const initial: UpdateState = { phase: "idle", ratio: 0 };

/** 内部核心 Hook：真正的状态与逻辑都在这，供 Provider 调用一次。 */
function useUpdaterCore() {
  const [state, setState] = useState<UpdateState>(initial);
  const [release, setRelease] = useState<OtaRelease | null>(null);
  const [policy, setPolicy] = useState<OtaPolicy | null>(null);

  /** 执行下载+校验+安装（路径 B）。 */
  const install = useCallback(async () => {
    if (!release) return;
    const ok = await applyCustomUpdate(release, setState);
    if (ok) {
      // 桌面端安装完成后重启拉起新版本。
      setTimeout(() => restartApp(), 1200);
    }
  }, [release]);

  /** 启动时或手动触发检查。 */
  const check = useCallback(async () => {
    setState({ phase: "checking", ratio: 0, message: "正在检查更新" });
    try {
      const res = await checkForUpdate();
      if (!res || !res.has_update) {
        setState({ phase: "idle", ratio: 0, message: "已是最新版本" });
        return false;
      }
      setRelease(res.release);
      setPolicy(res.policy);
      setState({ phase: "available", ratio: 0, release: res.release });

      // 静默策略：桌面端直接后台安装，不打断用户。
      // 强制策略：低于 min_supported_version 时被服务端置为 forced，必须升级，
      //           同样直接拉起安装，且弹窗不提供"稍后"按钮。
      if (res.policy === "silent" || res.policy === "forced") {
        void install();
      }
      return true;
    } catch (e) {
      setState({
        phase: "failed",
        ratio: 0,
        error: e instanceof Error ? e.message : String(e),
      });
      return false;
    }
  }, [install]);

  const reset = useCallback(() => {
    setRelease(null);
    setPolicy(null);
    setState(initial);
  }, []);

  return { state, release, policy, check, install, reset };
}

type UpdaterApi = ReturnType<typeof useUpdaterCore>;

const UpdaterContext = createContext<UpdaterApi | null>(null);

/** 在应用根部包裹一次，使更新弹窗与设置页共享同一份更新状态。 */
export function UpdaterProvider({ children }: { children: React.ReactNode }) {
  const value = useUpdaterCore();
  return <UpdaterContext.Provider value={value}>{children}</UpdaterContext.Provider>;
}

/** 读取全局更新状态（必须在 UpdaterProvider 内使用）。 */
export function useUpdater(): UpdaterApi {
  const ctx = useContext(UpdaterContext);
  if (!ctx) throw new Error("useUpdater 必须在 <UpdaterProvider> 内使用");
  return ctx;
}
