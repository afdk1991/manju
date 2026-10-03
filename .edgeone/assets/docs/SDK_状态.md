# 项目007（manju）SDK 依赖状态与完整安装方案

> 生成时间：2026-09-21 · 由 WorkBuddy 在沙盒内实测核验
> 结论：**沙盒内可安装的 SDK 已全部到位**；剩余缺失项均为「构建/运行各端所需的系统级或设备平台 SDK」，必须在开发/构建机器上安装。

---

## 一、项目端 → 所需 SDK 映射

| 子项目 | 技术栈 | 运行/构建所需 SDK |
|---|---|---|
| `server/` | Python FastAPI 后端 | Python 3.13 + 后端依赖（fastapi/uvicorn/sqlalchemy/pydantic-settings/cryptography/requests） |
| `clients/manju_tauri` | Tauri 2 + React 桌面端 | Node 22 + npm 依赖 + **Rust/cargo** + **MSVC Build Tools**(Win)/Xcode CLT(mac) + **WebView2** 运行时 |
| `clients/manju_rn` | React Native 0.87 + 鸿蒙 | Node 22 + npm 依赖 + **Android SDK/NDK** + **Xcode**(iOS, mac) + **CocoaPods** + **HarmonyOS SDK/DevEco** + JDK |
| `clients/manju_flutter` | Flutter/Dart 跨端 | **Flutter/Dart SDK** + 各平台 SDK（Android/Xcode/HarmonyOS） |
| `makers/` | EdgeOne Makers Web 前端 | Node 22 + npm 依赖（已是最简，仅 `@edgeone/pages-blob`） |

---

## 二、已安装并核验（沙盒内）

| 类别 | 位置 / 版本 | 内容 | 状态 |
|---|---|---|---|
| Python 运行时 | managed `3.13.12` | venv `C:\Users\addk1\.workbuddy\binaries\python\envs\default` | ✅ |
| Python 后端依赖 | 同上 venv | fastapi / uvicorn[standard] / sqlalchemy / pydantic-settings / cryptography / requests（合并覆盖 `server/`、`scripts/`、`deploy/free-server/` 三处 requirements.txt） | ✅ |
| Node 运行时 | managed `22.22.2-3` | 沙盒内统一 Node 版本 | ✅ |
| npm: manju_tauri | `clients/manju_tauri/node_modules` | 46 个包目录，0 高危 | ✅ |
| npm: manju_rn | `clients/manju_rn/node_modules` | 409 个包目录，0 漏洞 | ✅ |
| npm: makers | `makers/node_modules` | 1 个包目录（`@edgeone/pages-blob`） | ✅ |
| Flutter/Dart SDK | `C:\Users\addk1\flutter` (3.47.5 stable) | `flutter.bat` ✓ · `bin/cache/dart-sdk` ✓（首次运行自举） | ✅ |
| Flutter 依赖 | `clients/manju_flutter` | `flutter pub get` 已完成，`pubspec.lock` 生成 | ✅ |
| git | 系统 `C:\Program Files\Git` | 源码管理 | ✅ |
| JDK | 系统 Microsoft JDK `21.0.12` | Android / 鸿蒙构建工具链所需 | ✅ |

> 沙盒安装说明：Python/Node 使用 WorkBuddy 托管的隔离运行时；Flutter 官方 Google Storage 在沙盒被限速至 ~30–60KB/s（1.8GB 需数小时），已改用**中国镜像** `https://storage.flutter-io.cn` 下载（约数分钟），并通过 `FLUTTER_STORAGE_BASE_URL` + `PUB_HOSTED_URL=https://pub.flutter-io.cn` 让 Dart/包下载也走镜像。解压时沙盒拦截了个别测试源码文件写入，已跳过（不影响构建）。

---

## 三、缺失 / 尚未安装的 SDK（沙盒无法安装，需本机准备）

这些属于**编译/打包各端产物**必需的系统或设备平台工具链。沙盒缺少 MSVC、Android、Xcode、HarmonyOS 环境，且 GitHub 在沙盒内超时不可用，故未下载。

