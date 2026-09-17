# 漫剧 Manju · 全平台客户端

> 一个获取**漫剧视频**（漫画改编短剧 / 竖屏短剧）的跨平台应用。
> 覆盖 **Android / iOS / HarmonyOS / Windows / macOS / Linux** 六大平台，
> 内置 **OTA 自动更新**：客户端检测到新版本后自动下载、校验、安装。

---

## 一、6 平台自动更新能力矩阵（先读这个）

这是本项目最容易被误解的地方。所谓"自动更新安装"，**并不是 6 个平台都能静默安装**——这是操作系统级别的限制，任何技术手段都绕不过去。本项目采取"能装的静默装，不能装的优雅降级"策略：

| 平台 | 静默自更新 | 实际机制 | `policy` 支持 | 说明 |
|---|:---:|---|---|---|
| **Windows** | ✅ | 下载 → SHA256 + Ed25519 校验 → MSIX `PackageManager` / EXE `/VERYSILENT` → 重启拉起 | `suggest` / `forced` / `silent` | 最完整，可真正做到无感更新 |
| **macOS** | ✅ | 下载 `.dmg`/`.pkg` → 安装 → 重启；生产建议接 Sparkle 2 | `suggest` / `forced` / `silent` | 需开发者签名，否则 Gatekeeper 拦截 |
| **Linux** | ✅ | AppImage 自替换 / `.deb` + polkit / tar.gz 自替换 | `suggest` / `forced` / `silent` | 依赖安装目录写权限 |
| **Android** | ⚠️ 有条件 | 下载 APK → `PackageInstaller` 会话安装 | `suggest` / `forced` | 需 `REQUEST_INSTALL_PACKAGES`，首次须用户授权"允许来自此来源的应用" |
| **iOS** | ❌ **禁止** | 只能跳转 App Store / TestFlight | 仅跳转 `store_fallback.url` | **Apple 禁止侧载静默安装**，违反会被下架 |
| **HarmonyOS** | ❌ **受限** | 只能跳转华为应用市场或走 MDM 分发 | 仅跳转 `store_fallback.url` | 鸿蒙无公开的静默安装 API |

> **红线**：本项目的 iOS 与 HarmonyOS 客户端**一律不声称支持"自动下载安装"**。
> 正确行为是：检测到更新 → 展示更新说明 → 用户确认 → 跳转商店 → 上报 `event=unsupported` 以便统计转化率。
> 服务端对这两个平台**强制**在响应中返回 `store_fallback`，客户端**必须**走跳转分支。

---

## 二、技术栈

用户需求是 6 端全覆盖，因此采用**一套主干 + 两套备选**的多实现策略，三者通过同一份 API 契约保持行为一致。

| 层次 | 方案 | 覆盖范围 | 状态 |
|---|---|---|---|
| **主干** | **Flutter 3.47 / Dart 3.13** | 6 端全覆（鸿蒙需 Flutter OHOS 分支） | 主力 |
| 备选 A | **Tauri 2**（Rust + React） | Windows / macOS / Linux 桌面三端 | 骨架 |
| 备选 B | **React Native** + **ArkTS** | Android / iOS + HarmonyOS | 骨架 |
| 后端 | **FastAPI** + SQLAlchemy + Pydantic | 内容中台 + OTA 服务 + 运营后台 | 主力 |

**为什么主干选 Flutter**：唯一能用一套代码同时覆盖 Android/iOS/Windows/macOS/Linux 的方案，鸿蒙侧有社区 `flutter_flutter` OHOS 分支可适配。Tauri 与 RN 作为特定场景（极致包体 / 原生生态）的退路。

---

## 三、目录结构

