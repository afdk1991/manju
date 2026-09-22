#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
将红果短剧各分类外部元数据目录转换为漫剧 Manju 应用可直接引用的静态索引，
输出到 makers/static/external/<category>.json 与汇总 index.json。

只搬运“元数据 + 原始来源链接”，不包含任何视频/图片二进制。
运行：python resources/external/hongguoduanju/build_catalog.py
"""
from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parents[2]
DST_DIR = PROJECT / "makers" / "static" / "external"

CATEGORY_LABEL = {
    "real-drama": ("真人剧", "live-action-short-drama"),
    "comic-drama": ("漫剧", "motion-comic"),
    "ai-drama": ("AI剧", "ai-generated-drama"),
}


def convert(src: Path) -> int:
    raw = json.loads(src.read_text(encoding="utf-8"))
    cat = src.stem  # 文件名即权威分类标识（real-drama / comic-drama / ai-drama）
    label, media_type = CATEGORY_LABEL.get(cat, (cat, "unknown"))
    items = []
    for it in raw["items"]:
        sid = it["detail_url"].split("series_id=")[-1]
        items.append({
            "id": f"hg-{sid}",                 # 外部来源带前缀，避免与自有 s_100xx 冲突
            "title": it["title"],
            "cover_url": it["cover_url"],      # 原始封面地址（未下载、未托管）
            "episodes_text": it["episodes_text"],
            "episodes": it["episodes"],
            "source": "hongguoduanju",
            "source_label": "红果短剧",
            "category": cat,
            "category_label": label,
            "detail_url": it["detail_url"],    # 点击后跳转原站详情页
            "media_type": media_type,
        })
    items.sort(key=lambda x: (x["episodes"] or 0), reverse=True)
    payload = {
        "catalog": f"external/hongguoduanju/{cat}",
        "generated_from": f"resources/external/hongguoduanju/{src.name}",
        "category": cat,
        "category_label": label,
        "attribution": "封面与作品信息版权归红果短剧及相应权利人所有；本文件仅含公开元数据与来源链接，不提供播放。",
        "total": len(items),
        "items": items,
    }
    DST_DIR.mkdir(parents=True, exist_ok=True)
    (DST_DIR / f"{cat}.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"✓ {cat}（{label}）：{len(items)} 条 → makers/static/external/{cat}.json")
    return len(items)


def main() -> int:
    counts = {}
    for src in sorted(HERE.glob("*-drama.json")):
        counts[src.stem] = convert(src)
    if not counts:
        print("未发现分类 JSON，请先运行 fetch_category.py")
        return 1

    # 汇总索引：前端一次拉取即可获得全部外部片单入口
    index = {
        "provider": "hongguoduanju",
        "provider_label": "红果短剧",
        "attribution": "作品与封面版权归红果短剧及权利人所有；仅含公开元数据与来源链接，播放请跳转原站。",
        "catalogs": [
            {"category": cat, "category_label": CATEGORY_LABEL.get(cat, (cat, ""))[0],
             "url": f"/external/{cat}.json", "total": n}
            for cat, n in sorted(counts.items())
        ],
        "total": sum(counts.values()),
    }
    (DST_DIR / "index.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"✓ 汇总索引：{index['total']} 条 → makers/static/external/index.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