| # | SDK | 用途 | 影响端 | 沙盒可装？ | 获取方式 |
|---|---|---|---|---|---|
| 1 | **Rust + cargo** | Tauri 2 桌面端用 Rust 编译原生二进制与系统桥接 | manju_tauri（Win/mac/Linux） | ❌ | rustup（`winget install Rustlang.Rustup`） |
| 2 | **MSVC Build Tools + Windows SDK** | Tauri 在 Windows 上的 C++ 编译工具链 | manju_tauri（Win 构建） | ❌ | Visual Studio Installer → “使用 C++ 的桌面开发” 工作负载 |
| 3 | **WebView2 运行时** | Tauri Windows 端渲染 WebView 的底层运行时（Win10/11 通常已预装） | manju_tauri（Win 运行） | ❌（一般已带） | Evergreen Bootstrapper / 固定版本 |
| 4 | **Android SDK + NDK + platform-tools + build-tools** | RN Android 与 Flutter Android 的编译/打包 | manju_rn(Android) / manju_flutter(Android) | ❌ | Android Studio 或 commandlinetools + `sdkmanager` |
| 5 | **Xcode + Command Line Tools** | RN iOS、Tauri macOS、Flutter iOS 的编译/签名 | manju_rn(iOS) / manju_tauri(mac) / manju_flutter(iOS) | ❌（仅 macOS） | App Store 安装 Xcode |
| 6 | **CocoaPods** | RN iOS 原生依赖管理 | manju_rn(iOS) | ❌（仅 macOS） | `sudo gem install cocoapods` |
| 7 | **HarmonyOS SDK + DevEco Studio + ohpm** | RN 鸿蒙（OpenHarmony）与 Flutter 鸿蒙的编译/打包 | manju_rn(鸿蒙) / manju_flutter(鸿蒙) | ❌ | 华为官网下载 DevEco Studio，装 SDK + ohpm |

---

## 四、完整获取与安装方案

### A. Windows 开发机（覆盖 Tauri 桌面 / Android / 鸿蒙）

```powershell
# 1) Rust 工具链（Tauri 编译必需）
winget install Rustlang.Rustup
# 安装后确认：
rustc --version && cargo --version

# 2) MSVC C++ 构建工具（Tauri Windows 编译必需）
winget install Microsoft.VisualStudio.2022.BuildTools --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended
# 或打开 Visual Studio Installer 勾选 “使用 C++ 的桌面开发”

# 3) WebView2 运行时（一般已预装；如需固定版本）
#    下载 Evergreen Bootstrapper：https://developer.microsoft.com/zh-cn/microsoft-edge/webview2/

# 4) Android SDK / NDK（RN-Android 与 Flutter-Android 必需）
#    方式一：装 Android Studio，首次启动用 SDK Manager 装：
#      - Android SDK Platform（api 34+）
#      - Android SDK Build-Tools
#      - NDK (Side by side, 建议 26.x)
#      - Android SDK Platform-Tools
#    方式二（无 GUI）：commandlinetools + sdkmanager
#      sdkmanager "platforms;android-34" "build-tools;34.0.0" "ndk;26.3.11579264" "platform-tools"
#    配置环境变量：
#      $env:ANDROID_HOME = "C:\Users\<你>\AppData\Local\Android\Sdk"
#      $env:ANDROID_SDK_ROOT = $env:ANDROID_HOME

# 5) HarmonyOS（鸿蒙端必需）
#    下载 DevEco Studio：https://developer.harmonyos.com/cn/develop/deveco-studio
#    首次启动装：HarmonyOS SDK + Command Line Tools + ohpm
#    配置：将 ohpm、hvigorw 加入 PATH

# 6) JDK 21（沙盒已有；本机若未装）
winget install Microsoft.OpenJDK.21
```

### B. macOS 开发机（覆盖 iOS / macOS 端）

```bash
# Xcode（含 Command Line Tools）
xcode-select --install
# 从 App Store 安装 Xcode 并打开一次以同意许可

# CocoaPods（RN iOS 原生依赖）
sudo gem install cocoapods

# 若也在 macOS 上做 Tauri，需要 Rust
brew install rustup && rustup-init

# 若也在 macOS 上做 Android，装 Android SDK/NDK（同 A.4）
```

