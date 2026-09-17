# -*- coding: utf-8 -*-
"""内容中台路由（对齐 spec/openapi.yaml）。"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas import (
    EpisodeListResp,
    HomeSection,
    Page,
    SearchResp,
    Series,
    SeriesBase,
    SeriesListResp,
)
from app.serializers import episode_to_dict, series_full_to_dict, series_to_dict
from app.services.sources.factory import get_source

router = APIRouter(prefix="/api/v1", tags=["content"])


def _page(page: int, size: int, total: int) -> Page:
    return Page(page=page, size=size, total=total, has_more=(page * size) < total)


@router.get("/home", response_model=dict)
def home(locale: str | None = Query(default=None)):
    db: Session = next(get_db())
    src = get_source()
    sections = src.home(db)
    # 将 ORM 对象转字典
    out = []
    for sec in sections:
        items = sec.get("items", [])
        out.append(
            HomeSection(
                id=sec["id"],
                title=sec["title"],
                layout=sec.get("layout", "grid"),
                items=[SeriesBase(**series_to_dict(i)) for i in items],
            )
        )
    return {"sections": [s.model_dump() for s in out]}


@router.get("/categories", response_model=dict)
def categories():
    db: Session = next(get_db())
    src = get_source()
    return {"items": src.categories(db)}


@router.get("/series", response_model=SeriesListResp)
def list_series(
    category_id: str | None = Query(default=None),
    tag: str | None = Query(default=None),
    status: str | None = Query(default=None),
    sort: str = Query(default="hot", pattern="^(hot|new|score|views)$"),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
):
    db: Session = next(get_db())
    src = get_source()
    rows, total = src.list_series(
        db, category_id=category_id, tag=tag, status=status, sort=sort, page=page, size=size
    )
    items = [SeriesBase(**series_to_dict(r)) for r in rows]
    return SeriesListResp(items=items, page=_page(page, size, total))


@router.get("/series/{series_id}", response_model=Series)
def get_series(series_id: str):
    db: Session = next(get_db())
    src = get_source()
    s = src.get_series(db, series_id)
    if s is None:
        raise HTTPException(status_code=404, detail="series_not_found")
    return Series(**series_full_to_dict(s))


@router.get("/series/{series_id}/episodes", response_model=EpisodeListResp)
def list_episodes(series_id: str):
    db: Session = next(get_db())
    src = get_source()
    rows = src.list_episodes(db, series_id)
    return EpisodeListResp(items=[episode_to_dict(e) for e in rows])


@router.get("/episodes/{episode_id}", response_model=dict)
def get_episode(episode_id: str):
    db: Session = next(get_db())
    src = get_source()
    e = src.get_episode(db, episode_id)
    if e is None:
        raise HTTPException(status_code=404, detail="episode_not_found")
    return episode_to_dict(e)


@router.get("/search", response_model=SearchResp)
def search(
    q: str = Query(..., min_length=1),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
):
    db: Session = next(get_db())
    src = get_source()
    rows, total = src.search(db, q, page=page, size=size)
    # 第三方/用户源可能直接返回 dict
    items = [SeriesBase(**series_to_dict(r)) if hasattr(r, "id") else SeriesBase(**r) for r in rows]
    return SearchResp(items=items, page=_page(page, size, total))
