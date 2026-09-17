# -*- coding: utf-8 -*-
"""OTA 更新服务（核心）。详见 spec/ota-protocol.v1.md。"""
from __future__ import annotations

import hashlib
import json
import re
import time
import zlib
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import JSONResponse, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models import OtaRelease, OtaReport
from app.schemas import OtaCheckResponse, OtaReportIn
from app.security import public_key_b64

router = APIRouter(prefix="/api/v1/ota", tags=["ota"])

PLATFORMS = {"android", "ios", "harmonyos", "windows", "macos", "linux"}
ARCHES = {"x86_64", "arm64", "armv7", "x86"}
CHANNELS = {"stable", "beta", "nightly"}
STORE_RESTRICTED = {"ios", "harmonyos"}  # 禁止自安装，必须走商店兜底

# 频率限制（默认关闭，避免影响自动化冒烟；生产建议开启）
_rate_limit: dict[str, float] = {}


def _parse_version(v: str) -> tuple[int, int, int]:
    nums: list[int] = []
    for part in re.split(r"[.\-+]", v)[:3]:
        m = re.match(r"\d+", part)
        nums.append(int(m.group()) if m else 0)
    while len(nums) < 3:
        nums.append(0)
    return tuple(nums)


def _cmp_version_build(v1: str, b1: int, v2: str, b2: int) -> int:
    """比较 (version, build)。返回 -1/0/1。"""
    a, b = _parse_version(v1), _parse_version(v2)
    if a != b:
        return -1 if a < b else 1
    if b1 != b2:
        return -1 if b1 < b2 else 1
    return 0


def _find_latest(db: Session, platform: str, channel: str, arch: str | None):
    """找到 (platform, channel) 下、匹配架构或通用的最新发布。"""
    rows = db.scalars(
        select(OtaRelease).where(
            OtaRelease.platform == platform, OtaRelease.channel == channel
        )
    ).all()
    # 优先精确架构，其次通用（arch 为空）
    matched = [r for r in rows if r.arch == arch] or [r for r in rows if (r.arch or "") == ""]
    if not matched:
        return None
    return max(matched, key=lambda r: (_parse_version(r.version), r.build))


def _build_artifact(release: OtaRelease) -> dict[str, Any] | None:
    if not release.artifact_type or not release.artifact_url:
        return None
    return {
        "type": release.artifact_type,
        "url": release.artifact_url,
        "size": release.artifact_size,
        "sha256": release.artifact_sha256,
        "signature": release.artifact_signature,
        "install_args": json.loads(release.artifact_install_args or "[]"),
    }


def _build_delta(release: OtaRelease) -> dict[str, Any] | None:
    if not release.delta_available:
        return None
    return {
        "available": True,
        "from_versions": json.loads(release.delta_from_versions or "[]"),
        "url": release.delta_url,
        "size": release.delta_size,
        "sha256": release.delta_sha256,
    }


@router.get("/check")
def ota_check(
    request: Request,
    platform: str = Query(...),
    arch: str = Query(...),
    channel: str = Query(...),
    version: str = Query(...),
    build: int = Query(...),
    device_id: str = Query(..., min_length=1, max_length=64),
    locale: str | None = Query(default=None),
    abi: str | None = Query(default=None),
    if_none_match: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    # 1. 入参校验
    if platform not in PLATFORMS or arch not in ARCHES or channel not in CHANNELS:
        return JSONResponse(status_code=400, content={"code": "invalid_platform"})

    # 2. 频率限制（可配置，默认关闭）
    if settings.ota_rate_limit_enabled:
        now = time.time()
        last = _rate_limit.get(device_id)
        if last and (now - last) < settings.ota_rate_limit_seconds:
            return JSONResponse(status_code=429, content={"code": "rate_limited"})
        _rate_limit[device_id] = now

    # 3. 查找最新发布
    release = _find_latest(db, platform, channel, arch)
    if release is None:
        return Response(status_code=204)

    # 4. 灰度放量：crc32(device_id) % 100 >= rollout_percent → 无更新
    bucket = _crc32(device_id) % 100
    if bucket >= release.rollout_percent:
        return Response(status_code=204)

    # 5. 版本比较与降级拦截
    cmp = _cmp_version_build(release.version, release.build, version, build)
    if cmp == 0:
        # 已是最新
        return Response(status_code=204)
    if cmp < 0:
        # 服务端最新版本/构建低于客户端：若同版本低构建则判定为降级拦截
        if _parse_version(release.version) == _parse_version(version):
            return JSONResponse(status_code=409, content={"code": "rollback_attempt"})
        # 否则视为客户端领先，无更新
        return Response(status_code=204)
    # cmp > 0：有更新

    # 6. ETag（= build），支持 If-None-Match → 304
    etag = str(release.build)
    if if_none_match and if_none_match.strip('"') == etag:
        return Response(status_code=304, headers={"ETag": etag})

    # 7. 组装响应
    policy = "forced" if _cmp_version_build(version, build, release.min_supported_version, 0) < 0 else "suggest"

    release_out = {
        "version": release.version,
        "build": release.build,
        "channel": release.channel,
        "released_at": release.released_at,
        "min_supported_version": release.min_supported_version,
        "notes_i18n": json.loads(release.notes_i18n or "{}"),
        "artifact": _build_artifact(release),
        "delta": _build_delta(release),
    }

    store_fallback = None
    if platform in STORE_RESTRICTED:
        # 平台红线：iOS / HarmonyOS 严禁自安装，一律降级为跳转商店
        policy = "suggest"
        release_out["artifact"] = None
        store_fallback = {
            "enabled": True,
            "url": release.store_url or _default_store_url(platform),
            "reason": "platform_restricted",
        }
    elif release_out["artifact"] is None:
        # 桌面/安卓本应自安装却无产物 → 404
        return JSONResponse(status_code=404, content={"code": "no_artifact"})

    body = OtaCheckResponse(
        has_update=True,
        policy=policy,
        release=release_out,
        store_fallback=store_fallback,
    )
    return JSONResponse(content=body.model_dump(mode="json"), headers={"ETag": etag})


def _crc32(s: str) -> int:
    # 使用 zlib 的 crc32（与协议示例一致）
    return zlib.crc32(s.encode("utf-8")) & 0xFFFFFFFF


def _default_store_url(platform: str) -> str:
    if platform == "ios":
        return "https://apps.apple.com/app/id0000000000"
    return "store://appgallery.huawei.com"


@router.post("/report", status_code=202)
def ota_report(payload: OtaReportIn, db: Session = Depends(get_db)):
    report = OtaReport(
        device_id=payload.device_id,
        platform=payload.platform,
        version=payload.version,
        build=payload.build,
        event=payload.event,
        reason=payload.reason,
        elapsed_ms=payload.elapsed_ms,
    )
    db.add(report)
    db.commit()
    return {"ok": True, "message": "accepted"}


@router.get("/public-key")
def ota_public_key():
    """返回 base64 编码的 Ed25519 原始公钥。"""
    return {"algorithm": "ed25519", "key": public_key_b64()}
