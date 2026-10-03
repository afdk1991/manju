# -*- coding: utf-8 -*-
"""内容源适配器接口（策略模式）。

所有内容源（自建 CMS / 用户自定义接口 / 第三方授权 API）统一实现该抽象类，
由工厂根据 CONTENT_SOURCE 环境变量选择具体策略。
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from sqlalchemy.orm import Session


class ContentSource(ABC):
    """内容数据来源的统一抽象。"""

    name: str = "base"

    # ---- 列表 / 详情 ----
    @abstractmethod
    def list_series(
        self,
        db: Session,
        *,
        category_id: str | None = None,
        tag: str | None = None,
        status: str | None = None,
        sort: str = "hot",
        page: int = 1,
        size: int = 20,
    ) -> tuple[list[Any], int]:
        """返回 (列表数据, 总数)。"""

    @abstractmethod
    def get_series(self, db: Session, series_id: str) -> Any | None:
        ...

    @abstractmethod
    def list_episodes(self, db: Session, series_id: str) -> list[Any]:
        ...

    @abstractmethod
    def get_episode(self, db: Session, episode_id: str) -> Any | None:
        ...

    @abstractmethod
    def search(self, db: Session, q: str, page: int = 1, size: int = 20) -> tuple[list[Any], int]:
        ...

    @abstractmethod
    def home(self, db: Session) -> list[dict]:
        """返回首页分区列表（每个分区含 items）。"""

    @abstractmethod
    def categories(self, db: Session) -> list[dict]:
        ...
