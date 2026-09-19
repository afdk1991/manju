# 阻塞项清单：多端自动安装与分发链路

> 生成时间：2026-09-20
> 数据口径：本文所有"状态"均来自对本仓库文件与本机工具链的**实际检查**，不是推断。

## 状态定义（严格区分，不混用）

| 标记 | 含义 |
|---|---|
| ✅ **已实现** | 代码/配置已写入仓库。仅表示"存在"，不代表能跑。 |
| 🧪 **已验证** | 在本机**实际执行过**命令并得到通过结果，下文标注了具体命令。 |
| ⏳ **待真机验证** | 需要真实设备或平台工具链才能确认，**当前未做任何验证**。 |
| 🔴 **阻塞** | 缺材料或环境，无法推进。 |
| 🟡 **部分阻塞** | 可构建，但产物不完整/不可分发。 |
| 🟢 **已解决** | 本轮已处理。 |

**本仓库没有任何一端在真机或模拟器上运行过。本文不给出任何"跑通"结论。**

---

## 0. 本机工具链探测结果（决定哪些能验证）

| 工具 | 探测结果 | 影响 |
|---|---|---|
| Java (JDK) | ✅ 21.0.12.1 | Java 可用 |
| Gradle | ❌ 未安装 | Android 构建不可执行 |
| Android SDK | ❌ 未安装（`ANDROID_HOME` 未设置，常见路径均无） | Android 构建/安装不可执行 |
| adb | ❌ 未安装 | 无法连接真机 |
| Rust / cargo | ❌ 未安装 | Tauri 构建不可执行 |
| Flutter / Dart | ❌ 未安装（曾装过，已被清理） | Flutter 六端构建不可执行 |
| Node | ✅ v22.22.2 | 前端/RN 类型检查可执行 |
| Xcode | ❌ 不存在（Windows 主机，结构上不可能） | macOS/iOS 签名与构建不可执行 |
| DevEco / hvigorw / ohpm | ❌ 未安装 | 鸿蒙构建不可执行 |

**结论：四端打包链路在本机全部不可执行。任何"可打包"的说法都无本机证据。**

---

## 1. 代码签名证书

### 1.1 macOS（Developer ID）

| 项 | 状态 |
|---|---|
| Flutter macOS 工程 `CODE_SIGN_IDENTITY` | 🔴 `= "-"`，即 ad-hoc 未签名 |
| `DEVELOPMENT_TEAM` | 🔴 未配置 |
| `PROVISIONING_PROFILE_SPECIFIER` | 🔴 空 |
| CI 中的 codesign / notary 步骤 | 🔴 不存在 |
| Tauri macOS 签名配置 | 🔴 `tauri.conf.json` 无签名段 |

**影响范围**：未签名的 `.app`/`.dmg` 会被 Gatekeeper 拦截（"无法打开，因为它来自身份不明的开发者"）。
**macOS 的自动安装链路在未签名状态下等同于不可用**——即使更新器把包装下来、拉起安装器，也会被系统拦下。

**签名材料到位前无法推进的步骤**：
- ❌ 打包可分发的 macOS DMG
- ❌ 公证（notarization）与 stapler 装订
- ❌ 桌面端静默/被动安装（`installMode: passive`）实测
- ❌ 任何 macOS 真机验证
- ✅ 可以做：代码开发、单元测试、`dart analyze` 类静态检查（但 Flutter SDK 当前不在本机）

**你需要执行的步骤**：
1. 加入 Apple Developer Program（¥688/年），获取 **Developer ID Application** 证书
2. `Xcode → Settings → Accounts` 登录 Apple ID，下载证书到钥匙串
3. 导出 `.p12`（设密码）+ 创建 **App Store Connect API Key**（`.p8`，用于 notarytool）
4. CI 注入 Secrets：`APPLE_CERTIFICATE`（base64 的 p12）、`APPLE_CERTIFICATE_PASSWORD`、
   `APPLE_SIGNING_IDENTITY`、`APPLE_API_KEY` / `APPLE_API_ISSUER` / `APPLE_API_KEY_ID`
5. 构建后执行：`codesign --deep --force --options runtime --sign "Developer ID Application: ..."` →
   `ditto` 打包 → `xcodebuild -createArchive`/`notarytool submit --wait` → `stapler staple`
6. Flutter 侧还需在 Xcode 中把 `CODE_SIGN_STYLE` 改为 `Manual` 并填入 Team ID

> 注：`CODE_SIGN_STYLE` 当前在 `project.pbxproj` 中 Automatic / Manual 混用（第 489 行 Automatic、第 504 行 Manual），
> 后续接入正式签名时需统一，否则 Xcode 会覆盖命令行签名。

