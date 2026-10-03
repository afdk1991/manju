# -*- coding: utf-8 -*-
"""服务端配置（环境变量驱动）。

所有可调项均可通过环境变量覆盖，便于本地开发与容器化部署。
"""
from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# server/ 目录（即本文件所在 app/ 的上一级）
SERVER_ROOT = Path(__file__).resolve().parent.parent
# 项目根（keys/ 所在目录）
PROJECT_ROOT = SERVER_ROOT.parent
# 默认密钥目录：项目根/keys
DEFAULT_KEYS_DIR = PROJECT_ROOT / "keys"
# 默认数据库与产物目录
DEFAULT_DATA_DIR = SERVER_ROOT / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="MANJU_", env_file=".env", extra="ignore")

    # 数据库连接。默认 SQLite，可切换为 PostgreSQL（DATABASE_URL=postgresql+psycopg://...）
    database_url: str = f"sqlite:///{DEFAULT_DATA_DIR / 'manju.db'}"

    # 签名密钥目录（Ed25519）
    ota_keys_dir: str = str(DEFAULT_KEYS_DIR)

    # 静态产物分发目录
    artifacts_dir: str = str(DEFAULT_DATA_DIR / "artifacts")

    # 管理后台密钥（X-Admin-Key 鉴权）
    admin_key: str = "manju-dev-admin-key"

    # JWT 密钥（用户态接口 bearerAuth）
    jwt_secret: str = "manju-dev-jwt-secret-change-me"
    jwt_algorithm: str = "HS256"

    # 内容源策略：internal（自建 CMS，默认）/ user_defined / third_party
    content_source: str = "internal"

    # user_defined 模式下用户提交的上游接口地址（https，需通过白名单校验）
    user_defined_base_url: str = ""
    # user_defined 模式下允许的 upstream 域名白名单（逗号分隔，仅 https + 公网）
    user_defined_allowlist: str = ""

    # third_party 授权的上游地址
    third_party_base_url: str = ""

    # OTA 检查频率限制（默认关闭，避免影响自动化冒烟；生产建议开启）
    ota_rate_limit_enabled: bool = False
    ota_rate_limit_seconds: int = 21600  # 6h

    # CORS 允许的源（逗号分隔），默认放开便于本地多端联调
    cors_allow_origins: str = "*"

    @property
    def user_defined_allowlist_list(self) -> list[str]:
        return [d.strip() for d in self.user_defined_allowlist.split(",") if d.strip()]

    @property
    def cors_allow_origins_list(self) -> list[str]:
        raw = self.cors_allow_origins.strip()
        if raw == "*":
            return ["*"]
        return [o.strip() for o in raw.split(",") if o.strip()]


settings = Settings()
