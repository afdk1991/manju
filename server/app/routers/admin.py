# -*- coding: utf-8 -*-
"""运营后台接口：发布 OTA 版本（X-Admin-Key 鉴权）。"""
from __future__ import annotations

import json
import re

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models import Category, Episode, OtaRelease, Series, OtaReport
from app.schemas import (
    AdminReleaseIn,
    AdminSeriesIn,
    EpisodeAddIn,
    SimpleMsg,
)
from app.security import sign_release

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])

PLATFORMS = {"android", "ios", "harmonyos", "windows", "macos", "linux"}
ARCHES = {"x86_64", "arm64", "armv7", "x86"}
CHANNELS = {"stable", "beta", "nightly"}

# install_args 白名单：仅允许安全字符，禁止 shell 注入与路径穿越
_INSTALL_ARG_RE = re.compile(r"^[A-Za-z0-9_/:=.\-\s\\]+$")


def _validate_install_args(args: list[str] | None) -> list[str]:
    out: list[str] = []
    for a in args or []:
        if not isinstance(a, str) or len(a) > 256:
            raise HTTPException(status_code=400, detail="invalid_install_args")
        if ".." in a or not _INSTALL_ARG_RE.match(a):
            raise HTTPException(status_code=400, detail="install_args_rejected")
        out.append(a)
    return out


def _require_admin(x_admin_key: str | None = Header(default=None)):
    if not x_admin_key or x_admin_key != settings.admin_key:
        raise HTTPException(status_code=401, detail="unauthorized")
    return x_admin_key


@router.post("/releases", status_code=201, response_model=SimpleMsg)
def create_release(
    payload: AdminReleaseIn,
    db: Session = Depends(get_db),
    _: str = Depends(_require_admin),
):
    if payload.platform not in PLATFORMS:
        raise HTTPException(status_code=400, detail="invalid_platform")
    if payload.arch is not None and payload.arch not in ARCHES:
        raise HTTPException(status_code=400, detail="invalid_arch")
    if payload.channel not in CHANNELS:
        raise HTTPException(status_code=400, detail="invalid_channel")

    artifact = payload.artifact or {}
    install_args = _validate_install_args(artifact.get("install_args"))

    artifact_type = artifact.get("type")
    artifact_url = artifact.get("url")
    artifact_sha256 = artifact.get("sha256")
    artifact_signature = None
    if artifact_type and artifact_url and artifact_sha256:
        # 服务端用私钥对产物做规范化签名（客户端内置公钥验签）
        artifact_signature = sign_release(
            payload.version, payload.build, artifact_sha256, artifact_url
        )

    delta = payload.delta or {}
    delta_available = bool(delta.get("available"))

    # 同 (platform, channel, arch) 唯一：存在则更新，保证其为「最新」
    existing = db.scalar(
        select(OtaRelease).where(
            OtaRelease.platform == payload.platform,
            OtaRelease.channel == payload.channel,
            OtaRelease.arch == payload.arch,
        )
    )
    if existing:
        existing.version = payload.version
        existing.build = payload.build
        existing.released_at = None  # 由 DB 触发默认？这里显式置为当前时间
        from datetime import datetime, timezone

        existing.released_at = datetime.now(timezone.utc)
        existing.min_supported_version = payload.min_supported_version
        existing.notes_i18n = json.dumps(payload.notes_i18n, ensure_ascii=False)
        existing.artifact_type = artifact_type
        existing.artifact_url = artifact_url
        existing.artifact_size = int(artifact.get("size", 0) or 0)
        existing.artifact_sha256 = artifact_sha256
        existing.artifact_signature = artifact_signature
        existing.artifact_install_args = json.dumps(install_args, ensure_ascii=False)
        existing.delta_available = delta_available
        existing.delta_from_versions = json.dumps(delta.get("from_versions", []), ensure_ascii=False)
        existing.delta_url = delta.get("url")
        existing.delta_size = int(delta.get("size", 0) or 0)
        existing.delta_sha256 = delta.get("sha256")
        existing.store_url = payload.store_url
        existing.rollout_percent = payload.rollout_percent
        release = existing
    else:
        release = OtaRelease(
            platform=payload.platform,
            arch=payload.arch,
            channel=payload.channel,
            version=payload.version,
            build=payload.build,
            min_supported_version=payload.min_supported_version,
            notes_i18n=json.dumps(payload.notes_i18n, ensure_ascii=False),
            artifact_type=artifact_type,
            artifact_url=artifact_url,
            artifact_size=int(artifact.get("size", 0) or 0),
            artifact_sha256=artifact_sha256,
            artifact_signature=artifact_signature,
            artifact_install_args=json.dumps(install_args, ensure_ascii=False),
            delta_available=delta_available,
            delta_from_versions=json.dumps(delta.get("from_versions", []), ensure_ascii=False),
            delta_url=delta.get("url"),
            delta_size=int(delta.get("size", 0) or 0),
            delta_sha256=delta.get("sha256"),
            store_url=payload.store_url,
            rollout_percent=payload.rollout_percent,
        )
        db.add(release)

    db.commit()
    return SimpleMsg(ok=True, message=f"released {payload.platform}/{payload.version} build {payload.build}")


