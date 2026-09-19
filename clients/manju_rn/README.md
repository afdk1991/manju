# 漫剧 · React Native + 鸿蒙端（clients/manju_rn）

漫剧（Manju）是获取**漫剧视频**（漫画改编短剧 / 竖屏短剧）的应用。
本目录是跨平台客户端的 **React Native（Android / iOS）** 实现，外加一套
独立的 **HarmonyOS（ArkTS）** 实现（`harmony/` 子目录）。

- 技术栈：React Native 0.74 + TypeScript（**裸 RN，非 Expo**）
- 内容接口与 OTA 服务（已部署，可直接调试）：
  `https://manju-drama-hub-tkwcxlaw.edgeone.cool`
- 共用契约（四端一致，字段名/枚举不得改动）：
  - `spec/ota-protocol.v1.md` — OTA 更新协议
  - `spec/openapi.yaml` — 内容中台 API
  - 内置 Ed25519 公钥：`f2obZdLFwhWJtuA/u/VW/EB1jAZ/UiZF/eEbxFJ0a3c=`（2026-09-20 轮换后的新密钥）

---

## 一、安装依赖

> 本目录未执行 `npm install`（耗时且易失败）；请在具备工具链的机器上执行。

```bash
cd clients/manju_rn
npm install          # 安装 RN + 第三方依赖
```

### 第三方核心依赖

| 依赖 | 用途 |
|---|---|
| `react-native-video` | 播放 HLS（`container=hls`）视频源 |
| `react-native-fs` | 下载更新包、流式计算 SHA256 |
| `@noble/ed25519` | 校验安装包 Ed25519 签名 |
| `crypto-js` | SHA256 流式哈希 |
| `react-native-device-info` | 版本号 / 构建号 / 架构 |
| `@react-native-async-storage/async-storage` | 持久化匿名设备指纹 |
| `@react-navigation/*` | 页面导航 |

---

## 二、运行

### Android

```bash
# 1. 原生依赖（首次）
cd android && ./gradlew clean && cd ..
# 2. 启动 Metro
npm start
# 3. 另开终端运行（需已连接设备或模拟器，且安装 Android SDK）
npm run android
```

### iOS

```bash
cd ios && pod install && cd ..   # 需 macOS + CocoaPods
npm start
npm run ios                       # 需 macOS + Xcode
```

> iOS 原生模块 `UpdaterModule.swift` 为**可选项**：真正的商店跳转由 JS 侧
> `Linking.openURL` 完成；若希望原生侧兜底，需在 Xcode 中将
> `ios/Manju/Manju-Bridging-Header.h` 设为 Target 的 Objective-C Bridging Header。

### 鸿蒙（独立工程）

鸿蒙端是**另一套代码**，需 DevEco Studio 打开 `harmony/` 目录构建，详见
[`harmony/README.md`](./harmony/README.md)。不能在本 RN 工具链中构建。

---

## 三、各平台构建命令

| 平台 | 构建产物 | 命令 / 工具 |
|---|---|---|
| Android | APK / AAB | `cd android && ./gradlew assembleRelease` |
| iOS | IPA | Xcode → Product → Archive（或 `fastlane`） |
| HarmonyOS | APP / HAP | DevEco Studio → Build → Build APP(s)（见 `harmony/README.md`） |
| Windows / macOS / Linux | — | 不在本 RN 工程范围；由 Tauri 端（`clients/manju_tauri/`）覆盖 |

---

## 四、6 平台自动更新能力矩阵（⚠️ 红线必读）

> 下表是**平台操作系统级别**的能力，不是实现差异。任何客户端都不得声称
> 在 iOS / HarmonyOS 上支持"自动下载并安装"。

