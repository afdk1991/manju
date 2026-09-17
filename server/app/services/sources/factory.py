# -*- coding: utf-8 -*-
"""内容源工厂：根据 CONTENT_SOURCE 环境变量选择策略。"""
from __future__ import annotations

from app.config import settings
from app.services.sources.base import ContentSource
from app.services.sources.internal import InternalSource
from app.services.sources.third_party import ThirdPartySource
from app.services.sources.user_defined import UserDefinedSource

_SOURCE_CACHE: dict[str, ContentSource] = {}


def get_source() -> ContentSource:
    """返回当前配置的内容源实例（带简易缓存）。"""
    key = settings.content_source
    if key not in _SOURCE_CACHE:
        if key == "user_defined":
            _SOURCE_CACHE[key] = UserDefinedSource()
        elif key == "third_party":
            _SOURCE_CACHE[key] = ThirdPartySource()
        else:
            _SOURCE_CACHE[key] = InternalSource()
    return _SOURCE_CACHE[key]
