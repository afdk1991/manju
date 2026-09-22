# 外部资源索引 · 红果短剧（hongguoduanju.com）

本目录存放从互联网公开页面获取的**短剧元数据索引**，供漫剧 Manju 项目作为
「第三方内容来源（external catalog）」引用。**不包含、也不分发任何视频或图片文件本身。**

## 1. 数据来源与获取范围

| 项 | 内容 |
|---|---|
| 来源平台 | 红果短剧官网 `https://hongguoduanju.com`（字节系免费短剧平台） |
| 采集入口 | 分类页 `https://hongguoduanju.com/category/real-drama`（真人剧） |
| 翻页方式 | 站点自带分页 `/category/real-drama?page=N`（共 34 页），逐页抓取 |
| 获取范围 | 仅分类**列表页**上公开可见的卡片元数据，共 **800 条**（2026-09-23 采集） |
| 资源类型 | **元数据**（标题、详情页链接、封面图地址、集数）；无视频、无图片二进制 |
| 唯一标识 | 详情页链接 `detail_url`（`/detail?series_id=...`），去重后 800 条全部唯一 |

> 说明：用户指定的 `real-drama` 分类是**真人短剧**。红果另有 `comic-drama`（漫剧）、
> `ai-drama`（AI 剧）分类，与「AI 生成动态漫画」更贴近；如需采集可用同一脚本改入口。

## 2. 合规与服务条款边界

- **robots.txt**：`/category/...` 分类页为 `Allow: /`，允许抓取；
  `/player/*/*`、`/series/`、`/query/` 为 `Disallow` —— 本采集**未请求**这些路径，
  不进播放页、不抓取播放地址。
- 只提取列表页**公开可见**字段，不登录、不绕过反爬/校验；
  单线程、每页间隔 2 秒、浏览器 UA、失败重试并保留已得结果。
- **不下载/转存/二次分发封面与视频**：`cover_url` 仅为指向原站 CDN 的地址记录；
  作品与封面版权归红果短剧及权利人所有，条目点击后跳转回原站详情页。
- 数据仅用于内部内容索引/演示，不冒充自有版权内容；如权利方要求，删除本目录即可下线。

## 3. 目录结构

```
resources/external/hongguoduanju/
├── README.md                # 本说明（来源/范围/合规/引用方式）
├── fetch_real_drama.py      # 可续跑、限速采集器（读列表页 → 元数据 JSON）
├── build_catalog.py         # 转换为应用向静态索引
└── real-drama.json          # 原始采集结果（带来源与采集元信息，800 条）
```

应用向产物（构建生成，随 Makers 部署）：

```
makers/static/external/real-drama.json
```

## 4. 项目内引用方式

- **EdgeOne Makers 静态托管**：部署后以
  `https://<部署域名>/external/real-drama.json` 访问，前端可作为「外部片单」分区拉取；
  条目结构：`{id:"hg-<series_id>", title, cover_url, episodes, source, detail_url, ...}`。
- **ID 规范**：外部条目统一加 `hg-` 前缀，与自有内容 `s_100xx` 隔离。
- **播放/详情**：`detail_url` 指向红果原站，应用内以「去原站观看」外链方式打开，
  不在本项目内代理或内嵌其受版权保护的播放内容。
- **后端对接**：可由 `server/app/services/sources/third_party.py` 第三方源适配层读取
  该 JSON 做统一聚合（当前为静态索引，未写入 SQLite）。

## 5. 更新与续跑

```bash
# 增量续抓（自动读取已有 JSON 去重，从第 1 页扫到末页，只加新条目）
python resources/external/hongguoduanju/fetch_real_drama.py
# 重新生成应用向索引
python resources/external/hongguoduanju/build_catalog.py
```
