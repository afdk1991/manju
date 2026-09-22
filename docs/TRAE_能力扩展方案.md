# TRAE 能力扩展方案 · 漫剧 Manju（项目007）

> 生成时间：2026-09-20
> 依据：本仓库**全部自研 `.md` 文件**（逐文件完整读取，未摘要、未截断）+ 本机 TRAE CN 实际配置的实测探测
> 目标：把文档里的「事实、红线、阻塞项」转成 TRAE 可执行的能力配置，并指出文档与现实的偏差

---

## 0. 遍历范围与口径

### 0.1 实际读取清单（20 个，按路径排序）

| # | 路径 | 大小 | 性质 | 状态 |
|---|---|---:|---|---|
| 1 | `README.md` | 7,017 | 项目总览 / 六端矩阵 | ✅ 全读 |
| 2 | `spec/ota-protocol.v1.md` | 5,901 | **契约唯一真源** | ✅ 全读 |
| 3 | `docs/SDK_状态.md` | 8,194 | 工具链状态 | ✅ 全读 · **⚠️ 已过期** |
| 4 | `docs/blockers.md` | 14,701 | 阻塞项清单 | ✅ 全读 · **⚠️ 部分过期** |
| 5 | `docs/build-release.md` | 6,605 | 构建与发布流程 | ✅ 全读 |
| 6 | `docs/ci-setup.md` | 7,405 | GitHub Actions + Secrets | ✅ 全读 |
| 7 | `docs/ota-integration.md` | 4,585 | 客户端 OTA 接入指引 | ✅ 全读 |
| 8 | `docs/signing-setup.md` | 8,796 | 四端签名配置 | ✅ 全读 |
| 9 | `server/README.md` | 6,830 | FastAPI 后端 | ✅ 全读 |
| 10 | `makers/README.md` | 7,271 | EdgeOne Makers 部署 | ✅ 全读 |
| 11 | `deploy/free-server/README.md` | 8,513 | 免费服务器部署 | ✅ 全读 |
| 12 | `clients/manju_flutter/README.md` | 6,526 | Flutter 六端 | ✅ 全读 |
| 13 | `clients/manju_flutter/ios/.../LaunchImage.imageset/README.md` | 340 | Xcode 模板说明 | ✅ 全读（无项目信息） |
| 14 | `clients/manju_rn/README.md` | 7,208 | RN 双端 + 鸿蒙 | ✅ 全读 · **⚠️ 版本号过期** |
| 15 | `clients/manju_rn/harmony/README.md` | 2,372 | 鸿蒙端 | ✅ 全读 |
| 16 | `clients/manju_tauri/README.md` | 8,505 | Tauri 桌面三端 | ✅ 全读 · **⚠️ 前置说明过期** |
| 17 | `.workbuddy/memory/2026-09-16.md` | 3,107 | 工作日志 | ✅ 全读 |
| 18 | `.workbuddy/memory/2026-09-17.md` | 2,564 | 工作日志 | ✅ 全读 |
| 19 | `.workbuddy/memory/2026-09-20.md` | 16,149 | 工作日志 | ✅ 全读 |
| 20 | `.workbuddy/memory/2026-09-21.md` | 1,372 | 工作日志 | ✅ 全读 |

**已排除**：`clients/manju_rn/node_modules/**`、`clients/manju_tauri/node_modules/**`、`makers/node_modules/**` 下的第三方 README/CHANGELOG（约 300+ 个，与本项目能力扩展无关）。

### 0.2 本机 TRAE CN 实测配置（不是推测，是读配置文件得到的）

| 探测项 | 实测结果 |
|---|---|
| TRAE 安装 | ✅ `C:\Users\addk1\.trae-cn`（TRAE CN），另有 `AppData\Roaming\Trae CN` |
| 已启用插件 | **103 个**（`plugin-config.json`，全部 `user_enabled: true`，无禁用项） |
| 已安装 Skills | **约 90 个**（`~/.trae-cn/skills/`），另有内置 `builtin_skills/` 4 个 |
| 项目级 MCP | **仅 2 个**：`solo_agent_lite`（集成执行）、`mcp_plugin_...pkulaw`（北大法宝法律库） |
| 项目 MCP 目录 | `~/.trae-cn/mcps/s_项目007-a22bc8b9/` —— **本项目尚未挂任何开发/部署类 MCP** |

