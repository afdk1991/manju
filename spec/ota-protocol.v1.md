# OTA 更新协议 v1（全平台统一 · 单一事实来源）

> 本文件是 **server 与所有客户端（Flutter / Tauri / React Native / ArkTS）之间关于"版本更新"的唯一契约**。
> 任何客户端实现都必须以本文件为准，不得自定义字段。

## 1. 术语

| 术语 | 含义 |
|---|---|
| `platform` | `android` \| `ios` \| `harmonyos` \| `windows` \| `macos` \| `linux` |
| `arch` | `x86_64` \| `arm64` \| `armv7` \| `x86` |
| `channel` | `stable` \| `beta` \| `nightly`（灰度通道） |
| `policy` | 更新安装策略，受平台能力限制，见 §4 |
| `artifact` | 实际可安装的产物文件 |

## 2. 检查更新

```http
GET /api/v1/ota/check
```

Query 参数（全部必填，除注明外）：

| 参数 | 类型 | 说明 |
|---|---|---|
| `platform` | enum | 见术语表 |
| `arch` | enum | 见术语表 |
| `channel` | enum | 见术语表 |
| `version` | semver | 客户端当前版本，如 `1.2.0` |
| `build` | int | 构建号，单调递增 |
| `device_id` | string | 匿名设备指纹（≤64 字符，不得含 PII） |
| `locale` | string | 可选，`zh-CN` / `en-US` |
| `abi` | string | 可选，Linux 附加：`musl` / `gnu` |

### 响应 `200 OK` — 有更新

```json
{
  "has_update": true,
  "policy": "forced",
  "release": {
    "version": "1.3.0",
    "build": 130,
    "channel": "stable",
    "released_at": "2026-09-16T10:00:00Z",
    "min_supported_version": "1.1.0",
    "notes_i18n": {
      "zh-CN": "- 新增倍速记忆\n- 修复首屏卡顿\n- 新增鸿蒙端适配",
      "en": "- Speed memory\n- Fix first-frame stutter"
    },
    "artifact": {
      "type": "msix",
      "url": "https://cdn.example.com/ota/1.3.0/win-x86_64/app.msix",
      "size": 48234567,
      "sha256": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      "signature": "ed25519:MEUCIQDx...",
      "install_args": ["/quiet", "APPDIR=D:\\Program Files\\Manju"]
    },
    "delta": {
      "available": true,
      "from_versions": ["1.2.0"],
      "url": "https://cdn.example.com/ota/1.3.0/win-x86_64/app.patch",
      "size": 3145728,
      "sha256": "..."
    }
  },
  "store_fallback": {
    "enabled": true,
    "url": "https://apps.apple.com/app/id0000000000",
    "reason": "platform_restricted"
  }
}
```

### 响应 `204 No Content` — 无更新

### 响应 `304 Not Modified` — 支持 `If-None-Match`（ETag = release.build）

## 3. 字段说明

| 字段 | 必填 | 说明 |
|---|---|---|
| `policy` | ✅ | `suggest` 提示用户 / `forced` 强制（低于 `min_supported_version` 时服务端置此值）/ `silent` 后台静默安装（仅桌面端具备能力） |
| `min_supported_version` | ✅ | 低于此版本 → `policy` 必须为 `forced` |
| `artifact.sha256` | ✅ | 客户端**必须**校验，不匹配立即中止 |
| `artifact.signature` | ⚠️ | Ed25519 签名，格式 `ed25519:<base64>`。生产环境必填，客户端公钥内置 |
| `store_fallback` | ⚠️ | **iOS / HarmonyOS 必填**，见 §4 |

## 4. 平台能力与策略矩阵（关键 · 不可违背）

| 平台 | 可静默自更新 | 实际机制 | `policy` 允许值 |
|---|---|---|---|
| **Windows** | ✅ | 下载 → SHA256+Ed25519 校验 → MSIX 走 `PackageManager` / EXE 走 `/VERYSILENT` → 重启 | `suggest` / `forced` / `silent` |
| **macOS** | ✅（需签名） | 下载 `.dmg`/`.pkg` → 挂载/安装 → 重启；或接入 Sparkle 2 | `suggest` / `forced` / `silent` |
| **Linux** | ✅ | AppImage 自替换 / `.deb`+polkit / tar.gz 自替换（需写权限） | `suggest` / `forced` / `silent` |
| **Android** | ⚠️ 有条件 | 下载 APK → `PackageInstaller` 会话安装；需 `REQUEST_INSTALL_PACKAGES` 权限，首次需用户授权"允许来自此来源的应用" | `suggest` / `forced` |
| **iOS** | ❌ **禁止** | Apple 禁止侧载静默安装。只能 `UIApplication.open` 跳 App Store / TestFlight | `suggest` / `forced` → **一律降级为跳转 `store_fallback.url`** |
| **HarmonyOS** | ❌ 受限 | 仅华为应用市场（`store://appgallery`）或企业 MDM 分发，无公开静默安装 API | `suggest` / `forced` → **一律降级为跳转 `store_fallback.url`** |

> **实现红线**：iOS 与 HarmonyOS 客户端**严禁**声称支持"自动下载并安装"。
> 正确行为：检测到更新 → 展示更新说明 → 用户确认 → 跳转商店/应用市场 → 客户端进入待更新状态。

## 5. 灰度与分组

服务端可按 `device_id` 哈希做百分比放量：

```
bucket = crc32(device_id) % 100
if bucket >= channel.rollout_percent: return 204
```

## 6. 上报

```http
POST /api/v1/ota/report
```

```json
{
  "device_id": "...",
  "platform": "windows",
  "version": "1.3.0",
  "build": 130,
  "event": "downloaded" | "installed" | "failed" | "skipped" | "unsupported",
  "reason": "sha256_mismatch",
  "elapsed_ms": 12345
}
```

`event=unsupported` 用于 iOS/HarmonyOS 上报"已引导跳转商店"，便于统计真实转化率。

## 7. 安全要求

1. **必须** HTTPS，禁止明文。
2. **必须**校验 `sha256`。
3. **必须**校验 Ed25519 签名（生产），公钥编译进客户端。
4. 下载临时目录**必须**限制权限，安装后清除。
5. 服务端**必须**对 `install_args` 做白名单，防止参数注入。
6. 客户端**必须**校验 `release.version` 单调递增，拒绝降级（除非 `channel` 切换）。

## 8. 错误码

| HTTP | code | 含义 |
|---|---|---|
| 400 | `invalid_platform` | platform/arch 非法 |
| 404 | `no_artifact` | 该平台+架构无可用产物 |
| 409 | `rollback_attempt` | 试图降级 |
| 429 | `rate_limited` | 检查过于频繁（建议间隔 ≥ 6h，启动时+手动触发） |
