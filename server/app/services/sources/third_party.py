# -*- coding: utf-8 -*-
"""第三方授权内容源：调用已签约的第三方 API，并把其字段映射到本平台 schema。

与 user_defined 的区别：
- 目标地址固定为已签约的第三方（MANJU_THIRD_PARTY_BASE_URL），不接收任意用户提交地址。
- 需要把第三方的字段命名映射成本平台 OpenAPI 字段（见 FIELD_MAP）。
"""
from __future__ import annotations

import requests
from sqlalchemy.orm import Session

from app.config import settings
from app.services.sources.internal import InternalSource

# 第三方字段 -> 本平台字段
FIELD_MAP = {
    "name": "title",
    "poster_url": "cover",
    "desc": "synopsis",
    "category": "category_id",
    "year": "release_year",
    "rate": "score",
    "play_count": "views",
}


class ThirdPartySource(InternalSource):
    name = "third_party"

    def __init__(self) -> None:
        self.base_url = (settings.third_party_base_url or "").rstrip("/")
        self._session = requests.Session()
        self._session.headers.update({"User-Agent": "manju-server/1.0"})

    def _map_series(self, item: dict) -> dict:
        out: dict = {}
        for src, dst in FIELD_MAP.items():
            if src in item:
                out[dst] = item[src]
        # 透传本平台同名字段
        for k in ("id", "tags", "status", "is_vip", "age_rating", "total_episodes"):
            if k in item:
                out[k] = item[k]
        out.setdefault("title", item.get("title", item.get("name", "")))
        out.setdefault("cover", item.get("cover", item.get("poster_url", "")))
        out.setdefault("synopsis", item.get("synopsis", item.get("desc", "")))
        return out

    def _get(self, path: str, params: dict | None = None) -> dict | None:
        if not self.base_url:
            return None
        try:
            resp = self._session.get(
                f"{self.base_url}/{path.lstrip('/')}", params=params, timeout=8
            )
            resp.raise_for_status()
            return resp.json()
        except Exception:
            return None

    def list_series(self, db, **kwargs):
        data = self._get("series", kwargs)
        if data is None:
            return super().list_series(db, **kwargs)
        raw = data.get("items", data) if isinstance(data, dict) else data
        items = [self._map_series(x) for x in raw]
        total = data.get("total", len(items)) if isinstance(data, dict) else len(items)
        return items, int(total)

    def search(self, db, q, page=1, size=20):
        data = self._get("search", {"q": q, "page": page, "size": size})
        if data is None:
            return super().search(db, q, page, size)
        raw = data.get("items", data) if isinstance(data, dict) else data
        items = [self._map_series(x) for x in raw]
        total = data.get("total", len(items)) if isinstance(data, dict) else len(items)
        return items, int(total)

    def get_series(self, db, series_id):
        data = self._get(f"series/{series_id}")
        return self._map_series(data) if data is not None else super().get_series(db, series_id)

    def list_episodes(self, db, series_id):
        data = self._get(f"series/{series_id}/episodes")
        return data if data is not None else super().list_episodes(db, series_id)

    def get_episode(self, db, episode_id):
        data = self._get(f"episodes/{episode_id}")
        return data if data is not None else super().get_episode(db, episode_id)

    def home(self, db):
        data = self._get("home")
        return data if data is not None else super().home(db)

    def categories(self, db):
        data = self._get("categories")
        return data if data is not None else super().categories(db)