```
项目007/
├── spec/                        # ★ 平台无关契约（单一事实来源）
│   ├── ota-protocol.v1.md       #   OTA 更新协议 v1
│   └── openapi.yaml             #   内容中台 API (OpenAPI 3.1)
│
├── server/                      # FastAPI 后端
│   ├── app/                     #   内容中台 + OTA 服务
│   ├── admin/                   #   运营后台（轻量 HTML）
│   └── seed/                    #   演示数据
│
├── clients/
│   ├── manju_flutter/           # ★ 主干客户端（6 端）
│   ├── manju_tauri/             # 备选：Tauri 2 桌面三端
│   └── manju_rn/                # 备选：RN 移动双端 + harmony/ ArkTS
│
├── scripts/                     # 打包、签名、OTA 发布、冒烟测试
├── .github/workflows/           # CI/CD 构建矩阵与发布流水线
└── docs/                        # 架构、构建、接入文档
```

---

## 四、OTA 更新协议（核心契约）

完整定义见 [`spec/ota-protocol.v1.md`](spec/ota-protocol.v1.md)，摘要：

```http
GET /api/v1/ota/check?platform=windows&arch=x86_64&channel=stable
    &version=1.2.0&build=120&device_id=xxxx
```

```json
{
  "has_update": true,
  "policy": "forced",
  "release": {
    "version": "1.3.0",
    "build": 130,
    "min_supported_version": "1.1.0",
    "notes_i18n": { "zh-CN": "- 新增倍速记忆\n- 修复首屏卡顿" },
    "artifact": {
      "type": "msix",
      "url": "https://cdn.example.com/app.msix",
      "size": 48234567,
      "sha256": "9f86d081...",
      "signature": "ed25519:MEUCIQDx..."
    }
  },
  "store_fallback": { "enabled": true, "url": "https://...", "reason": "platform_restricted" }
}
```

**安全要求（不可省略）**：
1. 全程 HTTPS
2. 客户端**必须**校验 `sha256`，不匹配立即中止
3. 生产环境**必须**校验 Ed25519 签名，公钥编译进客户端
4. 版本单调递增，拒绝降级（返回 `409 rollback_attempt`）

---

## 五、快速开始

### 后端（内容中台 + OTA 服务）

```bash
cd server
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
# 接口文档： http://localhost:8000/docs
```

### Flutter 主干客户端

```bash
cd clients/manju_flutter
flutter pub get
flutter run -d windows      # 也可 -d chrome / -d android / -d macos / -d linux
```

### 发布一个 OTA 版本

```bash
python scripts/gen_keypair.py                 # 首次：生成 Ed25519 密钥对
python scripts/ota_manifest.py \
    --platform windows --arch x86_64 --channel stable \
    --version 1.1.0 --build 110 \
    --file ./dist/manju-1.1.0-win-x64.msix \
    --api http://localhost:8000 --admin-key $OTA_ADMIN_KEY
```

> iOS / HarmonyOS 必须额外传 `--store-url`，否则脚本拒绝发布。

---

## 六、各端构建前置条件

| 平台 | 必需工具链 | 本机（Windows）可用性 |
|---|---|---|
| Windows | Flutter + **Visual Studio 2022**（MSVC） | ⚠️ 需安装 VS2022 |
| Linux | Flutter + clang / cmake / ninja | ⚠️ 需 WSL 或 Linux 机器 |
| macOS / iOS | **macOS 主机** + Xcode | ❌ 需 Mac 构建机 |
| Android | Android SDK + JDK 21 | ⚠️ 需安装 Android SDK |
| HarmonyOS | DevEco Studio + **Flutter OHOS 分支** | ❌ 需 Linux/macOS + DevEco |

> 本机当前为 Windows，已具备 JDK 21 / Node 22 / Python 3.13 / Flutter 3.47。

---

## 七、内容合规说明

本项目**不包含任何爬取第三方站点或破解付费内容的代码**。内容通过三种合规来源接入（可在服务端用 `CONTENT_SOURCE` 环境变量切换）：

1. `internal` — 自建 CMS，运营上传自有/已授权内容（默认）
2. `user_defined` — 用户自行填写的接口地址，服务端按契约校验后代理转发
3. `third_party` — 对接有授权的第三方开放平台 API，需自行配置凭证

使用者需自行确保所分发内容已获得合法授权。
