---
name: manju-content-pipeline
description: 漫剧 Manju（项目007）Web 观影站的内容更新与构建流水线。当修改了 server/data/manju.db 的内容（剧集/分集/首页/分类）、需要重新生成 web/public/api 内容 JSON、需要构建 makers/static 产物、跑 smoke_web 冒烟、或准备部署到 EdgeOne Makers 时使用。固化「regen → localize → build → smoke → deploy」五步顺序与全部红线。
version: 1.0.0
---

# 项目007 · Web 观影站内容更新流水线

> 适用范围：仓库根目录 `C:/Users/addk1/WorkBuddy/Worktrees/项目007/main-bee93428`（或 D 盘同源仓库）。
> 目的：把「改完内容到上线」的五步固定下来，杜绝漏步骤导致线上 404 或产物被覆盖。

## 何时使用

- 改了 `server/data/manju.db` 里的 series / episode / home 数据
- 新增或替换了剧集封面、视频切片
- 需要重建 `makers/static/` 构建产物
- 部署前跑一次完整校验

## 五步顺序（**不可调换、不可省略**）

```bash
# 0. 前置：确认自己在仓库根目录
pwd   # .../项目007/main-bee93428

# 1. 从 DB 重建内容 JSON → web/public/api/v1
python scripts/regen_static_content.py

# 2. 本地化静态资产（封面等，幂等）→ web/public/files/covers
python scripts/localize_assets.py

# 3. 构建 → makers/static（emptyOutDir 会先清空）
cd web && npm run build && cd ..

# 4. 冒烟校验构建产物契约（应为 21/21）
cd makers && node scripts/smoke_web.mjs && cd ..

# 5. 部署（完整部署含云函数，必须用 CLI）
cd makers && edgeone makers deploy && cd ..
```

若 `python` 指向异常（受管 Python 未装依赖时），用受管解释器：
`C:/Users/addk1/.workbuddy/binaries/python/versions/3.13.12/python.exe`

> `regen_static_content.py` 只用标准库 sqlite3，**不需要 sqlalchemy**。
> ⛔ `makers/scripts/export_static.py` 依赖 sqlalchemy，本机受管 Python 未装，**跑不了**；不要改用它。

## 红线（违反即产物损坏或线上事故）

| # | 红线 | 原因 |
|---|---|---|
| 1 | **任何脚本都不得直接写 `makers/static/`** | 它是 Vite 构建产物目录，`emptyOutDir: true` 会在 build 时清空，手改内容下次 build 全丢 |
| 2 | 静态资产统一放 `web/public/` | 构建时自动复制进产物，写别处不会进包 |
| 3 | 目录名**禁止叫 `vendor`** | EdgeOne `StaticAssetsBuilder` 会跳过该目录，文件不进部署包 |
| 4 | hls.js 走 npm 依赖 | 不再自托管 `static/js/hls.min.js`；`localize_assets.py` 下载 hls.js 那步已禁用 |
| 5 | `npm install` 若报 `Cannot find module @rollup/rollup-win32-x64-msvc` | npm optional-deps bug：`rm -rf web/node_modules web/package-lock.json && npm install`，**必须前台跑**（后台会被沙箱拦 esbuild） |
| 6 | 部署必须带项目名 | `edgeone makers deploy` 前核对 `makers/.edgeone/project.json` = `makers-vypuaynzkt0c`；⛔ 永不部署到 `manju-drama-hub`（makers-nopixcdbuho7） |
| 7 | **`cloud-functions/` 内文件名禁止含方括号 `[]`** | Next.js 风格 `[[default]].js` / `[id].js` 会让云端构建直接失败（`Code: 18`，约 14.7s 即 Failed），2026-09-25 起 12 次 CI 部署全挂就是这个原因。已改名为 `api/v1/admin/index.js` |
| 8 | **本地 `deploy .` 会把 `makers/.env` 打包上传** | `.env` 含 OTA **私钥**；CLI 不读 .gitignore。本地部署前先把它临时移出 `makers/`，改由云端环境变量提供（CI checkout 天然无 .env，是安全的）。其它非站点文件同理，尽量从干净目录部署 |

## 判据

- `smoke_web.mjs` 必须 **21/21** 才允许进入部署。
- 校验项包括：bundle 含 player-shell、含 `noopener external`、无 `noreferrer`、无 `window.open`、public 资产未被清空、HLS VOD 清单与分片完整、外部片单无视频直链字段。
- 部署后**另跑** `manju-online-verify` 技能做线上实测（本流水线只保证产物正确，不保证线上可达）。

## 常见失败对照

| 现象 | 原因 | 处置 |
|---|---|---|
| 线上剧集详情/播放页全 404 | `edgeone.json` 里有害 rewrite（source 以 `:param` 结尾、destination 再拼 `.json`） | 删除该类 rewrite；规则：source 以 `:param` 结尾且 destination 再拼后缀的一律不加 |
| build 后 `web/public/` 的资产没进包 | 文件放错目录或目录名叫 `vendor` | 移入 `web/public/` 并改名 |
| 前端 XHR 线上 401 | `api.ts` 的 fetch 被改成 `credentials:'omit'` | 改回 `same-origin`（本地无 SSO 测不出，只有线上暴露） |
| 播放器 hls.js 实例竞态 | `main.tsx` 被套了 StrictMode | 保持不套 StrictMode |
| 提交后发现没提交 | 沙箱静默吞 `git add` | 提交推送用 `dangerouslyDisableSandbox: true` |

## 前置依赖

- Node（受管）：`C:\Users\addk1\.workbuddy\binaries\node\versions\22.22.2-5`
- `edgeone` CLI 已登录（账号 100033061933），报鉴权失效才需重登
- ffmpeg（仅生成视频切片时需要，`scripts/build_episode_video.py`）
