# 漫剧 · 鸿蒙端（ArkTS）

本目录是**漫剧**在 HarmonyOS 上的独立实现，使用 ArkTS + ArkUI 编写，
**与 `clients/manju_rn/` 下的 React Native 代码是两套完全独立的代码**，
通过同一份 API / OTA 契约（`spec/openapi.yaml`、`spec/ota-protocol.v1.md`）保持一致。

## 与 RN 端的关系

- RN 端运行于 **Android / iOS**；
- 鸿蒙端（本目录）运行于 **HarmonyOS**；
- 二者不共享任何源码，仅共享：
  - 内容接口字段（`spec/openapi.yaml`）；
  - OTA 协议字段与枚举（`spec/ota-protocol.v1.md`）；
  - Ed25519 验签逻辑（本端未做下载安装，仅做跳转前的版本比对）。

## 如何运行 / 构建

1. 安装 **DevEco Studio**（需 HarmonyOS SDK 5.0 / API 12 及以上）。
2. 用 DevEco Studio 打开本 `harmony/` 目录（而非上级 `manju_rn/`）。
3. 首次打开执行 `File → Sync and Refresh Project` 拉取依赖。
4. 连接真机或启动模拟器，点击 **Run 'entry'** 即可安装运行。
5. 构建 HAP：`Build → Build Haps(s) / APP(s) → Build APP(s)`。

> 注意：本目录不含 `node_modules`、不含 RN 工程文件，不能放入 RN 工具链构建。

## 平台红线（重要）

**鸿蒙不支持应用内静默安装。** 没有向第三方应用开放的安装 API，
唯一合规的分发路径是华为应用市场（AppGallery）或企业 MDM 下发。
因此本端的"自动更新"实现为：

> 检测更新 → 展示说明 → 用户确认 → 跳转华为应用市场（`store://appgallery/detail?id=Cxxxx` 或 `https://appgallery.huawei.com/app/Cxxxx`）。

相关逻辑见 `entry/src/main/ets/updater/Updater.ets`：
- `readAppVersion()`：用 `@ohos.bundle`（`bundleManager`）读取版本；
- `openAppGallery()`：仅跳转商店，绝不下载/安装；
- `checkForUpdate()`：调用 `/api/v1/ota/check`，命中更新后引导跳转。

若服务端下发产物（hap），**请忽略**，不要尝试在客户端安装。

## 目录结构

```
harmony/
├── build-profile.json5
├── oh-package.json5
└── entry/
    └── src/main/
        ├── ets/
        │   ├── entryability/EntryAbility.ets
        │   ├── pages/Index.ets
        │   └── updater/Updater.ets
        ├── module.json5
        └── resources/base/profile/main_pages.json
```
