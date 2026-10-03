# -*- coding: utf-8 -*-
"""Pydantic v2 响应 / 请求模型（对齐 spec/openapi.yaml）。"""
from __future__ import annotations

import json
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


# ---------- 内容中台 ----------
class VideoSource(BaseModel):
    quality: str = "auto"
    url: str
    container: str = "hls"
    codec: str | None = None
    bitrate_kbps: int | None = None
    size_bytes: int | None = None


class SubtitleTrack(BaseModel):
    lang: str
    label: str
    url: str
    format: str = "vtt"
    is_default: bool = False


class SeriesBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    original_title: str | None = None
    cover: str = ""
    poster: str | None = None
    banner: str | None = None
    synopsis: str = ""
    tags: list[str] = Field(default_factory=list)
    category_id: str | None = None
    region: str = "CN"
    release_year: int = 2024
    status: str = "ongoing"
    total_episodes: int = 0
    score: float = 0.0
    views: int = 0
    is_vip: bool = False
    age_rating: str = "all"


class Episode(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    series_id: str
    index: int
    title: str = ""
    thumbnail: str | None = None
    duration_sec: int = 0
    is_free: bool = True
    sources: list[VideoSource] = Field(default_factory=list)
    subtitles: list[SubtitleTrack] = Field(default_factory=list)


class Series(SeriesBase):
    episodes: list[Episode] = Field(default_factory=list)


class HomeSection(BaseModel):
    id: str
    title: str
    layout: str = "grid"
    items: list[SeriesBase] = Field(default_factory=list)


class CategoryOut(BaseModel):
    id: str
    name: str
    icon: str | None = None


class Page(BaseModel):
    page: int
    size: int
    total: int
    has_more: bool


class SeriesListResp(BaseModel):
    items: list[SeriesBase] = Field(default_factory=list)
    page: Page


class EpisodeListResp(BaseModel):
    items: list[Episode] = Field(default_factory=list)


class SearchResp(BaseModel):
    items: list[SeriesBase] = Field(default_factory=list)
    page: Page


# ---------- OTA ----------
class Artifact(BaseModel):
    type: str
    url: str
    size: int = 0
    sha256: str | None = None
    signature: str | None = None
    install_args: list[str] = Field(default_factory=list)


class Delta(BaseModel):
    available: bool = False
    from_versions: list[str] = Field(default_factory=list)
    url: str | None = None
    size: int = 0
    sha256: str | None = None


class OtaReleaseOut(BaseModel):
    version: str
    build: int
    channel: str = "stable"
    released_at: datetime
    min_supported_version: str = "0.0.0"
    notes_i18n: dict[str, str] = Field(default_factory=dict)
    artifact: Artifact | None = None
    delta: Delta | None = None


class StoreFallback(BaseModel):
    enabled: bool = False
    url: str | None = None
    reason: str | None = None


class OtaCheckResponse(BaseModel):
    has_update: bool = True
    policy: str = "suggest"
    release: OtaReleaseOut | None = None
    store_fallback: StoreFallback | None = None


class OtaReportIn(BaseModel):
    device_id: str
    platform: str
    version: str = ""
    build: int = 0
    event: str  # downloaded | installed | failed | skipped | unsupported
    reason: str | None = None
    elapsed_ms: int = 0


# ---------- 管理后台发布 ----------
class AdminSeriesIn(BaseModel):
    title: str
    original_title: str | None = None
    cover: str = ""
    poster: str | None = None
    banner: str | None = None
    synopsis: str = ""
    tags: list[str] = Field(default_factory=list)
    category_id: str | None = None
    region: str = "CN"
    release_year: int = 2024
    status: str = "ongoing"
    total_episodes: int = 0
    score: float = 0.0
    views: int = 0
    is_vip: bool = False
    age_rating: str = "all"


class EpisodeAddIn(BaseModel):
    count: int = 1
    quality: str = "auto"
    url: str = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8"


class AdminReleaseIn(BaseModel):
    platform: str
    arch: str | None = None
    channel: str = "stable"
    version: str
    build: int
    min_supported_version: str = "0.0.0"
    notes_i18n: dict[str, str] = Field(default_factory=dict)
    artifact: dict | None = None  # 含 type/url/size/sha256/install_args
    store_url: str | None = None
    rollout_percent: int = Field(default=100, ge=0, le=100)
    delta: dict | None = None  # 含 available/from_versions/url/size/sha256


# ---------- 用户态 ----------
class FavoriteIn(BaseModel):
    series_id: str


class HistoryIn(BaseModel):
    series_id: str
    episode_id: str | None = None
    position_sec: int = 0


class SimpleMsg(BaseModel):
    ok: bool = True
    message: str = ""