# ---------- 内容管理（运营后台 CRUD） ----------
@router.post("/series", status_code=201, response_model=SimpleMsg)
def create_series(
    payload: AdminSeriesIn,
    db: Session = Depends(get_db),
    _: str = Depends(_require_admin),
):
    # 生成稳定 ID
    last = db.scalar(select(func.max(Series.id)).where(Series.id.like("s_%")))
    num = int(str(last)[2:]) + 1 if last else 10001
    series_id = f"s_{num}"
    s = Series(
        id=series_id,
        title=payload.title,
        original_title=payload.original_title,
        cover=payload.cover or "https://example.com/cover/default.jpg",
        poster=payload.poster,
        banner=payload.banner,
        synopsis=payload.synopsis,
        tags=json.dumps(payload.tags, ensure_ascii=False),
        category_id=payload.category_id,
        region=payload.region,
        release_year=payload.release_year,
        status=payload.status,
        total_episodes=payload.total_episodes,
        score=payload.score,
        views=payload.views,
        is_vip=payload.is_vip,
        age_rating=payload.age_rating,
    )
    db.add(s)
    db.commit()
    return SimpleMsg(ok=True, message=f"created {series_id}")


@router.delete("/series/{series_id}", response_model=SimpleMsg)
def delete_series(
    series_id: str,
    db: Session = Depends(get_db),
    _: str = Depends(_require_admin),
):
    s = db.get(Series, series_id)
    if not s:
        raise HTTPException(status_code=404, detail="series_not_found")
    db.delete(s)
    db.commit()
    return SimpleMsg(ok=True, message=f"deleted {series_id}")


@router.post("/series/{series_id}/episodes", status_code=201, response_model=SimpleMsg)
def add_episodes(
    series_id: str,
    payload: EpisodeAddIn,
    db: Session = Depends(get_db),
    _: str = Depends(_require_admin),
):
    s = db.get(Series, series_id)
    if not s:
        raise HTTPException(status_code=404, detail="series_not_found")
    start = (db.scalar(
        select(func.max(Episode.index)).where(Episode.series_id == series_id)
    ) or 0) + 1
    for i in range(start, start + payload.count):
        sources = [{"quality": payload.quality, "url": payload.url, "container": "hls", "codec": "h264"}]
        db.add(
            Episode(
                id=f"{series_id}_e{i:03d}",
                series_id=series_id,
                index=i,
                title=f"第{i}集",
                duration_sec=240,
                is_free=(i <= 3),
                sources=json.dumps(sources, ensure_ascii=False),
                subtitles="[]",
            )
        )
    s.total_episodes = start + payload.count - 1
    db.commit()
    return SimpleMsg(ok=True, message=f"added {payload.count} episodes")


@router.get("/releases", response_model=dict)
def list_releases(db: Session = Depends(get_db), _: str = Depends(_require_admin)):
    rows = db.scalars(select(OtaRelease).order_by(OtaRelease.id.desc())).all()
    items = [
        {
            "platform": r.platform,
            "arch": r.arch,
            "channel": r.channel,
            "version": r.version,
            "build": r.build,
            "rollout_percent": r.rollout_percent,
            "min_supported_version": r.min_supported_version,
            "released_at": r.released_at.isoformat() if r.released_at else None,
        }
        for r in rows
    ]
    return {"items": items, "total": len(items)}


@router.get("/reports/stats", response_model=dict)
def report_stats(db: Session = Depends(get_db), _: str = Depends(_require_admin)):
    from sqlalchemy import func

    total = db.scalar(select(func.count()).select_from(OtaReport)) or 0
    by_event = dict(
        db.execute(
            select(OtaReport.event, func.count()).group_by(OtaReport.event)
        ).all()
    )
    by_platform = dict(
        db.execute(
            select(OtaReport.platform, func.count()).group_by(OtaReport.platform)
        ).all()
    )
    return {"total": total, "by_event": by_event, "by_platform": by_platform}
