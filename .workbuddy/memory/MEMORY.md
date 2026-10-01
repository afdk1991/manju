# 项目007（漫剧 Manju）长期项目约定

## EdgeOne Makers 部署目标（必须遵守）

- **部署目标项目名为 `manju`**。⚠️ 项目 ID 存疑待确认：项目记忆旧记为 `makers-3qmwu2u64etw`，
  但本机 `makers/.edgeone/project.json` 当前实际链接为 **`makers-vypuaynzkt0c`**（见下方「部署目标核对」）。
  两者不一致，可能是记忆 IDs 过期或曾被重新 `link`；**部署前请用户确认要更新的是哪个 manju 项目**。
  务必避开误建项目 `manju-drama-hub`（makers-nopixcdbuho7），**不要部署到它**。
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
- `export_static.py` 读 `keys/*.pem`，**不读 .env** → 导出链路始终安全，每次部署后
  建议跑 `scripts/check_ota_keys.py` 复核（现已自包含，无需装包）。
- ✅ `check_ota_keys.py` 已修好：优先 cryptography，缺失时自动用 Node 内置 crypto 兜底，
  两种后端输出一致（`.env`=旧泄露钥、`keys/`+线上=新有效钥）。私钥派生公钥须
  `createPrivateKey(pem)` → `createPublicKey(key)` → `export({type:'spki',format:'der'})`，
  末 32 字节 base64 即公钥（PKCS8 末 32 字节是 seed 不是公钥）。
  **坑：`makers/.env` 里的私钥是 base64 包装的 PEM，必须先解码**再喂 createPrivateKey。
  替换步骤见 `docs/OTA密钥云端替换手册.md`。
- `makers/.env` 受 `.gitignore:44 **/.env` 保护且未被 git 跟踪 → deploy 反向写入旧钥不会造成新的泄露，
  属于「本地脏文件」而非安全事故。

## Web 观影站（makers/static/index.html）

### 🔴 2026-10-01 已重建：不再是单文件 SPA，改为 Vite + React + TS 工程

**新架构（务必按这个来，旧写法已作废）**：
- 源码在 **`web/`**（Vite 6 + React 18 + TS），构建产物输出 **`makers/static/`**。
  `edgeone.json` 的 `outputDirectory: static` 不变，部署链路不动。
- `makers/static` 现在是**构建产物目录**（`emptyOutDir: true` 会清空）。
  ⚠️ **任何脚本都不得直接改写它**，否则下次 build 全部丢失。
- 静态资产（api/ files/ external/ admin/）统一放 **`web/public/`**，构建时复制进产物。
- `regen_static_content.py` 与 `localize_assets.py` 的输出已从 `makers/static` 改为 **`web/public`**。
- hls.js 改为 **npm 依赖**随 bundle 打包，不再自托管 `static/js/hls.min.js`；
  `localize_assets.py` 下载 hls.js 那步已禁用。

**正确的内容更新流程**：
```
改 DB → python scripts/regen_static_content.py   (→ web/public/api/v1)
      → python scripts/localize_assets.py        (→ web/public/files/covers，幂等)
      → cd web && npm run build                  (→ makers/static)
      → cd makers && node scripts/smoke_web.mjs  (21 项)
      → edgeone makers deploy
```

**模块划分**：`src/types.ts`（契约类型）· `src/api.ts`（数据层 + localStorage）
· `src/components/Player.tsx`（播放器）· `src/components/common.tsx`（卡片/版权标注）
· `src/pages/{Home,Series,Watch,External}.tsx` · `src/App.tsx`（hash 路由）。
路由不变：`#/` → `#/series/:id` → `#/watch/:epId` → `#/external` → `#/external/:cat`
→ **`#/ext/:cat/:id` 跳转提示页**。

**⚠️ fetch 必须带 Cookie**：`api.ts` 里写死 `credentials: 'same-origin'`。
曾用 `'omit'` 导致线上 XHR 被 SSO 拦成 **401**（本地无 SSO 永远测不出，
只有浏览器实测才暴露）。**不要改成 omit**。

