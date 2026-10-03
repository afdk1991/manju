# -*- coding: utf-8 -*-
"""内部内容源：自建 CMS，直接查询本地数据库（默认策略）。"""
from __future__ import annotations

import json
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Category, Episode, Series
from app.services.sources.base import ContentSource


class InternalSource(ContentSource):
    name = "internal"

    def _order_by(self, query, sort: str):
        if sort == "new":
            return query.order_by(Series.release_year.desc(), Series.id.desc())
        if sort == "score":
            return query.order_by(Series.score.desc(), Series.views.desc())
        if sort == "views":
            return query.order_by(Series.views.desc())
        # 默认 hot：综合评分 + 播放量
        return query.order_by((Series.score * 1000 + Series.views).desc())

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
    ) -> tuple[list[Series], int]:
        query = select(Series)
        if category_id:
            query = query.where(Series.category_id == category_id)
        if status:
            query = query.where(Series.status == status)
        if tag:
            # tags 以 JSON 字符串存储，使用 LIKE 做包含匹配
            query = query.where(Series.tags.like(f'%"{tag}"%'))
        total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
        query = self._order_by(query, sort)
        rows = db.scalars(query.offset((page - 1) * size).limit(size)).all()
        return list(rows), total

    def get_series(self, db: Session, series_id: str) -> Series | None:
        return db.get(Series, series_id)

    def list_episodes(self, db: Session, series_id: str) -> list[Episode]:
        return list(
            db.scalars(
                select(Episode)
                .where(Episode.series_id == series_id)
                .order_by(Episode.index)
            ).all()
        )

    def get_episode(self, db: Session, episode_id: str) -> Episode | None:
        return db.get(Episode, episode_id)

    def search(self, db: Session, q: str, page: int = 1, size: int = 20) -> tuple[list[Series], int]:
        like = f"%{q}%"
        query = select(Series).where(
            Series.title.like(like) | Series.synopsis.like(like) | Series.tags.like(f'%"{q}"%')
        )
        total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
        rows = db.scalars(query.order_by(Series.views.desc()).offset((page - 1) * size).limit(size)).all()
        return list(rows), total

    def home(self, db: Session) -> list[dict]:
        # 热门推荐（swipe）、高分榜（rank）、分类精选（grid）
        hot = db.scalars(
            select(Series).order_by((Series.score * 1000 + Series.views).desc()).limit(10)
        ).all()
        rank = db.scalars(select(Series).order_by(Series.score.desc()).limit(10)).all()
        # 按分类聚合（最多取 4 个分类）
        cats = db.scalars(select(Category)).all()
        sections: list[dict] = [
            {"id": "sec_hot", "title": "热门漫剧", "layout": "swipe", "items": [s for s in hot]},
            {"id": "sec_rank", "title": "高分榜", "layout": "rank", "items": [s for s in rank]},
        ]
        for cat in cats[:4]:
            rows = db.scalars(
                select(Series).where(Series.category_id == cat.id).order_by(Series.views.desc()).limit(8)
            ).all()
            sections.append(
                {"id": f"sec_cat_{cat.id}", "title": f"{cat.name}精选", "layout": "grid", "items": [s for s in rows]}
            )
        return sections

    def categories(self, db: Session) -> list[dict]:
        rows = db.scalars(select(Category).order_by(Category.id)).all()
        return [{"id": c.id, "name": c.name, "icon": c.icon} for c in rows]
