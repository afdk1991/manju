#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
漫剧 Manju —— EdgeOne Makers 静态数据导出器

读取本地 server/data/manju.db（与现有 FastAPI 版同一数据源），
导出 EdgeOne Makers 部署所需的全部静态资源：

  makers/static/api/v1/...           内容 API 静态 JSON（CDN 边缘加速，路径与客户端协议完全一致）
  makers/static/files/...            OTA 安装包（占位）
  makers/static/admin/index.html     运营后台（静态只读版）
  makers/data/releases.json          OTA 发布记录（供 Cloud Functions 读取，含本地 Ed25519 签名）
  makers/data/series_index.json      全量剧集索引（供搜索函数读取）

用法（项目根目录执行）：
    python makers/scripts/export_static.py [--public-base https://你的域名]
"""
from __future__ import annotations

import argparse
import base64
import json
import shutil
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent   # 项目根
SERVER_DIR = PROJECT_ROOT / "server"
MAKERS_DIR = PROJECT_ROOT / "makers"
STATIC_DIR = MAKERS_DIR / "static"
DATA_DIR = MAKERS_DIR / "data"
KEYS_DIR = PROJECT_ROOT / "keys"

sys.path.insert(0, str(SERVER_DIR))
sys.path.insert(0, str(SERVER_DIR / "app"))

from app.db import SessionLocal  # noqa: E402
from app.models import Category, Episode, OtaRelease, Series  # noqa: E402
from app.serializers import (  # noqa: E402
    episode_to_dict,
    series_to_dict,
)
from app.security import raw_public_key_bytes  # noqa: E402


def w(path: Path, obj) -> None:
    """写 JSON 文件（ensure_ascii=False，便于阅读）。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"  ✓ {path.relative_to(PROJECT_ROOT)}")


def export_content(db) -> None:
    """内容 API 静态化：home / categories / series 列表 / 单剧 / 分集 / 单集。"""
    cats = db.query(Category).all()
    series = db.query(Series).all()

    # ---- 分类 ----
    w(STATIC_DIR / "api/v1/categories.json",
      {"items": [{"id": c.id, "name": c.name, "icon": c.icon} for c in cats]})

    # ---- 剧集列表（全量，客户端自行翻页/取前 N）----
    items = [series_to_dict(s) for s in series]
    w(STATIC_DIR / "api/v1/series.json",
      {"items": items, "page": {"page": 1, "size": len(items), "total": len(items), "has_more": False}})

    # ---- 首页分区：热门榜 + 最新 + 分类推荐 ----
    by_views = sorted(items, key=lambda x: x["views"], reverse=True)
    by_year = sorted(items, key=lambda x: x["release_year"], reverse=True)
    sections = [
        {"id": "hot", "title": "热门榜", "layout": "swipe", "items": by_views[:10]},
        {"id": "new", "title": "新剧速递", "layout": "grid", "items": by_year[:8]},
    ]
    for c in cats:
        group = [i for i in items if i["category_id"] == c.id][:6]
        if group:
            sections.append({"id": c.id, "title": c.name, "layout": "grid", "items": group})
    w(STATIC_DIR / "api/v1/home.json", {"sections": sections})

    # ---- 单剧 / 分集 / 单集 ----
    index: list[dict] = []
    for s in series:
        eps = (
            db.query(Episode)
            .filter(Episode.series_id == s.id)
            .order_by(Episode.index)
            .all()
        )
        ep_dicts = [episode_to_dict(e) for e in eps]
        full = series_to_dict(s)
        full["episodes"] = ep_dicts
        w(STATIC_DIR / "api/v1/series" / f"{s.id}.json", full)
        w(STATIC_DIR / "api/v1/series" / s.id / "episodes.json", {"items": ep_dicts})
        for e in ep_dicts:
            w(STATIC_DIR / "api/v1/episodes" / f"{e['id']}.json", e)
        base = series_to_dict(s)
        index.append({"id": base["id"], "title": base["title"],
                      "tags": base["tags"], "category_id": base["category_id"],
                      "synopsis": base["synopsis"]})

    # ---- 搜索索引（供 Cloud Function 读取）----
    w(DATA_DIR / "series_index.json", {"items": index})


