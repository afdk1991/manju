// 更新弹窗：展示更新说明 + 下载进度 + 安装重启。
// 桌面三端可静默安装，因此这里提供“立即更新”与“稍后”两种操作。
import { useUpdater } from "./useUpdater";

function fmtSize(n: number): string {
  if (n >= 1024 * 1024 * 1024) return (n / 1024 / 1024 / 1024).toFixed(2) + " GB";
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + " MB";
  return (n / 1024).toFixed(1) + " KB";
}

const phaseText: Record<string, string> = {
  checking: "正在检查更新…",
  downloading: "正在下载更新包",
  verifying: "正在校验安装包",
  installing: "正在安装",
  waitingRestart: "安装完成，即将重启",
  failed: "更新失败",
};

export function UpdaterModal() {
  const { state, release, policy, install, reset } = useUpdater();
  if (state.phase === "idle" || state.phase === "checking") return null;

  const notes =
    release?.notes_i18n?.["zh-CN"] ?? release?.notes_i18n?.["en"] ?? "（无更新说明）";
  const progress = Math.round(state.ratio * 100);
  const busy =
    state.phase === "downloading" ||
    state.phase === "verifying" ||
    state.phase === "installing";

  // forced / silent：不允许"稍后"（强制或静默后台安装，无交互按钮）。
  const allowSkip = policy === "suggest";
  const forceLabel =
    policy === "forced" ? "立即更新（强制）" : policy === "silent" ? "后台更新中…" : "立即更新";

  return (
    <div className="updater-mask" role="dialog" aria-modal="true">
      <div className="updater-card">
        <h2>发现新版本 {release?.version ?? ""}</h2>
        <p className="updater-meta">
          {release && fmtSize(release.artifact.size)} · 构建号 {release?.build}
        </p>
        <div className="updater-notes">
          {notes.split("\n").map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>

        {(state.phase === "downloading" ||
          state.phase === "verifying" ||
          state.phase === "installing") && (
          <div className="updater-progress">
            <div className="updater-bar" style={{ width: `${progress}%` }} />
            <span>
              {phaseText[state.phase] ?? ""} · {progress}%
            </span>
          </div>
        )}

        {state.phase === "waitingRestart" && (
          <p className="updater-ok">{phaseText.waitingRestart}</p>
        )}

        {state.phase === "failed" && (
          <p className="updater-err">失败原因：{state.error}</p>
        )}

        {!busy && state.phase !== "waitingRestart" && state.phase !== "failed" && (
          <div className="updater-actions">
            <button className="btn-primary" onClick={install}>
              {forceLabel}
            </button>
            {allowSkip && (
              <button className="btn-ghost" onClick={reset}>
                稍后再说
              </button>
            )}
          </div>
        )}

        {state.phase === "failed" && (
          <div className="updater-actions">
            <button className="btn-ghost" onClick={reset}>
              关闭
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
