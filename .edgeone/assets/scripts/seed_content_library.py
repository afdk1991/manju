# -*- coding: utf-8 -*-
"""将 content/library 的 manifest 写入本地数据库（Series / Episode）。

生成的 URL 统一走 /files 静态路由（server/app/main.py 已挂载）：
  - 物理资源根 = settings.artifacts_dir (= server/data/artifacts)
  - 对外 URL   = <base-url>/<manifest 中的相对路径>

用法：
  python scripts/seed_content_library.py --manifest content/library/sample_series.json
  python scripts/seed_content_library.py --manifest content/library/sample_series.json --base-url /files
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SERVER_ROOT = PROJECT_ROOT / "server"
sys.path.insert(0, str(SERVER_ROOT))

from app.db import SessionLocal, init_db  # noqa: E402
from app.models import Episode, Series  # noqa: E402


def _to_url(base: str, rel: str | None) -> str | None:
    if not rel:
        return None
    return f"{base.rstrip('/')}/{rel.lstrip('/')}"


def seed(manifest_path: Path, base_url: str) -> None:
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    sid = data["series_id"]

    init_db()
    db = SessionLocal()
    try:
        series = db.get(Series, sid)
        if series is None:
            series = Series(id=sid)
            db.add(series)
        series.title = data["title"]
        series.original_title = data.get("original_title")
        series.synopsis = data.get("synopsis", "")
        series.category_id = data.get("category_id")
        series.tags = json.dumps(data.get("tags", []), ensure_ascii=False)
        series.region = data.get("region", "CN")
        series.release_year = data.get("release_year", 2026)
        series.status = data.get("status", "ongoing")
        series.is_vip = data.get("is_vip", False)
        series.age_rating = data.get("age_rating", "all")
        series.cover = _to_url(base_url, data.get("cover")) or ""
        series.poster = _to_url(base_url, data.get("poster"))
        series.banner = _to_url(base_url, data.get("banner"))
        series.total_episodes = len(data.get("episodes", []))

        existing = {ep.id: ep for ep in db.query(Episode).filter(Episode.series_id == sid)}
        kept = set()
        for ep in data.get("episodes", []):
            eid = f"{sid}_e{int(ep['index']):02d}"
            kept.add(eid)
            e = existing.get(eid) or Episode(id=eid, series_id=sid)
            if e.id not in existing:
                db.add(e)
            e.index = ep["index"]
            e.title = ep.get("title", "")
            e.thumbnail = _to_url(base_url, ep.get("thumbnail"))
            e.duration_sec = ep.get("duration_sec", 0)
            e.is_free = ep.get("is_free", True)
            sources = [
                {**s, "url": _to_url(base_url, s.get("url"))}
                for s in ep.get("sources", [])
            ]
            subs = [
                {**s, "url": _to_url(base_url, s.get("url"))}
                for s in ep.get("subtitles", [])
            ]
            e.sources = json.dumps(sources, ensure_ascii=False)
            e.subtitles = json.dumps(subs, ensure_ascii=False)

        # 清理 manifest 中已不存在的集数
        for eid, e in existing.items():
            if eid not in kept:
                db.delete(e)

        db.commit()
        print(f"✓ 已写入/更新剧集 {sid}：{len(kept)} 集，base={base_url}")
    finally:
        db.close()


def main() -> int:
    ap = argparse.ArgumentParser(description="manifest -> 数据库种子")
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--base-url", default="/files")
    args = ap.parse_args()
    seed(Path(args.manifest), args.base_url)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