def export_ota(db, public_base: str) -> None:
    """OTA：发布记录 + 公钥 + 安装包。URL 的 localhost 前缀替换为公网地址。"""
    releases = db.query(OtaRelease).all()

    def art(r: OtaRelease) -> dict | None:
        if not r.artifact_type:
            return None
        url = r.artifact_url
        if url and url.startswith("http://localhost:8000"):
            url = public_base.rstrip("/") + url[len("http://localhost:8000"):]
        return {
            "type": r.artifact_type,
            "url": url,
            "size": r.artifact_size or 0,
            "sha256": r.artifact_sha256 or "",
            "signature": r.artifact_signature or "",
            "install_args": json.loads(r.artifact_install_args or "[]"),
        }

    out = []
    for r in releases:
        out.append({
            "platform": r.platform,
            "arch": r.arch,
            "channel": r.channel,
            "version": r.version,
            "build": r.build,
            "released_at": r.released_at.isoformat(),
            "min_supported_version": r.min_supported_version,
            "notes_i18n": json.loads(r.notes_i18n or "{}"),
            "artifact": art(r),
            "store_url": r.store_url,
            "rollout_percent": r.rollout_percent,
        })
    w(DATA_DIR / "releases.json", {"releases": out})

    # 公钥（客户端验签用）
    pub_b64 = base64.b64encode(raw_public_key_bytes()).decode("ascii")
    w(STATIC_DIR / "api/v1/ota/public-key.json", {"key": pub_b64, "format": "ed25519-raw-b64"})

    # 安装包（占位文件，保持与发布记录 URL 一致：/files/<name>）
    artifacts = SERVER_DIR / "data" / "artifacts"
    files_dir = STATIC_DIR / "files"
    files_dir.mkdir(parents=True, exist_ok=True)
    for r in releases:
        if r.artifact_url and r.artifact_url.startswith("http://localhost:8000/files/"):
            fname = r.artifact_url.rsplit("/", 1)[-1]
            src = artifacts / fname
            if src.exists():
                shutil.copyfile(src, files_dir / fname)
                print(f"  ✓ static/files/{fname} (占位安装包)")
            else:
                # 兜底生成占位文件，保证下载链路可用
                (files_dir / fname).write_bytes(
                    b"MANJU-OTA-PLACEHOLDER-INSTALLER")
                print(f"  ✓ static/files/{fname} (自动生成占位包)")


def export_admin() -> None:
    """运营后台静态化：复制 index.html，并注入“只读模式”提示。"""
    src = SERVER_DIR / "admin" / "index.html"
    dst = STATIC_DIR / "admin" / "index.html"
    html = src.read_text(encoding="utf-8")
    # 在标题下方注入只读提示
    html = html.replace(
        "<header>",
        '<div style="background:#fff7e6;color:#ad6800;padding:8px 24px;font-size:13px;">'
        "EdgeOne Makers 演示部署：内容与 OTA 为静态只读数据。发布/增删改操作请在本机 FastAPI 版执行后重新运行 export_static.py。</div><header>",
        1,
    )
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(html, encoding="utf-8")
    print(f"  ✓ static/admin/index.html (只读模式)")


def main() -> int:
    parser = argparse.ArgumentParser(description="导出 EdgeOne Makers 静态资源")
    parser.add_argument("--public-base", default="http://localhost:8000",
                        help="OTA 产物公网前缀，如 https://manju.pages.dev（部署后需用真实域名重跑）")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        print("导出内容数据…")
        export_content(db)
        print(f"导出 OTA 数据（public_base={args.public_base}）…")
        export_ota(db, args.public_base)
    finally:
        db.close()
    print("导出运营后台…")
    export_admin()
    print(f"\n完成。部署目录：{MAKERS_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
