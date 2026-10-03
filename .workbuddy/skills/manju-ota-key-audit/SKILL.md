---
name: manju-ota-key-audit
description: 漫剧 Manju（项目007）OTA 签名密钥的一致性与泄露核对。当 CI security-gates 自动轮换密钥后、每次 edgeone makers deploy 之后（云端 env 会反向覆盖本地 .env）、客户端报验签失败、或怀疑私钥泄露时使用。覆盖 keys/*.pem、makers/.env、GitHub Secret ED25519_PRIVATE_KEY、EdgeOne MANJU_OTA_PRIVATE_KEY 四处。
version: 1.0.0
---

# 项目007 · OTA 密钥一致性核对

> 关联风险：R-07（OTA 私钥泄露，历史上已发生过两次）、R-08（签名密钥更换导致应用分裂）。

## 何时使用

- 每次 `edgeone makers deploy` 之后（**云端 env 会反向覆盖本地 `.env`，是已知脏状态**）
- CI `security-gates` 自动轮换密钥并自动提交之后
- 客户端报验签失败 / `dart test` 验签用例挂掉
- 怀疑私钥进过版本库

## 核对命令

```bash
python scripts/check_ota_keys.py
```

脚本已自包含（优先 cryptography，缺失时用 Node 内置 crypto 兜底），无需装包。

## 四处一致性

| # | 位置 | 说明 |
|---|---|---|
| 1 | `keys/ota_private.pem` / `keys/ota_public.pem` | **唯一真源**，导出链路只读这里（不读 `.env`） |
| 2 | `makers/.env` 的 `MANJU_OTA_PRIVATE_KEY` | base64 单行包装的 PEM；**deploy 后会被云端旧值反向覆盖** |
| 3 | GitHub Secret `ED25519_PRIVATE_KEY` | CI 轮换后必须同步 |
| 4 | EdgeOne 环境变量 `MANJU_OTA_PRIVATE_KEY` | ⚠️ **只能在控制台改**，`edgeone makers env set` 静默失败 |

## 当前有效密钥（2026-10-01 第二次轮换后）

- 有效公钥：`Bvg00Un3CIWzc8Zim5ZTc9UDYJqulQx2Ds+spgvjRs0=`
- 已作废 ①：`f2obZdLFwhWJtuA/u/VW/EB1jAZ/UiZF/eEbxFJ0a3c=`（曾明文进公开仓库，**git 历史未清**）
- 已作废 ②：`DuW8zxjUYPNEnNY8RMIe4G670V5ZzX39rl1v9CEVQRU=`

## 红线

| # | 红线 |
|---|---|
| 1 | **绝不输出私钥正文**到对话、文档、评审记录、任务书 |
| 2 | 写文档/评审记录时**不要写完整 PEM 头字面量** —— CI `security-gates` 的 `git grep 'BEGIN ... PRIVATE KEY'` 会命中并让硬门禁变红 |
| 3 | `keys/*.pem` 不进版本库；`.env` 受 `.gitignore:44 **/.env` 保护 |
| 4 | 任何 MCP / 子代理 / 外包方都**不得**被授予 `keys/`、`.ssh/`、`.env` 的读取路径 |
| 5 | 泄露即轮换：轮换后必须同步 ③④，并用本技能复验四处一致 |

## 跨工作区注意（2026-10-03 实测）

- `keys/ota_private.pem` 与 `makers/.env` **都不进版本库**（前者未跟踪，后者受 `.gitignore:44 **/.env`）。
  因此新建的 **git worktree 不会自动带上它们** —— C 盘 worktree 曾因此「看起来私钥丢失」，实为未跟踪文件未同步。
- **完整密钥资产在 D 盘主仓** `D:\网站全栈项目\项目007`。在新工作区首次跑本流程前先同步：
  ```bash
  cp D:/网站全栈项目/项目007/keys/ota_private.pem <工作区>/keys/
  cp D:/网站全栈项目/项目007/makers/.env        <工作区>/makers/.env
  ```
- 健康判据：四处全部 `NEW(有效)`，且结论行显示「✅ 当前状态安全」。
  脚本退出码：**0 = 安全 / 1 = 需处理**。

## 脚本自身已知缺陷（已于 2026-10-03 修复）

`scripts/check_ota_keys.py` 曾硬编码 node 路径 `...\node\versions\22.22.2-3\node.exe`，
而本机实际版本为 `22.22.2-5` → 兜底后端整体失效，直接 `NO_CRYPTO_BACKEND` 退出码 2。
现已改为**动态探测**（受管多版本目录 → PATH → 系统路径），并顺带修复：
ROOT 硬编码 D 盘 → 改为按脚本位置推导（两个工作区通用）；
`.env` / 私钥缺失 → 报 `NOT_FOUND` 而非抛异常；
线上公钥改为优先读真源 `web/public/api/v1/ota/public-key.json`，避免产物目录被清空造成误判。

## 技术要点（避免再次踩坑）

- 私钥派生公钥：`createPrivateKey(pem)` → `createPublicKey(key)` → `export({type:'spki',format:'der'})`，
  末 32 字节 base64 即公钥。**PKCS8 的末 32 字节是 seed，不是公钥**。
- `makers/.env` 里的私钥是 **base64 包装的 PEM**，必须先解码再喂 `createPrivateKey`。

## 配套

- 轮换与云端替换步骤：`docs/OTA密钥云端替换手册.md`
- 客户端内置公钥若同时存在 base64 常量与 bytes 数组，**必须双写** —— 曾因只改 base64 漏改 bytes 导致 `dart test` 7/8 失败