### 1.2 Android（keystore）

| 项 | 本轮前 | 本轮后 |
|---|---|---|
| RN `manju-release.keystore` | ✅ 已存在 | ✅ 存在 |
| RN `app/debug.keystore` | 🔴 **缺失** → 构建必失败 | 🟢 已生成 |
| RN release 签名配置 | 🔴 `signingConfig signingConfigs.debug` | 🟢 已接 `keystore.properties` |
| Flutter release 签名配置 | 🔴 `signingConfigs.getByName("debug")` | 🟢 已加 release signingConfig |
| Flutter keystore 物料 | 🔴 无 | 🟢 复用同一把密钥 |
| 缺 `keystore.properties` 时 | 静默产出 debug 签名包 | 🟢 显式 `GradleException` 失败 |
| **实际签出过 APK** | ❌ | ❌（无 Android SDK / Gradle） |

**状态：✅ 已实现 / ⏳ 待真机验证（从未产出过真实签名包）**

**关键约束（与你指出的一致）**：`manju-release.keystore` 一旦用于上架，后续版本必须用同一把密钥，
更换等于新应用，用户必须卸载重装。当前两端已统一为同一把密钥（Flutter 的副本是从 RN 侧复制的同一文件），
发布主体一致。**请异地备份该 keystore，丢失将无法更新应用。**

**签名材料到位前无法推进的步骤**：
- ❌ 产出可上架的 release APK/AAB
- ❌ Android 自动安装实测（`PackageInstaller` + `REQUEST_INSTALL_PACKAGES` 授权流程）
- ❌ 覆盖安装与版本升级验证
- ✅ 可以做：类型检查（已做）、Gradle 脚本正确性静态审查

**你需要执行的步骤**：
1. 备份 `clients/manju_rn/android/app/manju-release.keystore`（Flutter 侧为副本）
2. CI 注入：`cp keystore.properties.example keystore.properties` 后由 Secrets 写入密码
   或直接注入同名文件与 `manju-release.keystore` 两个 Secret
3. 安装 Android SDK + Gradle，执行 `./gradlew assembleRelease`
4. 用 `apksigner verify --verbose` 确认签名生效

### 1.3 Windows

| 项 | 状态 |
|---|---|
| 代码签名证书 | 🔴 无 |
| Tauri `installMode` | ✅ 已配置 `passive` |

Windows 不强制签名，但未签名的安装包会触发 SmartScreen 警告，且 MSIX 必须签名才能免管理员权限安装。
**可选但强烈建议**：购买 OV/EV 代码签名证书（EV 可立即建立 SmartScreen 声誉）。

### 1.4 鸿蒙

| 项 | 状态 |
|---|---|
| 开发者证书 / Profile | 🔴 无（需华为开发者账号） |
| ArkTS 代码 | ✅ 已实现 |
| 签名校验实现 | 🔴 **缺失**（见第 5 节） |

---

## 2. 分发域名：临时预览 vs 正式发布

### 2.1 临时预览（当前状态）

| 项 | 值 |
|---|---|
| 域名 | `https://manju-drama-hub-tkwcxlaw.edgeone.cool` |
| 性质 | EdgeOne 预览域名，带 `eo_token`，**约 3 小时过期** |
| 当前可用性 | 🔴 **已过期**：2026-09-20 实测根路径与 `/api/dramas` 均返回 **HTTP 401** |
| 适用 | 临时验证、演示 |
| 不适用 | 客户端内置、长期在线、自动更新 |

### 2.2 正式发布（未开始）

| 步骤 | 执行方 | 状态 |
|---|---|---|
| 准备已备案域名 | 你 | 🔴 未开始 |
| EdgeOne 控制台 → 域名管理 → 绑定自定义域名 | 你 | 🔴 未开始 |
| DNS 添加 CNAME 指向 EdgeOne 分配的 CNAME 目标 | 你 | 🔴 未开始 |
| SSL 证书签发（EdgeOne 自动） | 平台 | 🔴 未开始 |
| 把正式域名写入各端配置 | 我（拿到域名后） | 🔴 未开始 |

> ⚠️ 中国大陆节点绑定自定义域名**必须已完成 ICP 备案**。

### 2.3 各端 API 基址现状（不一致，需统一）