---

## 1. 按文件路径归类的文档结论 + TRAE 介入点

### 1.1 契约层 `spec/`

**`spec/ota-protocol.v1.md`** — 六端共用的唯一真源

| 关键结论 | 内容 |
|---|---|
| 端点 | `GET /api/v1/ota/check`、`POST /api/v1/ota/report`、`GET /api/v1/ota/public-key` |
| 签名消息格式 | `{version}|{build}|{sha256小写}|{url}`（**规范化消息，逐字节一致**） |
| 错误码 | 400 / 404 / 409 / 429 |
| 平台红线 | iOS / HarmonyOS 强制 `store_fallback`，禁止下载安装 |
| 灰度 | crc32 设备分桶；`min_supported_version` → `policy=forced` |

**TRAE 介入点**
- 🔴 **把本文件写进 TRAE 项目规则**（`.trae/rules/`），否则模型在写任何一端代码时都可能违反签名格式或平台红线 —— 本项目已发生过一次「轮换公钥时只改 base64 没改 bytes 数组」的事故，根因就是契约没被强制加载。
- 用 **`spec-to-implementation`** 技能：以 spec 为输入驱动四端实现，而不是口述需求。
- 用 **`TRAE-security-review`**（内置）：对 `verifier.dart` / `verify.ts` / `Updater.ets` 三处验签实现做强制复核。

---

### 1.2 根目录 `README.md`

| 关键结论 | 内容 |
|---|---|
| 六端矩阵 | Android / iOS / HarmonyOS / Windows / macOS / Linux |
| 技术栈 | Flutter 主干 + Tauri 2 备选 + RN/ArkTS 备选 |
| 内容合规 | `internal` / `user_defined` / `third_party` 三档 |
| 构建前置表 | 列了各端需要的 SDK（**已被 `docs/SDK_状态.md` 覆盖，且已过期**） |

**TRAE 介入点**：用 **`context-pack`** 插件把 README + spec 打包为项目级上下文；`compliance-review` / `personal-data-protection` 插件核对三档内容源的合规表述。

---

### 1.3 `docs/`

#### `docs/SDK_状态.md` —— 🔴 **已过期，与本轮实际状态冲突**

| 文档说法 | 实测状态（2026-09-20） | 证据 |
|---|---|---|
| Rust / cargo 未安装 | ✅ 已装 | `D:\toolchain\rust` |
| MSVC / VS2022 未安装 | ✅ 已装 | `D:\toolchain\VS2022`（MSVC 14.44） |
| Android SDK 未安装 | ✅ 已装 | `D:\toolchain\android-sdk`（API 34/36） |
| Gradle 未安装 | ✅ 已装 | `D:\toolchain\gradle-8.9` |
| Flutter 未安装 | ✅ 已装 | `D:\toolchain\flutter`（3.47.5 / Dart 3.13.4） |
| Linux 需真机或云主机 | ✅ 已用 WSL Ubuntu 22.04 构建成功 | `clients/manju_flutter/build/linux/x64/release/bundle/manju` |

> **这是全仓最需要立刻修的文档**：它当前会让 TRAE 得出「四端都构建不了」的错误结论，从而拒绝所有构建类任务。

#### `docs/blockers.md` —— 质量最高的一份，但第 0 节已过期

