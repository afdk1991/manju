# 构建与发布全流程

本文档覆盖：各端构建 → 代码签名 → 生成 OTA 清单 → 发布上线。
OTA 协议细节见 [`ota-integration.md`](./ota-integration.md)，协议完整定义见 [`spec/ota-protocol.v1.md`](../spec/ota-protocol.v1.md)。

---

## 一、总览

```
源码
  ↓  ① 构建（scripts/build_all.ps1 或单平台命令）
各平台产物（msix / dmg / AppImage / apk / ipa / hap）
  ↓  ② 签名（各平台证书，见第三节对照表）
已签名产物
  ↓  ③ scripts/ota_manifest.py 计算 sha256 + Ed25519 签名
OTA 发布清单
  ↓  ④ POST /api/v1/admin/releases
客户端检测到更新 → 下载 → 校验 → 安装
```

---

## 二、构建

### 2.1 一键构建（推荐）

```powershell
cd D:\网站全栈项目\项目007
.\scripts\build_all.ps1 -Version 1.1.0 -BuildNumber 110 -Channel stable
```

脚本按平台逐个尝试，**缺少工具链时优雅跳过而不是崩溃**，最后打印
`已构建 / 已跳过 / 已失败` 三个清单。

常用参数：

| 参数 | 说明 |
|---|---|
| `-Version` | 语义化版本，如 `1.1.0` |
| `-BuildNumber` | 构建号，**必须单调递增** |
| `-Channel` | `stable` / `beta` / `nightly` |
| `-SkipTests` | 跳过测试 |
| `-ApiBase` | 打包进客户端的后端地址 |

可用函数（也可单独调用）：`Build-Flutter`、`Build-Android`、`Build-Windows`、
`Build-Linux`、`Build-MacOS`、`Build-IOS`、`Build-HarmonyOS`

### 2.2 单平台命令

| 平台 | 命令 | 必需工具链 |
|---|---|---|
| Windows | `flutter build windows --release` | Flutter + **Visual Studio 2022** |
| Linux | `flutter build linux --release` | Flutter + clang / cmake / ninja |
| macOS | `flutter build macos --release` | **macOS 主机** + Xcode |
| iOS | `flutter build ipa` | **macOS 主机** + Xcode + 开发者账号 |
| Android | `flutter build apk --release` | Android SDK + JDK 21 |
| HarmonyOS | `flutter build hap` | DevEco Studio + **Flutter OHOS 分支** |

> 鸿蒙端必须显式指定平台，因为 `dart:io` 在鸿蒙上会把 `Platform.isAndroid` 报告为 true：
> ```bash
> flutter build hap --dart-define=MANJU_PLATFORM=harmonyos
> ```

### 2.3 构建前准备

```bash
# 首次：生成 Ed25519 密钥对（公钥会内置进客户端）
python scripts/gen_keypair.py
```

Flutter 命令建议带上国内镜像：

```bash
export PUB_HOSTED_URL=https://pub.flutter-io.cn
export FLUTTER_STORAGE_BASE_URL=https://storage.flutter-io.cn
export PUB_CACHE=D:/sdks/pub-cache
```

---

## 三、签名要求对照表

**签名是 OTA 自动安装能否成功的前提**，各平台要求不同：

| 平台 | 签名要求 | 不做会怎样 | 备注 |
|---|---|---|---|
| **Windows** | MSIX 需代码签名证书（可选但强烈建议） | SmartScreen 警告，部分环境拦截 | MSIX 免管理员权限，自更新体验最好 |
| **macOS** | **必须**：Developer ID 签名 + 公证（notarize） | Gatekeeper 直接拦截，无法打开 | 不签名的 dmg 在 macOS 上基本不可用 |
| **Linux** | 通常不需要 | — | AppImage 建议 GPG 签名便于校验 |
| **Android** | **必须**：keystore 签名 | 无法安装/覆盖升级 | 换 keystore 等于换应用，用户需卸载重装 |
| **iOS** | **必须**：Apple 证书 + Provisioning Profile | 无法安装 | 只能通过 App Store / TestFlight 分发 |
| **HarmonyOS** | **必须**：DevEco 证书 + Profile | 无法安装 | 只能通过华为应用市场分发 |

> Tauri 端特别注意：Tauri 自带的 updater **强制要求产物签名**，
> 未签名时需在 `tauri.conf.json` 开启 `dangerousInsecureTransportProtocol`，
> 或改用"自定义下载 + 手动安装"流程。具体实现见 `clients/manju_tauri/src/updater/`。

