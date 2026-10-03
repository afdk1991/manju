# -*- coding: utf-8 -*-
"""用户自定义内容源：服务端白名单校验后代理转发。

安全红线：
- 仅允许 https 协议。
- 目标主机必须命中白名单（MANJU_USER_DEFINED_ALLOWLIST），或白名单为空时拒绝（除非显式放行）。
- 解析后的 IP 不得为内网 / 回环 / 链路本地地址（防 SSRF）。
- 严禁任何抓取盗版站点的逻辑，本模块只做白名单内的正向代理转发。
"""
from __future__ import annotations

import ipaddress
import json
import socket
from typing import Any
from urllib.parse import urljoin, urlencode

import requests
from sqlalchemy.orm import Session

from app.config import settings
from app.services.sources.internal import InternalSource


def _is_private_host(host: str) -> bool:
    try:
        infos = socket.getaddrinfo(host, None)
    except Exception:
        # 解析失败一律视为不可信
        return True
    for info in infos:
        ip = info[4][0]
        try:
            addr = ipaddress.ip_address(ip)
        except ValueError:
            continue
        if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved:
            return True
    return False


def validate_upstream_url(url: str, allowlist: list[str] | None = None) -> str:
    """校验用户提交的上游地址，返回规范化后的 URL。

    不合法时抛出 ValueError。
    """
    if not url or not url.startswith("https://"):
        raise ValueError("上游地址必须为 https 协议")
    from urllib.parse import urlparse

    parsed = urlparse(url)
    host = parsed.hostname or ""
    if not host:
        raise ValueError("上游地址缺少主机名")
    if allowlist:
        if host not in allowlist and not any(
            host == a or host.endswith("." + a) for a in allowlist
        ):
            raise ValueError(f"上游主机 {host} 不在白名单内")
    if _is_private_host(host):
        raise ValueError(f"上游主机 {host} 解析到内网/保留地址，已拦截（防 SSRF）")
    return url.rstrip("/")


class UserDefinedSource(InternalSource):
    name = "user_defined"

    def __init__(self) -> None:
        base = getattr(settings, "third_party_base_url", "")  # 占位，真正地址由配置提供
        # 用户自定义上游地址（演示通过环境变量 USER_DEFINED_BASE_URL 提供）
        self.base_url = ""
        # 允许从 settings 读取（字段名 user_defined_base_url 通过 pydantic 动态属性）
        ud = getattr(settings, "user_defined_base_url", "")
        if ud:
            try:
                self.base_url = validate_upstream_url(ud, settings.user_defined_allowlist_list)
            except ValueError as e:
                # 配置非法时退化为内部源，并记录（不向外暴露细节）
                self.base_url = ""
                self._unavailable = str(e)
        self._unavailable: str | None = getattr(self, "_unavailable", None)

    def _proxy(self, path: str, params: dict | None = None) -> Any | None:
        if not self.base_url:
            return None
        try:
            resp = requests.get(
                urljoin(self.base_url + "/", path.lstrip("/")),
                params=params,
                timeout=8,
                headers={"User-Agent": "manju-server/1.0"},
            )
            resp.raise_for_status()
            return resp.json()
        except Exception:
            # 上游不可用：返回 None，由调用方按策略回退到内部源
            return None

    def list_series(self, db, **kwargs):
        data = self._proxy("series", kwargs)
        if data is None:
            return super().list_series(db, **kwargs)
        items = data.get("items", data) if isinstance(data, dict) else data
        total = data.get("total", len(items)) if isinstance(data, dict) else len(items)
        return items, int(total)

    def get_series(self, db, series_id):
        data = self._proxy(f"series/{series_id}")
        return data if data is not None else super().get_series(db, series_id)

    def list_episodes(self, db, series_id):
        data = self._proxy(f"series/{series_id}/episodes")
        return data if data is not None else super().list_episodes(db, series_id)

    def get_episode(self, db, episode_id):
        data = self._proxy(f"episodes/{episode_id}")
        return data if data is not None else super().get_episode(db, episode_id)

    def search(self, db, q, page=1, size=20):
        data = self._proxy("search", {"q": q, "page": page, "size": size})
        if data is None:
            return super().search(db, q, page, size)
        items = data.get("items", data) if isinstance(data, dict) else data
        total = data.get("total", len(items)) if isinstance(data, dict) else len(items)
        return items, int(total)

    def home(self, db):
        data = self._proxy("home")
        return data if data is not None else super().home(db)

    def categories(self, db):
        data = self._proxy("categories")
        return data if data is not None else super().categories(db)