| 章节 | 结论 |
|---|---|
| §0 工具链探测 | **全部 ❌ → 已过期**（同上表） |
| §1 签名证书 | macOS Developer ID 全缺（🔴）；Android keystore 已统一并接 `keystore.properties`（🟢 已实现 / ⏳ 未真机验证）；Windows 无证书（🔴）；鸿蒙无证书（🔴） |
| §2 分发域名 | 预览域名 `manju-drama-hub-tkwcxlaw.edgeone.cool` **已过期返回 401**；正式域名未绑定（需 ICP 备案） |
| §2.3 API 基址不一致 | **6 处**：RN `src/api/client.ts:18`、Tauri `src/api/client.ts:23`、Flutter `app_config.dart:34`、Flutter ohos `Index.ets:37`、Flutter ohos `UpdaterPlugin.ets:153`、RN harmony `Index.ets:9` |
| §3 图标 | Tauri 5 项齐全（ICNS 无 1024，Mac App Store 上架前需重做）；其余四端已由 `scripts/gen_icons_all.py` 补齐 |
| §4 真机验证 | **四端均未在任何真机/模拟器运行过**；已验证项只有：后端冒烟 19/19、Tauri `npm run build` 退出码 0、RN `tsc --noEmit` 退出码 0 |
| §5 额外问题 | ① OTA 私钥曾推送 GitHub（🟢 已轮换 + filter-repo 清史）② Tauri fetch 白名单已修 ③ Tauri 官方 updater 与 OTA v1 签名对象不兼容（🟡 走自研路径 B）④ **鸿蒙端无 SHA256/Ed25519 验签实现**（🔴 未修）⑤ 基址不一致 ⑥ macOS `CODE_SIGN_STYLE` Automatic/Manual 混用 |
| §6 行动清单 | P0：更新两处 OTA 私钥 Secret、备份 keystore；P1：Apple 开发者、EdgeOne 自定义域名；P2：SDK / Rust / DevEco / Windows 证书 |

**TRAE 介入点**
- `docs/blockers.md` 应作为 TRAE 的**常驻上下文**（`#File` 引用或写进项目规则），让每次任务开始时先校验阻塞状态，避免重复承诺「可以打包」。
- §6 的 P0/P1 用 **`progress-management-workbench`** 或 **`linear`** 插件转成可追踪任务；`nullcost-catalog` 可做零成本方案盘点。
- §5.4 鸿蒙验签缺口 → 交给 **`crossplatform-service-migration`** 技能 + `context7`（查 `@ohos.security.cryptoFramework` 是否支持 Ed25519）。

#### `docs/build-release.md`
- 构建入口 `scripts/build_all.ps1`；发布 `scripts/ota_manifest.py`
- **TRAE 介入点**：`gh-cli` 技能 + `github` 插件串联「构建 → 签名 → 生成清单 → 推 Release」；`mcp-builder` 技能把 `ota_manifest.py` 包成 MCP 工具（见 §5.1）。

#### `docs/ci-setup.md`
- 需要 8 个 Secrets：`EDGEONE_API_TOKEN`、`OTA_ADMIN_KEY`、`ED25519_PRIVATE_KEY`、`ANDROID_KEYSTORE_*`（4 个）、`APPLE_*`
- **TRAE 介入点**：`github` 插件已启用 —— 可直接查仓库 Secrets 是否齐全（只列名字，不读值）；`circleci`、`gitlab` 插件为备选 CI。

#### `docs/ota-integration.md` / `docs/signing-setup.md`
- 安全清单（HTTPS、SHA256 必校、Ed25519 必校、失败删临时文件、拒绝降级）
- 密钥轮换记录：旧私钥曾进 GitHub，**已轮换**；新公钥 `f2obZdLFwhWJtuA/u/VW/EB1jAZ/UiZF/eEbxFJ0a3c=`
- **TRAE 介入点**：`security-best-practices` + 内置 `TRAE-security-review`；`git-commit` 技能配合 pre-commit 检查，防止私钥再次入库（**.gitignore 需再次核对**，见 §6）。

---

### 1.4 `clients/`

#### `clients/manju_flutter/README.md`
- 六端自动更新矩阵；`--dart-define=MANJU_API_BASE / MANJU_CHANNEL / MANJU_PLATFORM`
- 鸿蒙需 **OHOS 版 Flutter**（`flutter_flutter` 社区分支），标准 SDK 不行
- 已知限制：`video_player` 桌面端支持有限（建议换 `media_kit`）；Windows 绿色版自更新未实现
- **TRAE 介入点**：`react-native-skills` 不适用于此端；用 `local-screenshot-qa` / `screenshot` 技能做桌面端 UI 截屏比对；`frontend-design` 用于播放页视觉。

#### `clients/manju_rn/README.md` —— ⚠️ **版本号与安装状态过期**
| 文档说法 | 实测 |
|---|---|
| React Native **0.74** | `package.json` 实为 **0.87.1**（react 19.2.3） |
| 「本目录未执行 npm install」 | 09-21 日志：已装 **409 个包** |
| 鸿蒙 `harmony/` 为独立工程 | ✅ 与 `harmony/README.md` 一致 |

