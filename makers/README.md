# 漫剧 Manju・EdgeOne Makers 部署版

将「漫剧 Manju」（FastAPI + SQLite 内容中台 + OTA 更新服务）适配到

**腾讯云 EdgeOne Makers**（免费 Serverless 平台）的完整可部署工程。



***

## 1. 为什么是这套架构

EdgeOne Makers 的限制决定了适配方式：



| 平台能力                   | 限制                               | 本项目适配                                 |
| ---------------------- | -------------------------------- | ------------------------------------- |
| Cloud Functions        | 无状态请求模式，**文件系统不可持久化**            | SQLite 不部署；内容导出为**静态 JSON**（CDN 边缘加速） |
| Edge Functions         | 仅 JS、CPU 200ms、包 ≤5MB            | 不承担重逻辑                                |
| Cloud Functions (Node) | 可打包只读文件（`includeFiles`）          | 搜索、OTA 检查读取 `data/**` 只读索引            |
| **Blob 对象存储**          | 免费 1GB，`@edgeone/pages-blob` SDK | OTA 上报、用户收藏 / 历史、admin 增量发布持久化        |

客户端 **API 路径与响应结构完全不变**（`/api/v1/...`），Flutter/Tauri 端只需把

`MANJU_API_BASE` / `API_BASE` 指向部署域名即可，零代码改动。

## 2. 目录结构



```
makers/

├── edgeone.json                    # 平台配置：rewrites（无后缀→.json）、includeFiles、headers

├── package.json                    # 依赖 @edgeone/pages-blob（ESM）

├── scripts/

│   ├── export\_static.py            # 从本地 manju.db 导出静态内容/OTA/索引（幂等）

│   └── smoke.mjs                   # 本地冒烟测试（15 项断言）

├── data/                           # 构建时生成，随 Cloud Functions 打包（只读）

│   ├── releases.json               #   OTA 发布记录（含 Ed25519 签名）

│   └── series\_index.json           #   全量剧集索引（搜索用）

├── static/                         # 静态托管（CDN 边缘加速）

│   ├── index.html                  #   落地页（含在线自检）

│   ├── api/v1/…                    #   内容 API 静态 JSON（home/categories/series/episodes…）

│   ├── admin/index.html            #   运营后台（只读内容 + 可发布 OTA）

│   └── files/                      #   OTA 安装包

└── cloud-functions/                # 动态逻辑（Node.js，文件即路由）

&#x20;   ├── \_lib/data.js                #   共享辅助（读 data、JSON 响应、semver、CRC32）

&#x20;   ├── api/v1/ota/check/index.js   #   更新检查：灰度/降级/策略矩阵/ETag

&#x20;   ├── api/v1/ota/report/index.js  #   事件上报 → Blob

&#x20;   ├── api/v1/search/index.js      #   内存索引搜索

&#x20;   ├── api/v1/user/favorites|history/index.js  # 用户数据 → Blob

&#x20;   └── api/v1/admin/releases|reports/stats     # 发布（签名）+ 统计
```

## 3. 本地生成与验证

前置：本地 Python 依赖已装（fastapi/sqlalchemy 等，与 server 版共用）。



```
\# 1) 生成静态资源（在项目根 D:\网站全栈项目\项目007 执行）

python makers\scripts\export\_static.py

\# 2) 部署后需用真实域名重新生成（OTA 产物 URL 替换 localhost）

python makers\scripts\export\_static.py --public-base https://你的域名.pages.dev

\# 3) 本地冒烟测试（Cloud Functions 逻辑 + 静态契约，15 项断言）

cd makers && npm install && node scripts\smoke.mjs
```

## 4. 部署到 EdgeOne Makers（免费）

### 4.1 控制台方式（推荐，无需命令行）



1. 打开 [腾讯云 EdgeOne 控制台 → Makers](https://console.cloud.tencent.com/edgeone/makers)

   （Makers 限时免费，无需信用卡）

2. 创建项目 → 选择「导入仓库 / 直接上传」→ 上传 `makers/` 目录内容

   （**不要上传** `node_modules/`、`data/`、`static/` 之外被 `.gitignore` 排除的临时文件）

3. 构建配置保持默认（`installCommand: npm install`，自动识别 edgeone.json）

4. 等待构建完成，即获得 `https://<project>.pages.dev` 公网地址

### 4.2 CLI 方式



```
npm i -g edgeone

edgeone login          # 扫码登录腾讯云

cd makers

edgeone pages dev     # 本地调试（可选）

edgeone deploy        # 部署
```

### 4.3 必须配置的环境变量（控制台 → 项目设置 → 环境变量）



| 变量                      | 必填 | 说明                                                                     |
| ----------------------- | -- | ---------------------------------------------------------------------- |
| `MANJU_ADMIN_KEY`       | ✅  | 运营后台密钥（与 admin 页面输入框一致），如 `manju-dev-admin-key`                        |
| `MANJU_OTA_PRIVATE_KEY` | ⚠️ | OTA 私钥 PKCS8 PEM（`keys/ota_private.pem` 内容），配置后才支持后台发布签名；不配置则后台仅读、不可发布 |

## 5. 部署后验证



```
GET /                                 落地页（在线自检面板）

GET /api/v1/home                      内容首页（静态）

GET /api/v1/ota/check?platform=windows\&arch=x86\_64\&channel=stable\&version=9.8.0\&build=980\&device\_id=test

&#x20;                                     → 200 has\_update=true（含 Ed25519 签名）

GET /api/v1/search?q=开局              → 命中结果

GET /admin                            运营后台
```

## 6. 客户端接入



* **Flutter**：`flutter build ... --dart-define=MANJU_API_BASE=https://<project>.pages.dev`

* **Tauri**：修改 `clients/manju_tauri/src/api/client.ts` 第 20 行 `API_BASE`

* 客户端更新逻辑、OTA 验签公钥均与本地版一致，无需改动。

## 7. 功能矩阵与已知取舍



| 功能                      | 本地 FastAPI 版 | Makers 版 | 说明                     |
| ----------------------- | ------------ | -------- | ---------------------- |
| 内容浏览（首页 / 分类 / 详情 / 搜索） | ✅            | ✅        | 静态 JSON + 搜索函数         |
| OTA 检查 / 上报 / 统计        | ✅            | ✅        | 检查 = 函数；上报 / 统计 = Blob |
| 后台发布 OTA（含签名）           | ✅            | ✅        | Blob 持久化（需私钥环境变量）      |
| 收藏 / 播放历史               | ✅            | ✅        | Blob（X-User-Id 简化鉴权）   |
| 系列 / 集数增删改              | ✅            | ⚠️ 只读    | 静态内容：本地维护后重新导出部署       |
| 速率限制 / JWT              | ✅            | ⚠️ 简化    | 演示部署未实现，生产需自行补充        |

> 数据一致性：Blob 为最终一致（秒级）。admin 发布后 OTA check 可能短暂读到旧值，属正常。

## 8. 常用操作



```
\# 内容变更后重新部署

python makers\scripts\export\_static.py --public-base https://\<project>.pages.dev

\# 然后重新上传/推送 makers/ 目录触发构建
```



***

部署目录：`D:\网站全栈项目\项目007\makers\`

本地数据源：`server\data\manju.db`（export\_static.py 每次读取并导出）