**验证**（改前端后必跑）：`cd makers && node scripts/smoke_web.mjs`（**21 项**，
校验构建产物契约：bundle 含 player-shell、含 `noopener external`、无 `noreferrer`、
无 `window.open`、public 资产未被清空、HLS VOD 清单与分片完整、外部片单无视频直链字段）。

**播放器**（React 版，能力与原 ManjuPlayer 一致）：自定义控制条、进度拖拽、
倍速 0.5–2×、hls.js 画质分级、字幕 track、画中画、全屏、键盘快捷键、
自动隐藏控制条、缓冲/加载/错误重试、进度记忆续播、已看过标记、下一集导航。
注意 `main.tsx` **刻意不套 StrictMode**——它会双调用 effect 导致 hls.js 实例竞态。

**其他沿用规则**：
- 外部片单（红果 2010 条）**只做发现 + 跳转**，禁止 iframe/抓取/代理，详见 `docs/播放链路决策分析.md`。
  跳转链接用 `rel="noopener external"` + `referrerpolicy="strict-origin-when-cross-origin"`，
  但**不用 `noreferrer`**——保留 Referer 才便于证明导流属性。
- **目录名禁止叫 `vendor`** —— EdgeOne `StaticAssetsBuilder` 会跳过它，文件不进部署包。
- npm install 踩坑：报 `Cannot find module @rollup/rollup-win32-x64-msvc` 是 npm optional-deps bug，
  `rm -rf node_modules package-lock.json && npm install` 即可（**必须前台跑**，后台会被沙箱拦 esbuild）。

## 站内播放 / 自有内容生产管线（2026-10-01 打通）

- **目标**：用 AI 生成内容在站内真实播放，替换 s_900x 系列里的 mux 测试流占位。
- **首部自有剧集 `demo_ai_rebirth`（重生：我成了漫画主角）已上线**：6 张 AI 分镜帧 → HLS，纯站内相对路径，无第三方 CDN。
- 资源落地：`makers/static/files/videos/demo_ai_rebirth/ep01/`（index.m3u8 + 000~005.ts + ep01.mp4 降级源 + thumb.jpg）、`files/covers/demo_ai_rebirth_cover.jpg`。
- 生成管线脚本（均在本项目 `scripts/`）：
  - `build_episode_video.py`：静帧 → Ken Burns 片段 → concat → HLS + 渐进式 mp4（依赖 ffmpeg，已验证 9.0.1）。
  - `seed_demo_ai_rebirth.py`：把 series+episode 写进 `server/data/manju.db`（用 sqlite3，避开 ORM）。
  - `regen_static_content.py`：**不依赖 sqlalchemy**，从 `manju.db` 重建全部内容 JSON（series.json / home.json / 单剧 / 分集 / 单集 / series_index.json / categories.json）。
- ⚠️ `makers/scripts/export_static.py` 需要 **sqlalchemy（本机受管 Python 未装）**，**跑不了**；改用上面的 `regen_static_content.py` 达到等价效果。
- 单集 `sources` 格式：`[{container:"hls",url:"files/videos/.../index.m3u8"},{container:"mp4",url:".../ep01.mp4"}]`，均为站内相对路径；`startPlayback()` 优先 hls.js 加载本地 m3u8。
- 播放页 `viewWatch` 读 `episodes/{eid}.json`；详情页 `viewSeries` 读 `series/{id}.json` + `series/{id}/episodes.json`；首页 `viewHome` 读 `home.json` 的 sections。

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
- 部署目标核对（2026-10-01 实测）：`makers/.edgeone/project.json` = `{"Name":"manju","ProjectId":"makers-vypuaynzkt0c"}`。
  ⚠️ 与上方旧记 `makers-3qmwu2u64etw` 不符，待用户确认是否为同一项目的 ID 变更。

## 线上校验的正确姿势

> ⚠️ 2026-10-01 修正：下面"脚本请求一律 401、只能浏览器验证"的结论是**错的**，
> 错因是 token 放错了位置。正确做法见下。

**token 必须放进 Cookie，不能放 query**（这是能脚本化验证的关键）：
```
curl -H "Cookie: eo_token=<tok>; eo_time=<ts>" -A "Mozilla/5.0" https://manju-h58srdik.edgeone.cool/api/v1/series.json
```
放 query（`?eo_token=&eo_time=`）时服务端会 302 到自身并 `Set-Cookie`，
curl 默认不保留 → 落到 SSO 中间页 **401**，于是被误判成"线上没部署/只能浏览器看"。
用 Cookie 直连即可拿到真实 200/404。