---

## 四、发布 OTA 更新

### 4.1 生成并推送清单

```bash
python scripts/ota_manifest.py \
  --platform windows --arch x86_64 --channel stable \
  --version 1.1.0 --build 110 \
  --file ./dist/manju-1.1.0-win-x64.msix \
  --notes-zh "修复播放闪退" --notes-en "Fix crash" \
  --min-supported-version 1.0.0 \
  --rollout 10 \
  --api "${OTA_API:-http://localhost:8000}" \
  --admin-key "$OTA_ADMIN_KEY"
```

> ⚠️ `OTA_API` 原先硬编码为 EdgeOne **预览域名** `manju-drama-hub-tkwcxlaw.edgeone.cool`，
> 该域名约 3 小时过期（实测已返回 401，见 [`blockers.md`](./blockers.md) §2.1）。
> 现改为环境变量 + 本地联调兜底；正式域名绑定后只需 `export OTA_API=https://你的域名`。

脚本会自动：计算 `size`/`sha256` → 用 Ed25519 私钥签名 → POST 到 `/api/v1/admin/releases`。

**建议先跑 `--dry-run`** 检查生成的 JSON 再正式发布。

### 4.2 平台红线（脚本会强制拦截）

```bash
# iOS / HarmonyOS 必须给商店地址，否则拒绝发布（exit 2）
python scripts/ota_manifest.py \
  --platform ios --arch arm64 --channel stable \
  --version 1.1.0 --build 110 --no-artifact \
  --store-url "https://apps.apple.com/app/id0000000000" \
  --api "$OTA_API" --admin-key "$OTA_ADMIN_KEY"

# 鸿蒙同理
python scripts/ota_manifest.py \
  --platform harmonyos --arch arm64 --channel stable \
  --version 1.1.0 --build 110 --no-artifact \
  --store-url "https://appgallery.huawei.com/app/C000000" \
  --api "$OTA_API" --admin-key "$OTA_ADMIN_KEY"
```

> 这两条命令原先以 `...` 结尾，是**被截断的**——照抄会因为缺 `--api` / `--admin-key`
> 而连不上服务端。现已补成与 4.1 节 Windows 示例一致的完整形式。
> ⚠️ 其中的 `id0000000000` 与 `C000000` 是**占位 App ID**，上线前必须替换。

不给 `--store-url` 时脚本直接报错退出，并说明这是平台限制而非工具限制。

### 4.3 灰度放量

`--rollout 10` 表示只对 10% 设备可见（服务端按 `crc32(device_id) % 100` 分桶）。
观察 `ota/report` 上报的失败率，确认没问题再逐步放开到 100。

---

## 五、服务端部署

服务端有两种免费路线，任选其一：

### 5.1 EdgeOne Makers（已上线，推荐）

`makers/` 是适配好的无服务器工程：内容静态化上 CDN，Cloud Functions 处理动态接口，
Blob 存储做持久化。

```bash
cd makers
npm install
npx edgeone makers deploy . -n manju -t "$EDGEONE_API_TOKEN" --skip-ai-gateway-sync
```

或推送到 `main` 分支，` .github/workflows/deploy.yml` 会自动部署。

当前线上地址：`https://manju-drama-hub-tkwcxlaw.edgeone.cool`

> 注意：预览链接带 `eo_token` 且有有效期。要长期在线需在 EdgeOne 控制台绑定自定义域名。

### 5.2 自建免费服务器

`deploy/free-server/` 提供完整方案（FastAPI + SQLite + Caddy + systemd，无 Docker），
推荐跑在 **Oracle Cloud Always Free** 上（永久免费、大陆可直连）。

```bash
# 目标机器上
bash deploy/free-server/install_server.sh
```

详见 `deploy/free-server/README.md`。

---

## 六、发布检查清单

- [ ] `version` 递增，`build` 单调递增
- [ ] 产物已按平台要求签名
- [ ] `sha256` 与 `signature` 已生成（不要手工填）
- [ ] 先 `--dry-run` 核对 JSON 结构
- [ ] 先小比例灰度（`--rollout 10`）
- [ ] 客户端能正常拉到更新并安装
- [ ] 观察 `/api/v1/admin/reports/stats` 的上报统计
- [ ] iOS / HarmonyOS 已配置 `--store-url`