- **TRAE 介入点**：`react-native-skills` 技能；`expo` 插件**不适用**（本项目是裸 RN，文档明确非 Expo，别误启用）。

#### `clients/manju_rn/harmony/README.md`
- 需 DevEco Studio（HarmonyOS SDK 5.0 / API 12+）；打开 `harmony/` 而非上级目录
- 红线：只有 `openAppGallery()`，**绝不下载/安装**；若服务端下发 hap 请忽略
- **TRAE 介入点**：本机无 DevEco，TRAE 也只能做静态审查 → 用 `spec-to-implementation` 保证与 `ota-protocol.v1.md` 字段一致。

#### `clients/manju_tauri/README.md` —— ⚠️ **前置说明过期**
| 文档说法 | 实测 |
|---|---|
| 「交付机无 Rust 工具链」 | Rust 已装于 `D:\toolchain\rust` |
| 「未执行构建验证」 | `src-tauri/target/release/bundle/` **仍为空**（尚未构建） |
| `API_BASE` 在第 20 行 | 与 `blockers.md` 记的第 23 行**不一致**（需以文件为准） |

- 两条更新路径：A 官方 updater 插件 / B 自定义 OTA（**本项目默认 B**）
- **TRAE 介入点**：`electron` 技能（桌面端经验可迁移）、`chrome-devtools` + `browser` 插件调试 WebView 前端、`webapp-testing` 做前端自动化、`frontend-design` 优化 UI。

---

### 1.5 `server/` · `makers/` · `deploy/`

| 文件 | 关键结论 | TRAE 介入点 |
|---|---|---|
| `server/README.md` | FastAPI + SQLAlchemy + SQLite；`MANJU_*` 环境变量；三种内容源适配器（含 SSRF 防护） | `redis-development`（若后续换缓存）、`TRAE-debugger`（内置）、`data-analysis` 分析 OTA 上报 |
| `makers/README.md` | EdgeOne Makers：静态 JSON + 云函数 + Blob；需 `MANJU_ADMIN_KEY`、`MANJU_OTA_PRIVATE_KEY` | **`edgeone-pages` 连接器已连接（本会话）** → 最高优先级部署通道；TRAE 侧可用 `byted-bp-cdn-pagesdeploy` / `iga-pages` 技能作同类静态托管备选 |
| `deploy/free-server/README.md` | 首选 **Oracle Cloud Always Free**（ARM 4核/24G）；SSH 密钥已生成于 `C:\Users\addk1\.ssh\manju_oci`；部署随包上传 `keys/`（必须与客户端内置公钥一致） | `sealos` / `render` / `cloudflare` / `vefaas` 插件为托管备选；`weiyun`（微云）或 `baidu-netdisk` 存 keystore 异地备份 |

---

### 1.6 `.workbuddy/memory/`（工作日志）

| 文件 | 关键结论 |
|---|---|
| 09-16 | 契约先行；红线确立（`ota_manifest.py` 不给 store-url 就 exit 2）；Flutter 曾装 `D:\sdks\flutter` |
| 09-17 | 后端 19/19 冒烟；**重要经验**：`flutter test` 本机跑不通（WebSocket），改用 `dart test` + `package:test` → 7/7 |
| 09-20 | 密钥轮换 + filter-repo 清史 + 强推；图标补齐；blockers 生成 |
| 09-21 | Python/Node/Flutter 依赖装齐；**称 Rust/MSVC/Android SDK「沙盒无法安装」** → 与本轮 `D:\toolchain` 实际装好冲突 |

**TRAE 介入点**：`knowledge-capture` 技能把这类踩坑经验固化；`obsidian-cli` / `notion-cli` 可做长期知识库；`LlmWiki` 类能力（本会话为 `research-documentation`）建交叉索引。

---

## 2. 文档与现实的不一致（汇总，必须先修）

