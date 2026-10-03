# -*- coding: utf-8 -*-
"""数据库 ORM 模型（SQLAlchemy 2.0 风格）。"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    icon: Mapped[str | None] = mapped_column(String(256), nullable=True)


class Series(Base):
    __tablename__ = "series"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    original_title: Mapped[str | None] = mapped_column(String(256), nullable=True)
    cover: Mapped[str] = mapped_column(String(512), nullable=False, default="")
    poster: Mapped[str | None] = mapped_column(String(512), nullable=True)
    banner: Mapped[str | None] = mapped_column(String(512), nullable=True)
    synopsis: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # JSON 字符串存储 tags 列表
    tags: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    category_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    region: Mapped[str] = mapped_column(String(16), nullable=False, default="CN")
    release_year: Mapped[int] = mapped_column(Integer, nullable=False, default=2024)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="ongoing")
    total_episodes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    score: Mapped[float] = mapped_column(default=0.0)
    views: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_vip: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    age_rating: Mapped[str] = mapped_column(String(8), nullable=False, default="all")

    episodes: Mapped[list["Episode"]] = relationship(
        back_populates="series", cascade="all, delete-orphan", order_by="Episode.index"
    )


class Episode(Base):
    __tablename__ = "episodes"

    id: Mapped[str] = mapped_column(String(48), primary_key=True)
    series_id: Mapped[str] = mapped_column(ForeignKey("series.id", ondelete="CASCADE"), nullable=False)
    index: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(256), nullable=False, default="")
    thumbnail: Mapped[str | None] = mapped_column(String(512), nullable=True)
    duration_sec: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_free: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # JSON 字符串存储 sources / subtitles
    sources: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    subtitles: Mapped[str] = mapped_column(Text, nullable=False, default="[]")

    series: Mapped["Series"] = relationship(back_populates="episodes")


class OtaRelease(Base):
    """一次 OTA 发布记录（按 platform + channel + arch 唯一标识最新版）。"""

    __tablename__ = "ota_releases"
    __table_args__ = (
        UniqueConstraint("platform", "channel", "arch", name="uq_ota_platform_channel_arch"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    platform: Mapped[str] = mapped_column(String(16), nullable=False)
    # arch 为空表示全架构通用；否则限定具体架构
    arch: Mapped[str | None] = mapped_column(String(16), nullable=True)
    channel: Mapped[str] = mapped_column(String(16), nullable=False, default="stable")
    version: Mapped[str] = mapped_column(String(32), nullable=False)
    build: Mapped[int] = mapped_column(Integer, nullable=False)
    released_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    min_supported_version: Mapped[str] = mapped_column(String(32), nullable=False, default="0.0.0")
    # notes_i18n JSON：{ "zh-CN": "...", "en": "..." }
    notes_i18n: Mapped[str] = mapped_column(Text, nullable=False, default="{}")

    # 产物信息
    artifact_type: Mapped[str | None] = mapped_column(String(16), nullable=True)
    artifact_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    artifact_size: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    artifact_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    artifact_signature: Mapped[str | None] = mapped_column(String(256), nullable=True)
    # install_args JSON 列表（服务端白名单校验）
    artifact_install_args: Mapped[str] = mapped_column(Text, nullable=False, default="[]")

    # 差量更新
    delta_available: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    delta_from_versions: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    delta_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    delta_size: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    delta_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # 商店兜底（iOS / HarmonyOS 必填）
    store_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    rollout_percent: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class OtaReport(Base):
    """OTA 上报事件落库。"""

    __tablename__ = "ota_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    device_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    platform: Mapped[str] = mapped_column(String(16), nullable=False)
    version: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    build: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    event: Mapped[str] = mapped_column(String(16), nullable=False)
    reason: Mapped[str | None] = mapped_column(String(64), nullable=True)
    elapsed_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class UserFavorite(Base):
    __tablename__ = "user_favorites"
    __table_args__ = (UniqueConstraint("user_id", "series_id", name="uq_fav_user_series"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    series_id: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class UserHistory(Base):
    __tablename__ = "user_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    series_id: Mapped[str] = mapped_column(String(32), nullable=False)
    episode_id: Mapped[str | None] = mapped_column(String(48), nullable=True)
    position_sec: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
