# -*- coding: utf-8 -*-
"""ORM 模型 -> 响应字典 的序列化辅助（处理 JSON 字符串列）。"""
from __future__ import annotations

import json
from typing import Any

from app.models import Episode, Series


def _json_loads(s: str | None, default: Any = None) -> Any:
    if not s:
        return default if default is not None else []
    try:
        return json.loads(s)
    except (ValueError, TypeError):
        return default if default is not None else []


def series_to_dict(s: Series) -> dict:
    d = {
        "id": s.id,
        "title": s.title,
        "original_title": s.original_title,
        "cover": s.cover,
        "poster": s.poster,
        "banner": s.banner,
        "synopsis": s.synopsis,
        "tags": _json_loads(s.tags, []),
        "category_id": s.category_id,
        "region": s.region,
        "release_year": s.release_year,
        "status": s.status,
        "total_episodes": s.total_episodes,
        "score": s.score,
        "views": s.views,
        "is_vip": s.is_vip,
        "age_rating": s.age_rating,
    }
    return d


def series_full_to_dict(s: Series) -> dict:
    d = series_to_dict(s)
    d["episodes"] = [episode_to_dict(e) for e in s.episodes]
    return d


def episode_to_dict(e: Episode) -> dict:
    return {
        "id": e.id,
        "series_id": e.series_id,
        "index": e.index,
        "title": e.title,
        "thumbnail": e.thumbnail,
        "duration_sec": e.duration_sec,
        "is_free": e.is_free,
        "sources": _json_loads(e.sources, []),
        "subtitles": _json_loads(e.subtitles, []),
    }
