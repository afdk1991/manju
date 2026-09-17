// 更新流程的 React 状态管理 Hook。
import { useCallback, useState } from "react";
import {
  applyCustomUpdate,
  checkForUpdate,
  restartApp,
  type UpdateState,
} from "./engine";
import type { OtaRelease } from "../api/types";

const initial: UpdateState = { phase: "idle", ratio: 0 };

export function useUpdater() {
  const [state, setState] = useState<UpdateState>(initial);
  const [release, setRelease] = useState<OtaRelease | null>(null);

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
      setState({ phase: "available", ratio: 0, release: res.release });
      return true;
    } catch (e) {
      setState({
        phase: "failed",
        ratio: 0,
        error: e instanceof Error ? e.message : String(e),
      });
      return false;
    }
  }, []);

  /** 执行下载+校验+安装（路径 B）。 */
  const install = useCallback(async () => {
    if (!release) return;
    const ok = await applyCustomUpdate(release, setState);
    if (ok) {
      // 桌面端安装完成后重启拉起新版本。
      setTimeout(() => restartApp(), 1200);
    }
  }, [release]);

  const reset = useCallback(() => {
    setRelease(null);
    setState(initial);
  }, []);

  return { state, release, check, install, reset };
}