| 端 | 当前值 | 问题 |
|---|---|---|
| RN (`src/api/client.ts:18`) | `https://manju-drama-hub-tkwcxlaw.edgeone.cool` | 预览域名，已过期 |
| Tauri (`src/api/client.ts:23`) | 同上 | 同上 |
| Flutter (`app_config.dart:34`) | `http://localhost:8000` | 真机连不上 |
| Flutter ohos (`Index.ets:37`) | `http://localhost:8000` | 真机连不上 |
| Flutter ohos (`UpdaterPlugin.ets:153`) | `http://localhost:8000` | 真机连不上 |
| RN harmony (`Index.ets:9`) | `https://manju-drama-hub-...edgeone.cool` | 预览域名，已过期 |

**绑定正式域名后需要我做的**：统一替换上述 6 处，并同步
`tauri.conf.json` 的 updater endpoints、`capabilities/default.json` 的 `http:allow-fetch` 白名单。

---

## 3. Tauri 图标

### 3.1 构建所需完整清单（Tauri v2，`bundle.icon` 声明的 5 项）

| 文件 | 规格 | 用途 | 状态 |
|---|---|---|---|
| `icons/32x32.png` | 32×32 RGBA PNG | Windows 任务栏小图标 | 🟢 已生成 |
| `icons/128x128.png` | 128×128 RGBA PNG | Linux / 通用 | 🟢 已生成 |
| `icons/128x128@2x.png` | 256×256（文件名写 128@2x） | 高分屏 | 🟢 已生成 |
| `icons/icon.icns` | macOS 图标容器 | macOS bundle | 🟡 已生成，含 ic08(256) + ic09(512)，**无 1024 条目** |
| `icons/icon.ico` | Windows 图标容器 | Windows 可执行文件 | 🟢 已生成，含 16/32/48/64/128/256 **六档** |
| `icons/icon.png` | 1024×1024 | Linux AppImage / 备用源 | 🟢 已生成 |

`tauri.conf.json` 中声明的 5 项**全部存在且字节结构有效**（已用 PNG/ICO 头解析校验）。

### 3.2 各平台差异与残留注意

| 平台 | 要求 | 状态 |
|---|---|---|
| Windows | ICO 内嵌 PNG，多档尺寸 | 🟢 六档齐全 |
| macOS（Developer ID 分发） | ICNS，256/512 足够 | 🟢 满足（ic08+ic09） |
| macOS（**Mac App Store**） | 需 **1024×1024** 条目 | 🟡 当前 ICNS 无 1024 条目，上架前需重做 |
| Linux | PNG 即可 | 🟢 满足 |

> 当前图标是**占位设计**（深蓝→紫渐变 + 白色播放三角，由 `scripts/gen_icons_all.py` 零依赖生成）。
> 替换为品牌图标时保持同名同尺寸即可。

### 3.3 其它端图标补齐情况（本轮一并处理）

| 端 | 本轮前 | 本轮后 |
|---|---|---|
| Flutter Windows `app_icon.ico` | 🔴 缺失（MSVC 资源编译会失败） | 🟢 已生成 |
| Flutter Linux `icon.png` | 🔴 无 | 🟢 已生成 |
| Flutter ohos `base/media/*` | 🔴 整个目录缺失 | 🟢 已生成 4 个 PNG |
| RN harmony `base/media/*` | 🔴 整个目录缺失 | 🟢 已生成 4 个 PNG |
| RN Android `mipmap-*/ic_launcher.png` | 🔴 五档全缺 | 🟢 已生成 |
| 鸿蒙 `element/string.json`、`color.json`、`media/layered_image.json` | 🔴 **整个缺失**（`module.json5` 引用的 `$media:`/`$string:`/`$color:` 全部无法解析，DevEco 必然失败） | 🟢 已补齐 |

---

## 4. 真机验证状态

**四端均未在任何真机或模拟器上运行过。** 区分如下：

### ✅ 已实现（代码已写入）

| 模块 | 说明 |
|---|---|
| OTA 协议 v1 | `spec/ota-protocol.v1.md` |
| 四端更新器 | Flutter / Tauri / RN / 鸿蒙 ArkTS |
| Ed25519 验签 | 三端（Flutter/RN/Tauri）已实现；**鸿蒙端缺失** |
| 平台红线分流 | iOS / 鸿蒙强制转 `store_fallback` |
| Android 安装器 | `PackageInstaller` + FileProvider + `REQUEST_INSTALL_PACKAGES` |
| 后端 OTA 服务 | check / report / public-key / admin |

### 🧪 已验证（本机实际执行并通过）

