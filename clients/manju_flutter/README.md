# 漫剧 Manju · Flutter 主干客户端

覆盖 **Android / iOS / HarmonyOS / Windows / macOS / Linux** 六端的漫剧视频客户端，
内置 OTA 自动更新（检测 → 下载 → 校验 → 安装）。

---

## 一、6 平台自动更新能力矩阵

| 平台 | 静默自更新 | 实现机制 | 前置条件 |
|---|:---:|---|---|
| **Windows** | ✅ | MSIX `Add-AppxPackage` / EXE `/VERYSILENT` | MSIX 免管理员权限 |
| **macOS** | ✅ | dmg 挂载替换 / pkg `installer` | 应用需签名，否则 Gatekeeper 拦截 |
| **Linux** | ✅ | AppImage 自替换 / deb+polkit | 安装目录可写 |
| **Android** | ⚠️ 有条件 | `PackageInstaller` 会话安装 | 需用户授予"未知来源"权限 |
| **iOS** | ❌ **禁止** | 仅跳转 App Store | Apple 平台限制 |
| **HarmonyOS** | ❌ **受限** | 仅跳转华为应用市场 | 鸿蒙无公开静默安装 API |

> iOS 与 HarmonyOS 端**不会**尝试下载安装包。客户端会展示更新说明并跳转商店，
> 同时上报 `event=unsupported` 以便统计转化率。

---

## 二、目录结构

```
lib/
├── main.dart                    入口
├── app.dart                     路由 + 启动检查更新
├── core/
│   ├── config/app_config.dart   配置与依赖注入（--dart-define）
│   ├── device/device_info.dart  平台/架构探测、设备标识
│   └── updater/                 ★ OTA 更新核心
│       ├── updater.dart         门面：检查→下载→校验→安装
│       ├── update_client.dart   HTTP 客户端（含 ETag/304）
│       ├── update_downloader.dart 下载器（含进度）
│       ├── verifier.dart        SHA256 + Ed25519 校验
│       ├── ota_public_key.dart  内置公钥
│       ├── models/ota_release.dart  协议模型
│       └── platform/            各平台安装实现
│           ├── desktop_updater.dart   Windows/macOS/Linux
│           ├── android_updater.dart   MethodChannel 调原生
│           └── store_updater.dart     iOS/鸿蒙跳商店
├── data/
│   ├── models/content.dart      剧集/分集/视频源/字幕
│   └── api/content_api.dart     内容接口
└── presentation/
    ├── pages/                   首页/详情/播放/搜索/设置
    └── widgets/                 卡片、更新弹窗

android/app/src/main/kotlin/com/manju/UpdaterPlugin.kt   Android 原生安装插件
ohos/entry/src/main/ets/updater/UpdaterPlugin.ets        鸿蒙端更新逻辑
```

---

## 三、运行

### 前置

- Flutter **3.47.4** / Dart **3.13.3**（`pubspec.yaml` 中 `environment.sdk: ^3.13.3`）
- 后端服务已启动（默认 `http://localhost:8000`）

### 启动

```bash
cd clients/manju_flutter
flutter pub get

# 各端运行
flutter run -d windows
flutter run -d linux
flutter run -d android
flutter run -d macos     # 需 macOS 主机
flutter run -d ios       # 需 macOS 主机 + Xcode
```

### 指定后端地址与通道

```bash
flutter run --dart-define=MANJU_API_BASE=https://api.example.com \
            --dart-define=MANJU_CHANNEL=stable
```

| dart-define | 默认值 | 说明 |
|---|---|---|
| `MANJU_API_BASE` | `http://localhost:8000` | 内容中台 + OTA 服务地址 |
| `MANJU_CHANNEL` | `stable` | 发布通道：stable / beta / nightly |
| `MANJU_PLATFORM` | 自动探测 | **仅鸿蒙端需显式设为 `harmonyos`** |

---

## 四、构建

| 平台 | 命令 | 需要的工具链 |
|---|---|---|
| Windows | `flutter build windows --release` | Visual Studio 2022（MSVC） |
| Linux | `flutter build linux --release` | clang / cmake / ninja |
| macOS | `flutter build macos --release` | macOS + Xcode |
| iOS | `flutter build ipa` | macOS + Xcode + 开发者账号 |
| Android | `flutter build apk --release` | Android SDK + JDK |
| HarmonyOS | 见下节 | DevEco Studio + Flutter OHOS 分支 |

---

## 五、HarmonyOS 特别说明

**标准 Flutter SDK 无法直接构建鸿蒙端。** 鸿蒙需要使用社区维护的
[flutter_flutter](https://gitee.com/openharmony-sig/flutter_flutter) OHOS 分支。

本仓库的 `ohos/` 目录提供了鸿蒙端的工程骨架与更新逻辑（ArkTS），
需要在 DevEco Studio 中配合 OHOS 版 Flutter 引擎使用：

```bash
# 鸿蒙端需显式指定平台，因为 dart:io 在鸿蒙上会将 Platform.isAndroid 报告为 true
flutter build hap --dart-define=MANJU_PLATFORM=harmonyos
```

`ohos/entry/src/main/ets/updater/UpdaterPlugin.ets` 中的更新逻辑
**只做商店跳转**，不实现任何本地安装——这是鸿蒙的合规要求。

---

## 六、更新流程时序

```
App 启动
  ↓
Updater.checkForUpdate()
  ↓
GET /api/v1/ota/check
  ↓
┌── 204 / 304 → 无更新，结束
├── 409       → 降级拦截，结束
└── 200       → 有更新
      ↓
  policy = silent ?  → 后台静默安装（仅桌面端）
  policy = forced ?  → 强制弹窗（不可关闭）
  policy = suggest ? → 可关闭弹窗
      ↓
  iOS / HarmonyOS ?  → 跳转商店，上报 unsupported
      ↓
  下载到临时目录（进度回调）
      ↓
  校验 SHA256  ← 失败则删文件并中止
      ↓
  校验 Ed25519 签名  ← 失败则删文件并中止
      ↓
  调用平台安装器
      ↓
  上报 installed → 重启
```

---

## 七、已知限制

1. **播放器**：使用官方 `video_player`，桌面端（Windows/Linux）支持有限。
   生产建议替换为 `media_kit`，只需改 `lib/presentation/pages/player_page.dart`，
   其余层通过 `Episode.playableUrl` 解耦。
2. **Windows 绿色版（zip/tar.gz）自更新**需要额外的"启动器 + 版本号目录"机制，
   当前仅给出提示，未实现——因为 Windows 上正在运行的文件被占用，无法直接覆盖。
3. **macOS `.pkg` 安装**可能需要管理员密码，未授权时会失败并提示用户手动安装。
4. 本机为 Windows 环境，**iOS / macOS / HarmonyOS 的完整构建需要在对应平台机器上完成**。

---

## 八、测试

```bash
flutter test
```

测试覆盖：
- OTA 协议模型解析（含 iOS 商店兜底、平台能力矩阵）
- SHA256 计算与篡改识别
- 签名缺失时的拒绝行为
- Ed25519 签名正确/错误两种情况
- 内置公钥格式校验