| # | 文件 | 文档说法 | 实际 | 严重度 |
|---|---|---|---|---|
| 1 | `docs/SDK_状态.md` | Rust / MSVC / Android SDK / Gradle / Flutter 全部未装 | 全部已装于 `D:\toolchain` | 🔴 会让 TRAE 误判不可构建 |
| 2 | `docs/SDK_状态.md` | Linux 需外部机器 | WSL Ubuntu 22.04 已重装，`flutter build linux --release` 已产出 | 🔴 |
| 3 | `docs/blockers.md` §0 | 工具链探测全 ❌ | 同上 | 🔴 |
| 4 | `clients/manju_rn/README.md` | RN 0.74、未 npm install | RN **0.87.1**、已装 409 包 | 🟡 |
| 5 | `clients/manju_tauri/README.md` | 「交付机无 Rust」、未构建验证 | Rust 已装；**但仍未构建**（target/bundle 空） | 🟡 |
| 6 | `README.md` / flutter README | Flutter 3.47.4 / Dart 3.13.3 | 实装 3.47.5 / Dart 3.13.4（满足 `^3.13.3`） | 🟢 无害 |
| 7 | `docs/blockers.md` §2.3 vs tauri README | API_BASE 在第 23 行 vs 第 20 行 | 需以文件为准 | 🟡 |
| 8 | 全部文档 | 未记录 Linux 产物 | `build/linux/x64/release/bundle/manju` 存在 | 🔴 首个真实产物未入档 |
| 9 | `dist/` | — | 仅 `fake-manju-1.1.0-win-x64.msix`（2KB 假包） | 🟡 勿误当产物 |

---

## 3. TRAE 可用能力总表

### 3.1 内置技能（`builtin_skills/`，无需安装）

| 技能 | 作用 | 本项目用途 |
|---|---|---|
| `TRAE-code-review` | 代码评审 | 四端更新器代码把关 |
| `TRAE-security-review` | 安全评审 | **验签链路、私钥防泄漏、SSRF 防护** |
| `TRAE-debugger` | 调试 | 后端 19/19 冒烟失败时定位 |
| `TRAE-generate-mini-app` | 小程序生成 | （本项目暂无小程序） |

### 3.2 已安装 Skills（挑与本项目的强相关项）

| 类别 | 技能 | 用途 | 启用方式 |
|---|---|---|---|
| 跨平台 | `crossplatform-service-migration` | 多端服务迁移 —— 与本项目六端同构 | 对话中按名调用 / 技能面板启用 |
| 移动端 | `react-native-skills` | RN 端 API 与常见坑 | 同上 |
| 桌面端 | `electron` | 桌面端打包/更新经验迁移到 Tauri | 同上 |
| **自建能力** | **`mcp-builder`** | **把 `scripts/*.py` 封装成 MCP Server** | 同上（见 §5.1） |
| 前端 | `frontend-design`、`frontend-skill`、`web-design-guidelines`、`react-best-practices` | Tauri React 前端与 Flutter 页面视觉 | 同上 |
| 测试 | `webapp-testing`、`local-screenshot-qa`、`screenshot`、`test-driven-development` | Tauri WebView 前端自动化 + 桌面端截屏比对 | 同上 |
| 质量 | `security-best-practices`、`brooks-lint`（插件） | 与内置 security-review 叠加 | 同上 |
| 工程方法 | `spec-to-implementation`、`writing-plans`、`executing-plans`、`brainstorming` | 以 `spec/` 驱动实现，避免口头需求漂移 | 同上 |
| 文档 | `research-documentation`、`doc-coauthoring`、`knowledge-capture`、`report-generator-skill` | 把本次方案与 blockers 固化 | 同上 |
| 部署 | `byted-bp-cdn-pagesdeploy`、`iga-pages` | 静态托管（makers/ 的同类通道） | 同上 |
| Git | `gh-cli`、`git-commit` | 仓库操作 + 提交规范（防私钥入库） | 同上 |
| 数据 | `data-analysis`、`chart-visualization`、`dashboard-page` | OTA 灰度/转化率可视化 | 同上 |
| 浏览器 | `agent-browser` | 页面抓取验证 | 同上 |
| 本地模型 | `local-txt2img`、`local-img2img`、`local-ocr`、`local-asr`、`local-tts`、`local-mineru` | 图标/素材生成、文档解析（离线） | 同上 |

### 3.3 已启用插件（103 个，挑强相关）

