---
name: manju-online-verify
description: 漫剧 Manju（项目007）部署后的线上播放链路验证。当部署完成、换域名、排查线上 401/404、或需要确认「真的能播」时使用。含 EdgeOne 预览域 SSO token 的正确传法（必须放 Cookie 而非 query）、verify_online_playback.mjs 用法、本机 Edge headless 实测 blob 判据。
version: 1.0.0
---

# 项目007 · 线上播放链路验证

> 原则（与风险台账 R-11 一致）：任何「跑通」结论必须附**具体命令 + 实际输出**，
> 状态标记只能用 ✅已实现 / 🧪已验证 / ⏳待真机验证，不得混用。

## 何时使用

- `edgeone makers deploy` 之后（**每次部署必跑**）
- 换域名 / 换部署地址后
- 线上报 401 / 404 需要判别「没部署」还是「鉴权问题」

## 第 1 步：脚本级验证（token 必须放 Cookie）

```bash
cd makers
node scripts/verify_online_playback.mjs <baseUrl> <token> <time>
```

手工等价验证（**token 放 Cookie，不能放 query**）：

```bash
curl -H "Cookie: eo_token=<tok>; eo_time=<ts>" -A "Mozilla/5.0" \
  https://manju-h58srdik.edgeone.cool/api/v1/series.json
```

⚠️ **踩过的坑**：把 token 放 query（`?eo_token=&eo_time=`）时服务端会 302 到自身并 `Set-Cookie`，
curl 默认不保留 → 落到 SSO 中间页 **401**，会被误判成「线上没部署」。用 Cookie 直连才能拿到真实 200/404。

检查链路：index.html → series.json → 详情 → 单集 manifest → m3u8 → ts 分片同步字节 `0x47` → hls。
站外片源只警告，不计数失败。

## 第 2 步：浏览器实测（判据 `blob:`）

本机有 Edge，**不需要装 playwright**：

```bash
"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu \
  --user-data-dir=<临时目录> --virtual-time-budget=25000 --dump-dom "<URL>#/watch/<epId>"
```

**成功判据**：`<video ... src="blob:https://<域名>/...">`
→ `blob:` 说明 hls.js 已通过 MSE 挂载并拉取了分片，即真的能播。
辅助判据：`.p-error` 无 inline `style`（保持 CSS 的 `display:none`）说明未出错。

## 401 / 404 判别

| 现象 | 含义 |
|---|---|
| **401** | 已部署，鉴权（SSO）未通过 → 换 Cookie 传 token 重试 |
| **404** | 项目不存在 / 已下线 / 路径被 rewrite 打死 |
| 预览域突然不可访问 | 预览域名约 **3 小时过期**，重新部署或改用正式域 |

## 换域名/换部署地址时的必做步骤

1. `python scripts/localize_assets.py`（幂等，先跑）
2. `python makers/scripts/export_static.py --public-base https://<新域名>`
   —— 签名消息含 URL：`{version}|{build}|{sha256}|{url}`，**不重签则客户端验签失败**
   ⛔ 该脚本依赖 sqlalchemy，本机受管 Python 未装，**当前跑不了**（已知阻塞项）；
   需先在 venv 里补 sqlalchemy，或等二期修复后再换域名。
3. `python scripts/verify_ota_signatures.py <新域名>` —— 确认每条 release 验签 PASS
4. `cd makers && node scripts/smoke.mjs`（应 16/16）
5. `cd makers && edgeone makers deploy`
6. 回到本技能第 1、2 步复验

## 前置依赖

- 预览域 + SSO token（`eo_token` / `eo_time`），token 约 3 小时过期
- 本技能只读线上，**不做任何写操作、不改线上配置**