### C. 各端构建验证（装完上述 SDK 后）

```bash
# Tauri 桌面端（Windows）
# 注意是 "tauri build"（走 package.json 的 "tauri": "tauri"），没有 "tauri:build" 这个脚本
cd clients/manju_tauri && npm run tauri build      # 产出 msi/exe

# RN Android —— RN CLI 没有 build-android 子命令，走 Gradle
cd clients/manju_rn/android && ./gradlew assembleRelease
# 产物：android/app/build/outputs/apk/release/app-release.apk

# RN iOS（macOS）
cd clients/manju_rn/ios && pod install && cd .. && npx react-native run-ios --configuration Release

# RN 鸿蒙（需 DevEco + ohpm）
cd clients/manju_rn/harmony && ohpm install && hvigorw assembleApp

# Flutter 各端（SDK 已装，补平台 SDK 后即可）
cd clients/manju_flutter
flutter build windows --release                                  # Windows 桌面（需 MSVC）
flutter build linux --release                                    # Linux（需 clang/cmake/ninja + gtk）
flutter build macos --release                                    # macOS（需 macOS 主机）
flutter build apk --release                                      # Android（需 Android SDK）
flutter build ipa --release                                      # iOS（需 macOS + Xcode）
flutter build hap --release --dart-define=MANJU_PLATFORM=harmonyos  # 鸿蒙（需 OHOS 版 Flutter）

# makers Web（纯静态导出，无 build 脚本）
cd makers && node scripts/smoke.mjs
```

> ⚠️ **本节曾有多处命令与仓库现状不符，已逐条订正**：
> | 原写法 | 问题 | 订正后 |
> |---|---|---|
> | `npm run tauri:build` | `clients/manju_tauri/package.json` 的 scripts 只有 `dev/build/preview/tauri`，没有 `tauri:build` | `npm run tauri build` |
> | `npx react-native build-android --mode release` | RN CLI 无此子命令；package.json 也无对应 script | `cd android && ./gradlew assembleRelease` |
> | `flutter build ohos` | 不是有效命令，标准 Flutter 用、且需 community OHOS 分支 | `flutter build hap --dart-define=MANJU_PLATFORM=harmonyos` |
> | `flutter build apk/ios/windows`（无 `--release`） | 与其它文档样例不一致，易打出非 Release 产物 | 统一补 `--release` |
> | 清单只列 windows/android/ios/ohos | 项目宣称 6 端，漏了 linux / macos | 已补齐 |
> | `cd makers && npm run build` | `makers/package.json` **没有任何 scripts** | 改为 `node scripts/smoke.mjs` |
>
> 补充说明：`clients/manju_flutter/pubspec.yaml` 目前**未配置 `dev_dependencies: msix`**，
> 因此 `scripts/build_all.ps1` 的 MSIX 打包会失败并降级为 `zip`。

---

## 五、终态验证清单

| 检查 | 命令 | 期望 |
|---|---|---|
| Python 后端 | `python -c "import fastapi,uvicorn,sqlalchemy,pydantic_settings,cryptography,requests"` | 无报错 |
| Tauri 编译 | `cargo --version` | 显示版本 |
| RN 安卓 | `sdkmanager --list` / `adb --version` | 列出 SDK / 版本 |
| RN iOS | `pod --version` + `xcodebuild -version` | 版本 |
| 鸿蒙 | `ohpm -v` + `hvigorw -v` | 版本 |
| Flutter | `flutter --version` | 3.47.5 + Dart 3.x |

---

## 六、备注

- 沙盒内已完成的 Python/Node/Flutter 安装均使用隔离运行时，不影响本机全局环境。
- 下载残留：`C:\Users\addk1\flutter_windows.zip`（1.8GB 安装包，解压成功后可手动删除释放空间）。
- 沙盒不能替代本机编译：系统级/设备平台 SDK（Rust、MSVC、Android、Xcode、HarmonyOS）必须在目标构建机器安装后才能产出各端安装包。
