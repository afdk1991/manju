# 漫剧 Manju · 桌面端（Tauri 2 + React + TypeScript）

漫剧（漫画改编短剧 / 竖屏短剧）跨平台客户端的 **桌面备选方案**，覆盖 **Windows / macOS / Linux** 三端。
相比 Flutter 主干，Tauri 2 桌面端包体更小、原生体验更好，并在检测到版本更新后**自动下载并安装**。

> 主交付目录：`clients/manju_tauri/`
> 共用契约：`spec/ota-protocol.v1.md`（OTA 更新协议）、`spec/openapi.yaml`（内容中台 API）
> 行为参照（四端一致）：`clients/manju_flutter/lib/core/updater/`

---

## 1. 技术栈

| 层 | 选型 |
|---|---|
| 运行时 | [Tauri 2](https://v2.tauri.app/)（Rust 后端 + WebView 前端） |
| 前端 | React 18 + TypeScript + Vite 5 |
| 路由 | react-router-dom（HashRouter） |
| 播放 | hls.js（HLS/m3u8） |
| 更新校验 | @noble/curves（Ed25519）+ @noble/hashes（SHA256） |
| 平台能力 | Tauri 官方插件：http / fs / dialog / process / os / store / shell / updater |

> 说明：本项目**不执行** `npm install` / `cargo build`（交付机无 Rust 工具链）。
> 源码已对齐 Tauri 2.x 真实 API，在有工具链的环境中可直接构建。

---

## 2. 安装依赖与运行

### 2.1 前置条件

- **Node.js** ≥ 18
- **Rust 工具链** ≥ 1.77（仅构建桌面端需要）：[rustup](https://rustup.rs/)
- 平台依赖（按目标系统）：
  - Windows：[WebView2](https://developer.microsoft.com/zh-cn/microsoft-edge/webview2/)（系统自带）、Visual Studio C++ 构建工具
  - macOS：`xcode-select --install`
  - Linux：webkit2gtk-4.1、librsvg、patchelf（如 `sudo apt install libwebkit2gtk-4.1-dev librsvg2-dev patchelf`）

### 2.2 安装与开发

```bash
cd clients/manju_tauri
npm install

# 开发模式：先起 Vite 前端（:1420），再起 Tauri 窗口
npm run tauri dev
# 或仅调试前端（无原生能力）：
npm run dev
```

### 2.3 构建各平台安装包

> 需在对应操作系统上执行（交叉编译支持有限，推荐在目标系统内构建）。

```bash
# 通用：构建当前所在平台的所有产物
npm run tauri build

# 产物位置：src-tauri/target/release/bundle/
#   Windows → .msi / .exe
#   macOS   → .app / .dmg
#   Linux   → .deb / .AppImage / .rpm
```

各平台指定目标（需本机/CI 已配置对应工具链）：

```bash
# Windows（在 Windows 上）
npm run tauri build -- --target x86_64-pc-windows-msvc
npm run tauri build -- --target aarch64-pc-windows-msvc

# macOS（在 macOS 上）
npm run tauri build -- --target x86_64-apple-darwin
npm run tauri build -- --target aarch64-apple-darwin

# Linux（在 Linux 上）
npm run tauri build -- --target x86_64-unknown-linux-gnu
npm run tauri build -- --target aarch64-unknown-linux-gnu
```

---

## 3. 桌面三端自动更新能力

核心文件：`src/updater/`（检查 → 下载 → SHA256+Ed25519 校验 → 安装 → 重启）。

### 3.1 与 iOS / 鸿蒙的对比

| 平台 | 可自动下载并安装 | 实际机制 | 说明 |
|---|---|---|---|
| **Windows** | ✅ | MSIX 走 `Add-AppxPackage`；EXE 走 `/VERYSILENT` `/quiet` | 静默自更新 |
| **macOS** | ✅（需签名） | 挂载 dmg 拷贝 .app，或 `installer -pkg`；可接 Sparkle 2 | 未签名会被 Gatekeeper 拦截 |
| **Linux** | ✅ | AppImage 自替换 / `.deb`+polkit / tar.gz 自替换 | 依包格式分流 |
| iOS | ❌ **禁止** | 只能跳转 App Store / TestFlight | 见 `store_fallback` |
| HarmonyOS | ❌ **受限** | 仅华为应用市场 / 企业 MDM | 见 `store_fallback` |

> **红线**：iOS / 鸿蒙**严禁**声称支持"自动下载并安装"。本项目桌面端具备完整自安装能力，
> 而 iOS/鸿蒙端（不在本目录）检测到更新后只能引导用户前往应用商店。

### 3.2 更新策略（policy）

服务端在 OTA 检查响应中下发 `policy`，客户端据此分流：

- `suggest`（提示）：弹窗展示更新说明，用户选择「立即更新 / 稍后」。
- `forced`（强制）：低于 `min_supported_version` 时服务端置此值，弹窗不提供「稍后」，检测到即拉起安装。
- `silent`（静默）：桌面端后台下载并安装，**不打断用户**，安装完成后重启。

### 3.3 两条更新路径（二选一，互不冲突）

> 详见 `src/updater/engine.ts` 顶部说明与 `applyCustomUpdate` / `runOfficialUpdater`。

**路径 A · 官方 Tauri Updater Plugin（推荐，产物已签名时）**

- 在 `src-tauri/tauri.conf.json` 的 `plugins.updater` 配置 `endpoints` + `pubkey`，产物经 Tauri 签名体系签名。
- 优点：开箱即用、自动校验签名、内置进度。
- 代码入口：`runOfficialUpdater()`（`src/updater/engine.ts`）。

**路径 B · 自定义下载 + 安装（本项目默认采用，与 Flutter/RN 共用同一份 JS 契约）**

- 走自有 OTA 协议（`GET /api/v1/ota/check`），用 `plugin-http` 下载、`plugin-fs` 落盘到 `$TEMP`，
  再用本项目内置 Ed25519 公钥做验签（`verify.ts`），最后按平台拉起系统安装器（`install.ts`）。
- 优点：与四端契约完全一致，支持 delta 差分 / 灰度放量。
- 代码入口：`applyCustomUpdate()`（`src/updater/engine.ts`）。

### 3.4 平台差异如何体现

- **Windows 静默**：EXE 安装包用 `/VERYSILENT`（完全静默）或 `/quiet`（被动进度），MSIX 走 `Add-AppxPackage`。
- **macOS 需签名**：未签名产物会被 Gatekeeper 拦截，必须在 `install.ts` 安装前确保已开发者签名；
  或改用官方 Updater Plugin（路径 A，自带签名校验）。
- **Linux 依包格式**：`appimage` 直接自替换 + `chmod +x`；`deb` 走 `pkexec dpkg -i`（polkit 提权）；
  `tar.gz`/`zip` 解压到缓存目录自替换（需写权限）。

### 3.5 安全校验（不可跳过）

1. 全程 HTTPS（见 `spec/ota-protocol.v1.md` §7）。
2. **必须**校验 `sha256`，不匹配立即中止并删除临时文件。
3. **必须**校验 Ed25519 签名（`ed25519:{base64}`），公钥编译期内置（`src/updater/publicKey.ts`）。
   签名对象为规范化消息 `{version}|{build}|{sha256小写}|{url}`，与 Flutter / 服务端逐字节一致。
4. 校验失败/取消后清除临时目录，绝不留存未验证的可执行文件。
5. 拒绝版本降级（除非 `channel` 切换）。

> **未签名产物的临时方案**：在 `tauri.conf.json` 把 `plugins.updater.dangerousInsecureTransportProtocol`
> 置 `true`，或 `publicKey.ts` 的 `REQUIRE_SIGNATURE` 置 `false`（仅依赖 SHA256）。
> 二者**仅限内网/测试**，**严禁**生产使用。

---

## 4. 目录结构

```
clients/manju_tauri/
├─ index.html
├─ package.json / vite.config.ts / tsconfig*.json
├─ src/
│  ├─ main.tsx / App.tsx / styles.css
│  ├─ api/            # client.ts（内容中台 + OTA 调用）、types.ts（四端共用类型）
│  ├─ screens/        # Home / Detail / Player / Search / Settings
│  └─ updater/        # index.ts(出口) / engine.ts / verify.ts / publicKey.ts
│                      # device.ts / download.ts / install.ts / useUpdater.ts / UpdaterModal.tsx
└─ src-tauri/
   ├─ Cargo.toml / build.rs
   ├─ tauri.conf.json # productName=Manju, version=1.0.0, updater 配置
   ├─ capabilities/default.json  # 最小权限
   └─ src/  # main.rs(入口) / lib.rs(插件注册)
```

---

## 5. 已知限制

- **iOS / 鸿蒙不在本目录**：桌面端不实现"跳商店"分支，但 `ota-protocol` 已为这两端定义 `store_fallback`。
- **macOS 签名**：路径 B 下未签名 dmg/pkg 会被 Gatekeeper 拦截，需自行完成开发者签名或改走路径 A。
- **Linux 提权**：`deb` 安装依赖 `pkexec`/polkit，部分精简系统可能缺失；AppImage/tar.gz 需目标目录可写。
- **Windows 安装模式**：`tauri.conf.json` 中 `windows.installMode` 默认 `passive`（被动），
  可在 `quiet` / `passive` 间调整；自定义 EXE 安装参数由服务端 `install_args` 白名单下发。
- **版本号来源**：OTA 检查使用应用清单版本（`@tauri-apps/api/app` 的 `getVersion` / `getBuildNumber`），
  需与 `tauri.conf.json` 的 `version` 保持一致，否则服务端灰度/降级判断会失准。
- **未执行构建验证**：本交付未在本机 `cargo build` / `npm run build`，请在有 Rust + Node 工具链的环境首次构建。
- **跨端分发**：推荐各平台在对应系统上构建；Tauri 跨平台交叉编译支持有限。