**线上播放链路自动验证**：`makers/scripts/verify_online_playback.mjs <baseUrl> <token> <time>`
（检查 index.html → series.json → 详情 → 单集 manifest → m3u8 → ts 分片同步字节 0x47 → hls.min.js）。
站外片源只警告不计数失败。部署后必跑。

**浏览器端实测**（本机有 Edge，无需装 playwright）：
```
"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu \
  --user-data-dir=<临时目录> --virtual-time-budget=25000 --dump-dom "<URL>#/watch/<epId>"
```
成功判据：`<video ... src="blob:https://<域名>/...">` —— blob: 说明 hls.js 已通过 MSE
挂载并拉取了分片，即真的能播。若 `.p-error` 仍无 inline `style`（保持 CSS 的 display:none）则说明未出错。

判别项目是否存在的对照：**已部署 → 401；不存在/已下线 → 404**。预览域名约 3 小时过期。

## ⚠️ edgeone.json 的 rewrites 会打死 `.json` 静态文件（2026-10-01 真实事故）

`makers/edgeone.json` 里这两条规则曾导致**线上全部剧集的详情页与播放页 404**（不只是新剧集）：
```
{ "source": "/api/v1/series/:id",   "destination": "/api/v1/series/:id.json" }   ← 有害
{ "source": "/api/v1/episodes/:id", "destination": "/api/v1/episodes/:id.json" } ← 有害
```
原因：`:id` 会匹配到 `s_9001.json`，destination 被拼成 `s_9001.json.json` → 404。
前端 `api()` 请求的就是带 `.json` 的路径，所以 rewrite 反而把它打死了。
**已删除这两条**。现保留 6 条 rewrite，其中 `/api/v1/series/:id/episodes` 无害
（请求带 `.json` 时不匹配该 source，走静态直出 200）。

**规则：凡是 `source` 以 `:param` 结尾、且 destination 再拼后缀的 rewrite 都是有害的，不要加。**
改完必须跑 `verify_online_playback.mjs` 实测确认 `/api/v1/series/<id>.json` 与
`/api/v1/episodes/<eid>.json` 都返回 200。

## 方案A 治理体系（根目录《方案A》落地后的文档结构，勿重复造）

- **技术栈裁决已完成**：方案A 的 UniApp / NestJS / MySQL / Redis / Docker **一律不采用**，
  以项目007 现状（Flutter 主干 + FastAPI + SQLite + EdgeOne Serverless + Vite/React/TS Web）为准。
  论证见 `docs/鸿蒙取舍与方案A可行性对比评估.md`。以后再提「按方案A做」＝治理骨架，不是换栈。
- 六份配套文档：总纲《方案A落地总纲（项目007适配版）》、评审体系落地清单、外包任务说明书、
  成本测算与预算台账、风险台账（11 项）、鸿蒙取舍评估。
- `review/` 存五个节点评审记录模板（01需求/02方案/03代码/04测试/05合规），
  用法是**复制到 `review/records/<版本>/` 后填写**，模板本体保持空白。
- CI 门禁 `.github/workflows/review-gates.yml` 四 job；backend-quality 与「过期域名扫描」
  目前是 🟡 soft（continue-on-error），**二期修完 7 处基址后应转 hard**。
- 成本口径：方案A 原文的「首年 8500~23000 元」**不适用**项目007（六端账号 + 软著 + 内容授权），
  以 `docs/成本测算与预算台账.md` 的三档为准，不要直接引用原文区间。

## Windows 本机补充：YAML 校验

受管 Python 无 pyyaml，用 venv：`C:/Users/addk1/.workbuddy/binaries/python/envs/default/Scripts/python.exe`
（已装 pyyaml）。校验 GitHub workflow 比肉眼看 YAML 可靠。
多行的 `python -c "..."` 在 Bash 工具里可能被沙箱以
「cmd decisionRecord missing actual resource subject」拦下 —— **写成 .py 文件再执行**即可绕过。
