# -*- coding: utf-8 -*-
"""用户态接口：收藏与观看历史（bearerAuth）。"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import UserFavorite, UserHistory
from app.schemas import FavoriteIn, HistoryIn, SimpleMsg

router = APIRouter(prefix="/api/v1/user", tags=["user"])


def _require_user(authorization: str | None = Header(default=None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="missing_token")
    token = authorization[len("Bearer "):].strip()
    if not token:
        raise HTTPException(status_code=401, detail="empty_token")
    # 简化处理：以 token 本身作为用户标识（生产环境应替换为 JWT 解析出的 sub）
    return token


@router.get("/favorites", response_model=dict)
def list_favorites(user_id: str = Depends(_require_user), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(UserFavorite).where(UserFavorite.user_id == user_id).order_by(UserFavorite.created_at.desc())
    ).all()
    return {"items": [{"series_id": r.series_id, "created_at": r.created_at.isoformat()} for r in rows]}


@router.post("/favorites", status_code=201, response_model=SimpleMsg)
def add_favorite(
    payload: FavoriteIn, user_id: str = Depends(_require_user), db: Session = Depends(get_db)
):
    exists = db.scalar(
        select(UserFavorite).where(
            UserFavorite.user_id == user_id, UserFavorite.series_id == payload.series_id
        )
    )
    if not exists:
        db.add(UserFavorite(user_id=user_id, series_id=payload.series_id))
        db.commit()
    return SimpleMsg(ok=True, message="favorited")


@router.get("/history", response_model=dict)
def list_history(user_id: str = Depends(_require_user), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(UserHistory).where(UserHistory.user_id == user_id).order_by(UserHistory.updated_at.desc())
    ).all()
    return {
        "items": [
            {
                "series_id": r.series_id,
                "episode_id": r.episode_id,
                "position_sec": r.position_sec,
                "updated_at": r.updated_at.isoformat(),
            }
            for r in rows
        ]
    }


@router.post("/history", status_code=201, response_model=SimpleMsg)
def add_history(
    payload: HistoryIn, user_id: str = Depends(_require_user), db: Session = Depends(get_db)
):
    row = db.scalar(
        select(UserHistory).where(
            UserHistory.user_id == user_id, UserHistory.series_id == payload.series_id
        )
    )
    if row:
        row.episode_id = payload.episode_id
        row.position_sec = payload.position_sec
    else:
        db.add(
            UserHistory(
                user_id=user_id,
                series_id=payload.series_id,
                episode_id=payload.episode_id,
                position_sec=payload.position_sec,
            )
        )
    db.commit()
    return SimpleMsg(ok=True, message="recorded")
