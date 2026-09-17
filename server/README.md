# 漫剧后端服务（manju server）

漫剧（漫画改编短剧 / 竖屏短剧）的内容中台与 OTA 更新服务。覆盖 6 端：Android / iOS / HarmonyOS / Windows / macOS / Linux。

技术栈：Python 3.13 + FastAPI + SQLAlchemy 2.0 + Pydantic v2 + SQLite（可切 PostgreSQL）+ Uvicorn。

> 接口契约以 `../spec/openapi.yaml` 与 `../spec/ota-protocol.v1.md` 为单一事实来源，字段名 / 枚举值 / 错误码不得自行更改。

## 1. 目录结构

```
server/
├── app/
│   ├── main.py            # 入口：FastAPI 应用、路由装配、静态文件、CORS、lifespan 建表
│   ├── config.py          # pydantic-settings 配置（环境变量）
│   ├── db.py              # 引擎 / Session / Base / get_db / init_db
│   ├── models.py          # ORM 模型
│   ├── schemas.py         # Pydantic v2 请求/响应模型
│   ├── serializers.py     # ORM -> 响应字典（处理 JSON 字符串列）
│   ├── security.py        # Ed25519 签名 / 公钥加载（读 ../keys/*.pem）
│   ├── routers/
│   │   ├── content.py     # 内容中台
│   │   ├── ota.py         # OTA 检查 / 上报 / 公钥
│   │   ├── user.py        # 收藏 / 历史
│   │   └── admin.py       # 发布 OTA / 内容 CRUD / 统计
│   └── services/sources/  # 内容源策略（internal / user_defined / third_party）
├── seed/seed.py           # 演示数据 + 发布 windows/ios 9.9.9
├── admin/index.html       # 运营后台单页（原生 JS，无需构建）
└── data/                  # SQLite 库与产物目录（运行时生成，已 gitignore）
    ├── manju.db
    └── artifacts/
```

## 2. 启动方式

```bash
# 依赖（已装在项目 venv 中）
PY=~/.workbuddy/binaries/python/envs/manju/Scripts/python.exe
# 若需重装：
$PY -m pip install -i https://pypi.tuna.tsinghua.edu.cn/simple \
     fastapi uvicorn sqlalchemy pydantic-settings python-multipart python-jose cryptography requests

# 1) 初始化演示数据（建库 + 写入 ≥20 部漫剧 + 发布 windows/ios 9.9.9）
cd server
PYTHONPATH="$PWD" $PY seed/seed.py

# 2) 启动服务
PYTHONPATH="$PWD" $PY -m uvicorn app.main:app --host 0.0.0.0 --port 8000
# 或： $PY app/main.py
```

启动后访问：
- 接口根：`http://localhost:8000`
- 健康检查：`GET /healthz`
- 运营后台：`GET /admin`
- 产物静态分发：`GET /files/{filename}`（对应 `server/data/artifacts/`）
- 交互式文档（FastAPI 自带）：`/docs`、`/redoc`

> 注意：本机若设置了 `HTTP_PROXY`，调用本地接口时请加 `no_proxy=127.0.0.1,localhost` 以免代理拦截。

## 3. 环境变量（前缀 `MANJU_`，见 `app/config.py`）

| 变量 | 说明 | 默认 |
|---|---|---|
| `MANJU_DATABASE_URL` | 数据库连接；切 PostgreSQL 改这里 | `sqlite:///server/data/manju.db` |
| `MANJU_OTA_KEYS_DIR` | Ed25519 密钥目录（含 `ota_private.pem`/`ota_public.pem`） | 项目根 `keys/` |
| `MANJU_ADMIN_KEY` | 运营后台 / 发布接口鉴权（`X-Admin-Key`） | `manju-dev-admin-key` |
| `MANJU_JWT_SECRET` | 用户态 bearer 密钥 | 开发默认值 |
| `MANJU_CONTENT_SOURCE` | 内容源策略：`internal`/`user_defined`/`third_party` | `internal` |
| `MANJU_USER_DEFINED_BASE_URL` | user_defined 模式上游地址（须 https，经白名单/SSRF 校验） | 空 |
| `MANJU_USER_DEFINED_ALLOWLIST` | user_defined 允许的主机白名单（逗号分隔） | 空 |
| `MANJU_THIRD_PARTY_BASE_URL` | third_party 已签约上游地址 | 空 |
| `MANJU_OTA_RATE_LIMIT_ENABLED` | OTA 检查频率限制（默认关闭） | `false` |
| `MANJU_CORS_ALLOW_ORIGINS` | CORS 来源（`*` 或逗号分隔） | `*` |

