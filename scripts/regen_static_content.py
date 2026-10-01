# -*- coding: utf-8 -*-
"""从 server/data/manju.db 重建 makers/static 内容 JSON（不依赖 SQLAlchemy）。

等价于 makers/scripts/export_static.py 的 export_content()，但仅用 sqlite3 标准库，
避免在本机缺 SQLAlchemy 时无法导出。生成的文件包括：
  api/v1/categories.json
  api/v1/series.json
  api/v1/home.json
  api/v1/series/{id}.json        (内嵌 episodes)
  api/v1/series/{id}/episodes.json
  api/v1/episodes/{id}.json
  ../data/series_index.json      (搜索索引)

注意：只重建「内容」类 JSON，不动 OTA（releases.json / public-key.json）与 files/videos 视频资产。
"""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "server" / "data" / "manju.db"
# 注意：makers/static 已是 Vite 构建产物目录（会被 emptyOutDir 清空）。
# 内容 JSON 必须写进前端工程的 public 源目录，再由构建复制进产物。
STATIC = ROOT / "web" / "public"
DATA = ROOT / "makers" / "data"
API = STATIC / "api" / "v1"


def jload(s: str, default):
    try:
        return json.loads(s) if s else default
    except Exception:
        return default


def series_to_dict(r: dict) -> dict:
    return {
        "id": r["id"],
        "title": r["title"],
        "original_title": r["original_title"],
        "cover": r["cover"],
        "poster": r["poster"],
        "banner": r["banner"],
        "synopsis": r["synopsis"],
        "tags": jload(r["tags"], []),
        "category_id": r["category_id"],
        "region": r["region"],
        "release_year": r["release_year"],
        "status": r["status"],
        "total_episodes": r["total_episodes"],
        "score": r["score"],
        "views": r["views"],
        "is_vip": bool(r["is_vip"]),
        "age_rating": r["age_rating"],
    }


def episode_to_dict(r: dict) -> dict:
    return {
        "id": r["id"],
        "series_id": r["series_id"],
        "index": r["index"],
        "title": r["title"],
        "thumbnail": r["thumbnail"],
        "duration_sec": r["duration_sec"],
        "is_free": bool(r["is_free"]),
        "sources": jload(r["sources"], []),
        "subtitles": jload(r["subtitles"], []),
    }


def w(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"  ✓ {path.relative_to(ROOT)}")


def main() -> None:
    if not DB.exists():
        raise SystemExit(f"未找到数据库：{DB}")
    con = sqlite3.connect(str(DB))
    con.row_factory = sqlite3.Row
    try:
        cats = [dict(r) for r in con.execute("SELECT id,name,icon FROM categories ORDER BY id")]
        series_rows = [dict(r) for r in con.execute("SELECT * FROM series ORDER BY id")]
        eps_rows = [
            dict(r) for r in
            con.execute("SELECT * FROM episodes ORDER BY series_id, \"index\"")
        ]
    finally:
        con.close()

    # 剧集 -> 分集
    eps_by_series: dict[str, list[dict]] = {}
    for e in eps_rows:
        eps_by_series.setdefault(e["series_id"], []).append(e)

    items = [series_to_dict(s) for s in series_rows]
    ep_dicts = {e["id"]: episode_to_dict(e) for e in eps_rows}

    # ---- categories ----
    w(API / "categories.json", {"items": [{"id": c["id"], "name": c["name"], "icon": c["icon"]} for c in cats]})

    # ---- series 列表 ----
    w(API / "series.json", {
        "items": items,
        "page": {"page": 1, "size": len(items), "total": len(items), "has_more": False},
    })

    # ---- 首页分区 ----
    by_views = sorted(items, key=lambda x: x["views"], reverse=True)[:10]
    by_year = sorted(items, key=lambda x: x["release_year"], reverse=True)[:8]
    sections = [
        {"id": "hot", "title": "热门榜", "layout": "swipe", "items": by_views},
        {"id": "new", "title": "新剧速递", "layout": "grid", "items": by_year},
    ]
    for c in cats:
        group = [i for i in items if i["category_id"] == c["id"]][:6]
        if group:
            sections.append({"id": c["id"], "title": c["name"], "layout": "grid", "items": group})
    w(API / "home.json", {"sections": sections})

    # ---- 单剧 / 分集 / 单集 ----
    for s in series_rows:
        sid = s["id"]
        eps = [episode_to_dict(e) for e in eps_by_series.get(sid, [])]
        full = series_to_dict(s)
        full["episodes"] = eps
        w(API / "series" / f"{sid}.json", full)
        w(API / "series" / sid / "episodes.json", {"items": eps})
        for e in eps:
            w(API / "episodes" / f"{e['id']}.json", e)

    # ---- 搜索索引 ----
    index = [
        {"id": s["id"], "title": s["title"], "tags": s["tags"],
         "category_id": s["category_id"], "synopsis": s["synopsis"]}
        for s in items
    ]
    w(DATA / "series_index.json", {"items": index})

    print(f"\n完成：{len(items)} 部剧集 · {len(ep_dicts)} 个分集 · {len(cats)} 个分类")


if __name__ == "__main__":
    main()