| 类别 | 插件 | 本项目用途 |
|---|---|---|
| 仓库/CI | **`github`**、`gitlab`、`gitee`、`circleci` | `docs/ci-setup.md` 的 Secrets 核对、workflow 维护、Release 发布 |
| 真机测试 | **`test-android-apps`** | Android APK 安装/自更新验证（blockers §4 ⏳） |
| macOS | `build-macos-apps` | macOS 端（仍需 Mac 硬件，见 §6） |
| 浏览器 | `chrome`、`browser`、`chrome-devtools` | Tauri WebView 前端调试 |
| 部署托管 | `cloudflare`、`sealos`、`render`、`vefaas`、`byted-supabase` | `deploy/free-server` 之外的托管通道 |
| 监控 | **`sentry`**、`langfuse` | OTA 上报事件（`unsupported` 转化率）接入监控 |
| 文档/库查询 | **`context7`** | **查 Flutter / Tauri / RN 真实 API**，防止 `DeviceInfo.supportedAbis()` 那类 API 幻觉复发 |
| 合规 | `compliance-review`、`personal-data-protection` | 三档内容源合规、匿名设备指纹无 PII |
| 协作/备份 | `wecom`、`lark`、`dingtalk`、`wemeet`、`notion`、`tencent-docs`、`weiyun` | 发布通知；**keystore / 私钥异地备份** |
| 项目推进 | `linear`、`progress-management-workbench`、`product-lifecycle-workbench`、`nullcost-catalog` | blockers §6 行动清单追踪 |
| 评审 | `coderabbit`、`staff-engineer-mode`、`superpowers`、`dev-skills`、`archcore`、`runtype-skills` | 四端代码评审与架构把关 |
| 内容生成 | `seedream`、`seedance`、`hyperframes`、`vidseeds`、`remotion`、`ecom-video-generation` | 漫剧宣传物料 / 占位封面 |
| 上下文 | **`context-pack`** | 把 spec + README + blockers 打包为项目上下文 |
| 其他 | `n8n-mcp-synta-codex`、`temporal` | 定时巡检（OTA 清单/证书到期提醒） |

### 3.4 MCP 连接器（当前缺口最大）

| 现状 | 说明 |
|---|---|
| 本项目已挂 | `solo_agent_lite`、`pkulaw`（法律，与本项目无关） |
| **应补** | ① 自建 `manju-ota`（见 §5.1）② `github`（若插件能力不足则补 MCP）③ `context7`（若插件未提供文档查询工具） |
| 启用方式 | TRAE CN → MCP 设置 → 添加 MCP Server（市场选择 / 手动粘贴 JSON）。**具体入口名称以你当前 TRAE CN 版本界面为准**（见 §6） |

### 3.5 其他扩展项（非插件/技能，但收益最高）

| 扩展项 | 作用 | 本项目落地建议 |
|---|---|---|
| **项目规则（Rules）** | 常驻系统提示，强制模型遵守 | 建 `.trae/rules/`，写入：平台红线（iOS/鸿蒙禁静默安装）、签名消息格式、绝不下发 `keys/*`、状态标记口径（已实现/已验证/待真机） |
| **文档上下文（`#Doc` / `#File`）** | 把 `spec/`、`docs/blockers.md` 加入上下文 | 每次构建/发布任务前强制引用 |
| **SOLO / 智能体模式** | 长任务自主执行 | 六端构建这类长链路任务 |
| **终端 + 脚本** | 直接跑 `scripts/` | `build_all.ps1`、`ota_manifest.py`、`smoke_test.py`、`gen_icons_all.py` |
| **自建 MCP**（`mcp-builder`） | 把仓库脚本变成模型可调用工具 | §5.1 |

---

## 4. 组合使用方案（按本项目 5 条工作流）

### W1 · 契约一致性守卫（最高优先级，直接对应已发生的事故）

```
[项目规则 .trae/rules/ota-contract.md]  ← 固化 spec/ota-protocol.v1.md 红线
        ↓ 每次写代码时自动生效
[context7] 查真实 API            ← 防 DeviceInfo.supportedAbis() 类幻觉
        ↓
[spec-to-implementation] 以 spec 驱动实现
        ↓
[TRAE-security-review] + [security-best-practices] 复核三处验签
        ↓
[dart test] / [npx tsc --noEmit] / [python smoke_test.py] 三端各自验证
```