## 4. 接口清单

### 内容中台（tag: content）
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/home` | 首页推荐分区（swipe/grid/rank） |
| GET | `/api/v1/categories` | 分类列表 |
| GET | `/api/v1/series` | 剧集分页+筛选（category_id/tag/status）+排序（hot/new/score/views） |
| GET | `/api/v1/series/{id}` | 剧集详情（含 episodes） |
| GET | `/api/v1/series/{id}/episodes` | 分集列表 |
| GET | `/api/v1/episodes/{id}` | 单集详情 |
| GET | `/api/v1/search?q=` | 搜索剧集 |

### OTA（tag: ota）
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/ota/check` | 检查更新（入参校验/灰度/强制/降级拦截/iOS&鸿蒙红线/ETag） |
| POST | `/api/v1/ota/report` | 上报事件（downloaded/installed/failed/skipped/unsupported）→ 202 |
| GET | `/api/v1/ota/public-key` | 返回 base64 Ed25519 公钥 |

### 用户态（tag: user，需 `Authorization: Bearer <token>`）
| 方法 | 路径 | 说明 |
|---|---|---|
| GET/POST | `/api/v1/user/favorites` | 收藏列表 / 新增 |
| GET/POST | `/api/v1/user/history` | 观看历史列表 / 记录 |

### 运营后台（tag: admin，需 `X-Admin-Key`）
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/v1/admin/releases` | 发布新版本 → 201 |
| GET | `/api/v1/admin/releases` | 已发布版本列表 |
| POST | `/api/v1/admin/series` | 新建剧集 → 201 |
| DELETE | `/api/v1/admin/series/{id}` | 删除剧集 |
| POST | `/api/v1/admin/series/{id}/episodes` | 追加分集 |
| GET | `/api/v1/admin/reports/stats` | OTA 上报统计 |

## 5. OTA 关键行为（对齐 ota-protocol.v1.md）

- **灰度**：`crc32(device_id) % 100 >= rollout_percent` → `204 No Content`。
- **强制更新**：客户端版本低于 `min_supported_version` → `policy="forced"`。
- **降级拦截**：同版本、服务端构建号低于客户端 → `409 {"code":"rollback_attempt"}`。
- **平台红线**：`platform=ios|harmonyos` 时 `policy` 降级为 `suggest`，响应必带 `store_fallback(enabled=true, reason="platform_restricted")`，且**不返回可自安装产物**。
- **ETag**：`ETag = release.build`，支持 `If-None-Match` → `304`。
- **签名**：发布时服务端用 `ota_private.pem` 对 `version|build|sha256|url` 做 Ed25519 签名，写入 `artifact.signature`（`ed25519:<base64>`），客户端用内置公钥验签。
- **install_args 白名单**：服务端校验安装参数，拒绝含 shell 注入/路径穿越的字符。
- 错误码：`400 invalid_platform` / `404 no_artifact` / `409 rollback_attempt` / `429 rate_limited`。

## 6. 内容源策略（策略模式）

由 `MANJU_CONTENT_SOURCE` 切换，工厂见 `app/services/sources/factory.py`：
- `internal`：自建 CMS，直接读写本地库（默认，完整 CRUD）。
- `user_defined`：用户提供接口地址，服务端**白名单 + https + 防 SSRF（内网/回环拦截）**校验后代理转发，**不含有任何抓取盗版站点的逻辑**。
- `third_party`：已签约第三方 API，字段映射为本平台 schema。
