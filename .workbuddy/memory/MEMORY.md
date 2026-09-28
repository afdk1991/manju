# 项目007（漫剧 Manju）长期项目约定

## EdgeOne Makers 部署目标（必须遵守）

- **唯一正确的部署项目是 `manju`**，ProjectId `makers-3qmwu2u64etw`。
  控制台里还有一个 `manju-drama-hub`（makers-nopixcdbuho7），那是误建的项目，**不要部署到它**。
- 本地关联状态在 `makers/.edgeone/project.json`（gitignore），切换项目用：
  `cd makers && edgeone makers link -n manju`
- `makers/edgeone.json` 的 `name` 也已统一为 `manju`（原 `manju-makers`），不要改回。
- 完整部署（含云函数）用 CLI：`cd makers && edgeone makers deploy`
  —— MCP 的 `deploy_folder` 只上传静态目录，不带云函数。

## OTA 密钥（反复踩坑区）

- 当前有效 Ed25519 公钥：`f2obZdLFwhWJtuA/u/VW/EB1jAZ/UiZF/eEbxFJ0a3c=`
  （`keys/ota_private.pem` / `keys/ota_public.pem`，2026-09-20 轮换后的新对）
- 已作废旧私钥（曾泄露进 GitHub，仍在 manju 项目云端环境变量里）：对应公钥
  `DuW8zxjUYPNEnNY8RMIe4G670V5ZzX39rl1v9CEVQRU=`
- `edgeone makers link` / `deploy` 都会把云端 env **反向覆盖**到本地 `makers/.env`，
  所以每次部署后 `.env` 里的 `MANJU_OTA_PRIVATE_KEY` 会变成旧的那把 —— 这是已知脏状态，
  云端那侧只能通过控制台修改（`edgeone makers env set` 静默失败）。
- `export_static.py` 读 `keys/*.pem`，**不读 .env** → 导出链路始终安全，但每次部署后
  建议跑 `scripts/check_ota_keys.py` 复核。
- ⚠️ `check_ota_keys.py` 在本机跑不通（输出 `NEED_CRYPTOGRAPHY`，缺 cryptography 库）。别浪费时间，
  直接用 node 内置 Ed25519 替代：
  `crypto.createPrivateKey(pem)` → `createPublicKey().export({type:'spki',format:'der'})`，末 32 字节 base64 即公钥。
  **坑：`makers/.env` 里的 `MANJU_OTA_PRIVATE_KEY` 是 base64 包装的 PEM，必须先 `Buffer.from(v,'base64')` 解码**，
  直接喂给 createPrivateKey 会报 "DECODER routines::unsupported" 而被误判成密钥损坏。
- `makers/.env` 受 `.gitignore:44 **/.env` 保护且未被 git 跟踪 → deploy 反向写入旧钥不会造成新的泄露，
  属于「本地脏文件」而非安全事故。

## Web 观影站（makers/static/index.html）

- 它不是演示自检页，而是 hash 路由 SPA：`#/` 首页 → `#/series/:id` 详情 → `#/watch/:epId` 播放
  → `#/external` 外部片单分类 → `#/external/:cat` 列表 → **`#/ext/:cat/:id` 跳转提示页**。
- 改完走 `makers/static` 下的 `python -m http.server` 本地实测（所有路径应 200）。
- **改前端渲染后跑 `cd makers && node scripts/smoke_web.mjs`（应 10/10）**，
  它在极简 DOM stub 上实跑内联脚本，比浏览器目视可靠。
- 外部片单（红果 2010 条）**只做发现 + 跳转**，禁止 iframe/抓取/代理，详见 `docs/播放链路决策分析.md`。
  跳转链接刻意用 `rel="noopener external"` + `referrerpolicy="strict-origin-when-cross-origin"`，
  但**不用 `noreferrer`**——保留 Referer 才便于证明导流属性。
- **目录名禁止叫 `vendor`** —— EdgeOne `StaticAssetsBuilder` 会跳过它，文件不进部署包。
  第三方库放 `static/js/`。
- `scripts/localize_assets.py`（幂等）负责把封面/hls.js 拉到本地，部署前必跑，否则页面长时间空白。

## 网络事实（境外 CDN 在大陆的表现，实测）

| 域名 | 表现 |
|---|---|
| `test-streams.mux.dev` (HLS) | 稳定 206，0.2~0.8s ✅ 首选片源 |
| `thumb.wikimedia.org` (封面) | 200 但 4~15s ❌ 必须本地化 |
| `upload.wikimedia.org` (视频) | 3 次约 1 次超时 ❌ 不可用于生产 |

播放器优先级：HLS（本地 hls.js）> Safari 原生 HLS > webm/mp4 直链。

## 换域名/换部署地址时的必做步骤

0. `python scripts/localize_assets.py`（把封面/hls.js 拉到本地，幂等）
1. `python makers/scripts/export_static.py --public-base https://<新域名>`
   （签名消息含 URL： `{version}|{build}|{sha256}|{url}`，不重签则客户端验签失败）
2. `python scripts/verify_ota_signatures.py <新域名>` 确认每条 release 验签 PASS
3. `cd makers && node scripts/smoke.mjs`（应 16/16）
4. `cd makers && edgeone makers deploy`

## Windows 本机环境踩坑（反复会再遇到）

- **Git Bash 的 `ln -s` 是假的**：目标是目录时它创建的是**空的普通目录**，命令不报错、
  `ls` 看着像目录，但里面没有任何文件（`os.path.islink()` = False，报 `WinError 4390 不是重分析点`）。
  给目录建链接一律用 PowerShell：`New-Item -ItemType Junction -Path <链接> -Target <真实目录>`
  （Junction 对目录最稳且不需要管理员权限）。
- **`npm install -g` 必须前台跑**：放后台时子进程 spawn（如 esbuild）会被沙箱拦下，
  报 `spawn ... error: [Circular *1]`。同一个命令前台跑能触发沙箱放行并成功。
- EdgeOne Makers Skills 实际位置：`C:\Users\addk1\.agents\skills\edgeone-makers-tools`（实体），
  链接到 `.codebuddy\skills\` 与 **`.workbuddy\skills\`（Junction，WorkBuddy 客户端读这里）**。
- `edgeone` CLI 装在受管 Node：`C:\Users\addk1\.workbuddy\binaries\node\versions\22.22.2-3`，
  当前 **1.6.41（latest）**。**本机已有登录态**：`edgeone whoami` 返回账号 100033061933（APPID 1320483685），
  正常情况下可直接 `edgeone makers deploy`，不要再让用户走 OAuth；仅当报鉴权失效才需重登。
- 部署目标核对：`makers/.edgeone/project.json` = `{"Name":"manju","ProjectId":"makers-3qmwu2u64etw"}`。

## 线上校验的正确姿势

EdgeOne 预览域名在路由之前就有 SSO 鉴权，脚本化请求一律返回
**401 + Title "Tencent Edgeone" 的中间页**（连不存在的路径也 401）。
判别项目是否存在的对照：**已部署 → 401；不存在/已下线 → 404**。
必须用真实浏览器打开**带完整 `?eo_token=&eo_time=` 的完整 URL**，预览域名约 3 小时过期。