**为什么必须这么做**：09-20 密钥轮换时只更新了 `kOtaPublicKeyBase64`，漏了同文件里的 `kOtaPublicKeyBytes` 数组，导致 `dart test` 7/8 失败。若客户端内置字节数组与 base64 不一致，生产环境会**全量验签失败**。规则 + 安全评审能拦住这类同源双写漏洞。

### W2 · 六端构建与真机验证

```
Windows : [flutter build windows]  ← D:\toolchain\flutter + VS2022 MSVC
Linux   : [flutter build linux]   ← WSL（已验证产出）
Android : [flutter build apk / gradlew assembleRelease] + [test-android-apps] 插件真机验证
macOS   : [build-macos-apps]      ← 🔴 仍需 Mac 硬件
iOS     : 🔴 仍需 Mac + Xcode
鸿蒙    : 🔴 仍需 DevEco Studio
Tauri   : [cargo tauri build]     ← Rust 已装，尚未执行
```

组合：`gh-cli` 拉分支 → 构建 → `webapp-testing`（Tauri 前端）→ `local-screenshot-qa`（桌面端 UI）→ `github` 插件开 PR → `coderabbit` 评审。

### W3 · 签名、分发与 OTA 发布

```
[signing-setup.md] → keystore / Developer ID / OTA 私钥
        ↓
[自建 manju-ota MCP] 生成并签名清单（封装 ota_manifest.py）
        ↓
[python smoke_test.py] 19/19 冒烟（改公钥后必跑）
        ↓
[edgeone-pages 连接器] 部署到 EdgeOne Makers  ← 部署最高优先级
        ↓
[github] 插件推 Release + 上传产物；Secrets 用 gh-cli 核对
```

### W4 · 合规与内容源

```
[compliance-review] + [personal-data-protection] 插件
   → 核对 internal / user_defined / third_party 三档
   → 核对匿名设备指纹无 PII（README + ota-integration 已声明）
[context7] 核对 SSRF 域名白名单实现
```

### W5 · 项目推进与汇报

```
[blockers.md] → [linear] / [progress-management-workbench] 转任务
[data-analysis] + [chart-visualization] → OTA 灰度与转化看板
[report-generator-skill] / [ppt-generator 插件] → 阶段汇报
[wecom 插件] → 发布通知
```

---

## 5. 可立即落地项（按优先级）

### P0 · 今天就做（不需要任何外部账号/硬件）

| # | 动作 | 用到的 TRAE 能力 | 产出 |
|---|---|---|---|
| 1 | **建 `.trae/rules/` 项目规则**，写入 OTA 契约红线、状态标记口径、禁止下发 `keys/*` | Rules 扩展项 | 模型永久遵守红线 |
| 2 | **修 `docs/SDK_状态.md` 与 `docs/blockers.md` §0**（工具链已装、Linux 已产出） | 内置编辑器 | 消除 TRAE 误判 |
| 3 | **把 `spec/`、`docs/blockers.md` 加入项目上下文** | `#Doc` / `#File` / `context-pack` | 每次任务自带契约 |
| 4 | **自建 `manju-ota` MCP**（封装 `scripts/` 下三个脚本） | `mcp-builder` 技能 | 模型可直接验签/发版/冒烟 |
| 5 | **核对 `.gitignore` 是否覆盖 `keys/*.pem`** | `git-commit` + `TRAE-security-review` | 防私钥二次入库 |

### P1 · 本周（需要一次确认或少量外部资源）

| # | 动作 | 用到的能力 |
|---|---|---|
| 6 | 执行 `cargo tauri build`（Rust 已装，bundle 仍空） | 终端 + `electron` 经验迁移 |
| 7 | Android APK 构建 + `test-android-apps` 真机/模拟器验证 | `test-android-apps` 插件 |
| 8 | `gh-cli` 核对 8 个 Secrets 是否齐全（只列名字） | `github` 插件 / `gh-cli` |
| 9 | 鸿蒙端补 SHA256 校验（Ed25519 待确认 cryptoFramework 支持） | `crossplatform-service-migration` + `context7` |
| 10 | 统一 6 处 API 基址（**等正式域名确定后**） | 编辑器 + `spec-to-implementation` |
| 11 | OTA 上报事件接入 `sentry` | `sentry` 插件 |

### P2 · 需你决策/采购

