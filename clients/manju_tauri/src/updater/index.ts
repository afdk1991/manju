// ============================================================================
// 更新器模块统一出口（src/updater 的入口）
//
// 业务层（App / 页面）只需 `import { ... } from "./updater"` 即可：
//   - useUpdater       React Hook：检查 / 安装 / 状态机（含 policy 分流）
//   - UpdaterModal     更新弹窗 UI（更新说明 + 下载进度 + 安装重启）
//   - checkForUpdate   仅检查（不自动下载），返回 OTA 协议响应
//   - applyCustomUpdate 路径 B：自定义下载 + 校验 + 安装（本项目采用）
//   - runOfficialUpdater 路径 A：官方 Tauri updater plugin（已签名产物）
//   - restartApp      安装完成后重启应用
//   - verifyArtifact  SHA256 + Ed25519 校验（信任根）
//   - publicKey       内置 Ed25519 公钥与校验开关
//
// 关于两条更新路径的取舍，详见 engine.ts 顶部说明与 README「桌面三端自动更新」。
// ============================================================================

export { useUpdater } from "./useUpdater";
export { UpdaterModal } from "./UpdaterModal";
export {
  checkForUpdate,
  applyCustomUpdate,
  runOfficialUpdater,
  restartApp,
  type UpdatePhase,
  type UpdateState,
} from "./engine";
export { verifyArtifact, sha256Hex, otaSignatureMessage, type VerifyResult } from "./verify";
export { PUBLIC_KEY_BASE64, REQUIRE_SIGNATURE } from "./publicKey";
export { getDeviceInfo, getDeviceId } from "./device";
export { downloadArtifact, type DownloadProgress } from "./download";
export { installArtifact, type InstallResult } from "./install";