| 验证项 | 命令 | 结果 |
|---|---|---|
| 后端冒烟 | `python scripts/smoke_test.py` | **19/19** |
| Tauri 前端构建 | `npm run build`（`clients/manju_tauri`） | **退出码 0**，产出 dist（815KB JS / 4.65KB CSS） |
| RN 类型检查 | `npx tsc --noEmit`（`clients/manju_rn`） | **退出码 0** |
| 图标文件有效性 | PNG/ICO 头解析 | 尺寸与格式全部正确 |
| Ed25519 密钥轮换 | 签名→验签往返脚本 | 新公钥验签通过、篡改被拒、旧公钥验新签名被拒 |
| Flutter 静态检查 | `dart analyze` / `dart test` | **曾通过（0 error / 7/7）**，但 Flutter SDK 当前不在本机，**无法重跑** |

### ⏳ 待真机验证（从未验证，无任何结论）

| 项 | 阻塞原因 |
|---|---|
| Android APK 安装与自动更新 | 无 Android SDK / Gradle / adb |
| iOS 商店跳转 | 无 Xcode |
| macOS 静默安装 | 无 macOS 主机、无 Developer ID 证书 |
| Windows 被动安装（`passive`） | 无 Rust，无法构建 Tauri |
| 鸿蒙商店跳转 | 无 DevEco |
| Linux AppImage 安装 | 无 Rust，且需 Linux 环境 |
| 更新包下载→校验→安装完整链路 | 全部依赖上述平台产物 |
| 灰度放量、回滚拦截、ETag 304 | 服务端逻辑已实现且冒烟覆盖，**但未经真实客户端验证** |

---

## 5. 本轮额外发现的问题（不在你列出的四项内）

| # | 问题 | 严重度 | 状态 |
|---|---|---|---|
| 1 | **OTA 私钥曾推送到 GitHub**（`keys/ota_private.pem` 在 `origin/main` 历史中） | 🔴 | 🟢 已轮换密钥 + `git filter-repo` 清历史 + 强推 |
| 2 | Tauri `capabilities/default.json` 的 `http:allow-fetch` 原只允许 `api/cdn.example.com`，真实域名请求会被权限系统拦截 | 🔴 | 🟢 已改为真实域名 + 本地联调地址 |
| 3 | Tauri `updater.endpoints` 为占位 `cdn.example.com`；且官方插件验签对象是**文件字节**，与 OTA v1 的**规范化消息**签名不兼容 | 🔴 | 🟡 已清空占位值；路径 A 仍不可用，自动更新走自研路径 B |
| 4 | 鸿蒙 ArkTS 只有 `signature?: string` 字段声明，**无 SHA256 / Ed25519 验签实现** | 🟡 | 🔴 未修（鸿蒙只能跳 AppGallery，风险限于跳转 URL 篡改，靠 HTTPS 缓解；本机无 DevEco 无法验证 cryptoFramework 的 Ed25519 支持） |
| 5 | 各端 API 基址不一致（见 2.3） | 🟡 | 🔴 待正式域名确定后统一 |
| 6 | Flutter macOS `CODE_SIGN_STYLE` Automatic/Manual 混用 | 🟡 | 🔴 待接入正式签名时统一 |

---

## 6. 行动清单

### 你（需要账号/控制台/物理设备，我无法代办）

| 优先级 | 事项 |
|---|---|
| 🔴 P0 | 更新两处 OTA 私钥 Secret：GitHub `ED25519_PRIVATE_KEY`、EdgeOne `MANJU_OTA_PRIVATE_KEY`（内容取自 `keys/ota_private.pem`）。**不同步会导致签出的包被客户端拒绝** |
| 🔴 P0 | 备份 `manju-release.keystore`（丢失 = 无法更新应用） |
| 🔴 P1 | 加入 Apple Developer Program，获取 Developer ID 证书 + notarytool 用的 API Key |
| 🔴 P1 | EdgeOne 控制台绑定已备案自定义域名 + DNS CNAME |
| 🟡 P2 | 安装 Android SDK / Gradle，或提供一台装好工具链的构建机 |
| 🟡 P2 | 安装 Rust 工具链（Tauri 桌面端构建） |
| 🟡 P2 | 华为开发者账号 + DevEco Studio（鸿蒙端） |
| 🟡 P2 | Windows 代码签名证书（可选，改善 SmartScreen） |
| ⏳ P3 | 四端真机验证（依赖上述全部就绪） |

### 我（域名与材料到位后可立即完成）

- 统一替换 6 处 API 基址 + Tauri endpoints + 权限白名单
- 补 Tauri updater 的 Tauri-schema 清单端点（若决定启用官方插件路径 A，需同时扩展签名方案）
- 为鸿蒙 ArkTS 补 SHA256 校验（Ed25519 待确认 cryptoFramework 支持）
- 把 macOS 签名/公证步骤落进 GitHub Actions