| # | 动作 | 阻塞 |
|---|---|---|
| 12 | 更新两处 OTA 私钥 Secret（GitHub + EdgeOne） | 🔴 需你操作控制台 |
| 13 | 备份 `manju-release.keystore` 到异地 | 🔴 需你确认存放位置（微云/网盘插件可协助） |
| 14 | Apple Developer Program + Developer ID | 🔴 ¥688/年 + Mac |
| 15 | EdgeOne 绑定已备案自定义域名 | 🔴 需 ICP 备案域名 |
| 16 | DevEco Studio（鸿蒙） | 🔴 需华为账号 |
| 17 | Windows 代码签名证书 | 🟡 可选（改善 SmartScreen） |

---

## 5.1 自建 `manju-ota` MCP（P0-4 的具体设计）

用 `mcp-builder` 技能把现有脚本包成一个 stdio MCP Server，暴露 4 个工具：

| 工具 | 封装脚本 | 参数 |
|---|---|---|
| `ota_sign_manifest` | `scripts/ota_manifest.py` | version / build / platform / file / store-url |
| `ota_smoke_test` | `scripts/smoke_test.py` | 无（返回 19 项结果） |
| `ota_key_rotate` | `scripts/gen_keypair.py` | 无（**强制同时回写 base64 与 bytes 两处**） |
| `ota_gen_icons` | `scripts/gen_icons_all.py` | 无 |

**关键价值**：`ota_key_rotate` 强制双写，从工具层面根除「只改 base64 漏改 bytes」这类事故重演。

---

## 6. 文档未说明 / 需要你确认的部分

| # | 问题 | 为什么重要 | 需要你做的 |
|---|---|---|---|
| 1 | **TRAE CN 的 MCP / 规则 / 文档集的准确入口名称** | 我读到的是配置文件与目录（`~/.trae-cn/mcps/`、`plugin-config.json`），但 UI 路径会随版本变化 | 按你界面的实际名称操作；若入口不同，告诉我路径我改文档 |
| 2 | **你希望在 TRAE 还是在本会话（WorkBuddy）执行这些任务** | 本会话已有 `edgeone-pages` 连接器与 9 个专家席位；TRAE 有 103 插件但项目 MCP 只有法律库 | 明确分工（建议：TRAE 写代码 + 质量把关，本会话做部署与编排） |
| 3 | **正式域名** | 6 处 API 基址 + Tauri endpoints + fetch 白名单都等它 | 提供已备案域名 |
| 4 | **Mac 构建机是否可得** | macOS/iOS 是六端中唯一「结构上不可能在本机验证」的两端 | 提供 Mac 或自助 macOS runner |
| 5 | **Linux 产物 `manju` 是否真能跑起来** | 已产出但上次 xvfb 启动验证被中断（429），**未完成启动确认** | 我可重跑一次 xvfb 验证 |
| 6 | **`dist/fake-manju-1.1.0-win-x64.msix` 是否为占位** | 2KB，明显是假包，但文档没说明 | 确认后可删或标注 |
| 7 | **鸿蒙 `cryptoFramework` 是否支持 Ed25519** | 决定 §5-9 是只补 SHA256 还是补齐完整验签 | 需 DevEco 环境或华为文档确认 |
| 8 | **OTA 私钥 Secret 是否已同步** | blockers 列为 P0，未确认完成情况 | 控制台确认 |
| 9 | **ICNS 是否需要 1024 条目** | 取决于是否上 Mac App Store（当前只满足 Developer ID 分发） | 确认分发渠道 |
| 10 | **内容源实际用哪档**（internal / user_defined / third_party） | 决定合规审查深度 | 告知内容来源策略 |

---

## 7. 一句话结论

**当前 TRAE 的短板不是缺插件（103 个已启用），而是缺「项目约束」**：契约红线、阻塞状态、工具链真相都没有进入 TRAE 的常驻上下文，导致模型会重复犯「漏改公钥字节数组」「声称四端都能打包」这类错误。

**最高性价比的三件事**：① 建 `.trae/rules/` 写死 OTA 红线；② 修 `docs/SDK_状态.md` + `blockers.md` §0 的过期结论；③ 用 `mcp-builder` 把 `scripts/` 包成 MCP，让发版动作从「口述」变成「工具调用」。