| 平台 | 可静默自更新 | 实际机制 | 允许的 `policy` |
|---|---|---|---|
| **Windows** | ✅ | 下载 → SHA256+Ed25519 校验 → MSIX `PackageManager` / EXE `/VERYSILENT` → 重启 | `suggest` / `forced` / `silent` |
| **macOS** | ✅（需签名） | 下载 `.dmg`/`.pkg` → 挂载/安装 → 重启；或 Sparkle 2 | `suggest` / `forced` / `silent` |
| **Linux** | ✅ | AppImage 自替换 / `.deb`+polkit / tar.gz 自替换 | `suggest` / `forced` / `silent` |
| **Android** | ⚠️ 有条件 | 下载 APK → 校验 → `PackageInstaller` 会话安装；需 `REQUEST_INSTALL_PACKAGES` 权限，首次需用户授权"允许来自此来源的应用" | `suggest` / `forced` |
| **iOS** | ❌ **禁止** | Apple 禁止侧载静默安装。只能**检测更新 → 展示说明 → 跳转 App Store**（`store_fallback.url`） | `suggest` / `forced` → **一律降级为跳转商店** |
| **HarmonyOS** | ❌ 受限 | 仅华为应用市场（`store://appgallery`）或企业 MDM 分发，无公开静默安装 API。只能**检测更新 → 跳转应用市场** | `suggest` / `forced` → **一律降级为跳转商店** |

### 红线在代码中的体现

- `src/updater/index.tsx` 的 `downloadAndInstall()` 开头**先拦截**
  `!canSelfInstall(platform)`（即 iOS / HarmonyOS），直接走商店跳转分支，
  **绝不下载、绝不安装**。服务端即便错误下发产物也会被丢弃。
- iOS 的 UI 文案与注释明确写出"Apple 平台限制，无法应用内自动安装"
  （`SettingsScreen.tsx`、`src/updater/UpdaterModule.swift`）。
- 鸿蒙的 `harmony/entry/src/main/ets/updater/Updater.ets` 注释说明
  "鸿蒙无公开静默安装 API"，`openAppGallery()` 仅跳转应用市场。
- 上报事件使用 `event=unsupported` 统计 iOS / HarmonyOS 的真实转化率。

---

## 五、代码结构

```
clients/manju_rn/
├── package.json / tsconfig.json / babel.config.js / metro.config.js
├── app.json / index.js / App.tsx          # 工程配置与入口（裸 RN）
├── android/                                # Android 原生（含 UpdaterModule.kt）
│   └── app/src/main/java/com/manju/
│       ├── MainActivity.kt / MainApplication.kt
│       ├── UpdaterModule.kt / UpdaterPackage.kt   # PackageInstaller 会话安装
│       └── res/xml/file_paths.xml                  # FileProvider 路径
├── ios/                                    # iOS 原生
│   └── Manju/
│       ├── Info.plist / AppDelegate.swift / Podfile
│       └── UpdaterModule.swift             # 仅商店跳转兜底，禁写安装
├── src/
│   ├── api/client.ts                       # 内容接口 + OTA 检查/上报（对齐 openapi）
│   ├── device.ts                           # platform / arch / 匿名 device_id
│   ├── screens/                            # Home / Detail / Player / Search / Settings
│   └── updater/
│       ├── index.tsx                       # 门面：检查→下载→校验→安装（含红线拦截）
│       ├── verify.ts                       # SHA256 + Ed25519 验签（生命线）
│       ├── download.ts                     # react-native-fs 下载
│       ├── native.ts                       # 桥接 Android UpdaterModule
│       ├── publicKey.ts                    # 内置 Ed25519 公钥
│       └── types.ts                        # OTA 协议数据模型（字段名与契约一致）
└── harmony/                                # 鸿蒙端（独立 ArkTS 工程，见 harmony/README.md）
```

---

## 六、安全要点（对应 spec/ota-protocol.v1.md §7）

1. OTA 与内容接口**必须 HTTPS**（客户端不放开 ATS 明文）。
2. 下载后**必须**校验 `sha256`，不匹配立即删除文件并中止。
3. 生产环境**必须**校验 Ed25519 签名（公钥编译期内置，`OTA_VERIFY_SIGNATURE=true`）。
4. 校验失败立即删除临时文件，绝不留下未验证的可执行文件。
5. 客户端**拒绝降级**：`build` 不递增或语义化版本更低时拒绝安装。
6. 匿名设备指纹不含 PII，仅用于灰度分组与上报。
