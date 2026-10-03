# -*- coding: utf-8 -*-
"""从公开、可自由分发的 CC 授权源导入**真实可播放**内容到 server/data/manju.db。

## 为什么是 Blender 开源电影
本平台严禁抓取盗版站点（见 server/app/services/sources/user_defined.py）。
要「部署后有真实内容」，只能采用法律上可自由分发的内容。
Wikimedia Commons 上的 **Blender Open Movies** 由 Blender 基金会以
CC BY / CC BY-SA 授权发布，允许自由复制、分发、公开放映（需署名），
是目前唯一同时满足「合法 + 可直链 + 内容完整」的来源。

导入的数据**真实存在、真实可播**，与原有的示例数据（example.com 占位图 + 单一测试流）不同。

## 用法
    # 预览（不写库）
    python scripts/import_content.py --dry-run

    # 正式导入：先清除旧的占位数据，再写入真实内容
    python scripts/import_content.py

    # 跳过可达性校验（更快，但可能写入被限流的地址）
    python scripts/import_content.py --no-verify

    # 随后必须重新导出静态资源，否则部署出去的站仍是旧的：
    python makers/scripts/export_static.py --public-base https://<你的域名>

依赖：requests、sqlalchemy（与 server 同环境）。
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "server"))

COMMONS_API = "https://commons.wikimedia.org/w/api.php"
UA = "manju-content-importer/1.0 (open-content demo; contact: dev@example.com)"

# Commons 上的 Blender 开源电影（已实测可直链）。
# zh 中文名 / desc 中文简介 / tags 由本仓库编写；媒体文件与授权信息来自 Commons。
CATALOG = [
    {
        "commons": "File:Big Buck Bunny 4K.webm",
        "zh": "大兔子的反击",
        "desc": "一只体型巨大的兔子被三只啮齿动物反复捉弄，最终展开一连串夸张的卡通式复仇。Blender 基金会第一部全彩开放动画短片，画面明亮、无对白，适合全年龄段。",
        "tags": ["动画", "喜剧", "无对白"],
        "category_id": "cat_animation",
        "year": 2008,
        "score": 8.6,
        "hls": "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    },
    {
        "commons": "File:Caminandes - Gran Dillama - Blender Foundation's new Open Movie.webm",
        "zh": "羊驼大冒险",
        "desc": "一只执着的羊驼想尽办法越过一道围栏，却总在关键时刻出岔子。节奏轻快的搞笑短片，Caminandes 系列的经典一集。",
        "tags": ["动画", "喜剧", "短片"],
        "category_id": "cat_animation",
        "year": 2013,
        "score": 8.1,
        "hls": None,
    },
    {
        "commons": "File:Coffee Run - Blender Open Movie-full movie.webm",
        "zh": "咖啡狂奔",
        "desc": "一个男人为了买一杯咖啡，在城市里展开一场荒诞又充满想象力的狂奔。视觉风格鲜明，短小精悍。",
        "tags": ["动画", "都市", "短片"],
        "category_id": "cat_city",
        "year": 2016,
        "score": 7.8,
        "hls": None,
    },
    {
        "commons": "File:Elephants Dream (2006) 1080p24.webm",
        "zh": "大象之梦",
        "desc": "Blender 基金会的第一部开放电影（2006）。两个角色在一座不断自我重构的超现实机械世界中对话，探讨真实与虚构的边界。",
        "tags": ["科幻", "实验", "经典"],
        "category_id": "cat_scifi",
        "year": 2006,
        "score": 7.9,
        "hls": None,
    },
    {
        "commons": "File:SINGULARITY - Blender Open Movie-full movie.webm",
        "zh": "奇点",
        "desc": "以机器人与人工智能为主题的开放动画短片，机械感与叙事并重。",
        "tags": ["科幻", "机器人", "短片"],
        "category_id": "cat_scifi",
        "year": 2019,
        "score": 7.6,
        "hls": None,
    },
    {
        "commons": "File:Spring - Blender Open Movie.webm",
        "zh": "春日",
        "desc": "一个女孩在森林深处遇见神秘生物，一段关于成长与告别的治愈系短片，画面柔美。",
        "tags": ["治愈", "奇幻", "短片"],
        "category_id": "cat_animation",
        "year": 2019,
        "score": 8.4,
        "hls": None,
    },
    {
        "commons": "File:Tears of Steel in 4k - Official Blender Foundation release.webm",
        "zh": "钢铁之泪",
        "desc": "Blender 基金会 VFX 开放电影：在近未来的阿姆斯特丹，一支小队试图挽回被失控科技摧毁的世界。实拍与 CG 结合，特效水准极高。",
        "tags": ["科幻", "特效", "动作"],
        "category_id": "cat_scifi",
        "year": 2012,
        "score": 8.7,
        "hls": "https://test-streams.mux.dev/tos_ismc/main.m3u8",
    },
]


def fetch_metadata(titles: list[str]) -> dict[str, dict]:
    """从 Commons API 解析真实地址、时长与授权信息。"""
    sess = requests.Session()
    sess.headers["User-Agent"] = UA
    out: dict[str, dict] = {}
    # API 一次最多 50 个 title
    for i in range(0, len(titles), 25):
        chunk = titles[i : i + 25]
        resp = sess.get(
            COMMONS_API,
            params={
                "action": "query",
                "format": "json",
                "prop": "imageinfo",
                "iiprop": "url|size|extmetadata|mime|dimensions",
                "iiurlwidth": 960,
                "titles": "|".join(chunk),
            },
            timeout=30,
        )
        resp.raise_for_status()
        for page in resp.json().get("query", {}).get("pages", {}).values():
            info = page.get("imageinfo")
            if not info:
                print(f"  ! Commons 上找不到：{page.get('title')}", file=sys.stderr)
                continue
            ii = info[0]
            em = ii.get("extmetadata", {})
            # API 会在 URL 后附加 utm_* 跟踪参数，剥掉，避免地址里夹带无关查询串
            out[page["title"]] = {
                "url": (ii.get("url", "") or "").split("?")[0],
                "thumb": (ii.get("thumburl", "") or "").split("?")[0],
                "duration": int(float(ii.get("duration") or 0)),
                "width": ii.get("width"),
                "height": ii.get("height"),
                "license": em.get("LicenseShortName", {}).get("value", "CC"),
                "artist": em.get("Artist", {}).get("value", "Blender Foundation"),
            }
        time.sleep(0.5)
    return out


OK, THROTTLED, MISSING = "ok", "throttled", "missing"


def verify(url: str, timeout: int = 25, attempts: int = 3) -> str:
    """校验地址可达性，返回 OK / THROTTLED / MISSING。

    - Wikimedia 会对短时间内的连续请求返回 **429**。429 表示「被限流」而非「文件不存在」，
      因此不能据此丢弃内容——同一地址稍后再试通常仍是 200。
    - 对大文件只取前 1 字节（Range），避免把整部片子下载下来。
    """
    last = MISSING
    for n in range(attempts):
        try:
            r = requests.get(
                url,
                headers={"User-Agent": UA, "Range": "bytes=0-0"},
                timeout=timeout,
                stream=True,
            )
            r.close()
            if r.status_code in (200, 206):
                return OK
            if r.status_code == 429:
                last = THROTTLED
                if n < attempts - 1:
                    time.sleep(5 * (n + 1))  # 退避：5s / 10s
                    continue
            return MISSING
        except Exception:
            if n < attempts - 1:
                time.sleep(3)
    return last


def main() -> int:
    ap = argparse.ArgumentParser(description="导入真实可播放内容（CC 授权开源电影）")
    ap.add_argument("--dry-run", action="store_true", help="只打印将要写入的内容，不写库")
    ap.add_argument("--no-verify", action="store_true", help="跳过可达性校验")
    ap.add_argument("--keep-placeholder", action="store_true",
                    help="保留旧的 example.com 占位数据（默认会清除）")
    args = ap.parse_args()

    print("== 1/3 从 Wikimedia Commons 解析真实媒体地址 ==")
    meta = fetch_metadata([c["commons"] for c in CATALOG])
    if not meta:
        print("解析失败：Commons API 不可达", file=sys.stderr)
        return 1

    resolved = []
    for c in CATALOG:
        m = meta.get(c["commons"])
        if not m or not m["url"]:
            print(f"  - 跳过（无数据）：{c['zh']}")
            continue
        if not args.no_verify:
            cover_state = verify(m["thumb"])
            time.sleep(1.0)
            video_state = verify(m["url"])
            time.sleep(1.0)
            if cover_state == MISSING or video_state == MISSING:
                print(f"  - 跳过（地址失效 cover={cover_state} video={video_state}）：{c['zh']}")
                continue
            if video_state == THROTTLED:
                # 文件存在，只是此刻被限流。仍然导入，但记录下来以便后续排查。
                print(f"  ~ 视频被限流（稍后重试通常可用），仍导入：{c['zh']}")
            m["verified"] = video_state == OK
        else:
            m["verified"] = None
        resolved.append((c, m))
        print(f"  + {c['zh']:<10} {m['license']:<12} {m['duration']}s  {m['url'][:70]}")

    if not resolved:
        print("没有任何可用内容，放弃导入", file=sys.stderr)
        return 1

    print(f"\n== 2/3 写入数据库（{len(resolved)} 部）==")
    if args.dry_run:
        for c, m in resolved:
            print(json.dumps({
                "title": c["zh"], "cover": m["thumb"], "video": m["url"],
                "duration": m["duration"], "license": m["license"],
                "hls": c.get("hls"),
            }, ensure_ascii=False, indent=1))
        print("\n[dry-run] 未写库")
        return 0

    from app.db import SessionLocal, init_db  # noqa: E402
    from app.models import Episode, Series  # noqa: E402

    init_db()
    db = SessionLocal()
    try:
        if not args.keep_placeholder:
            # 只清除占位数据，避免误删任何真实内容
            stale = db.query(Series).filter(Series.cover.like("%example.com%")).all()
            for s in stale:
                db.query(Episode).filter(Episode.series_id == s.id).delete()
                db.delete(s)
            if stale:
                print(f"  已清除占位剧集 {len(stale)} 部")

        for idx, (c, m) in enumerate(resolved, start=1):
            sid = f"s_9{idx:03d}"
            existing = db.get(Series, sid)
            if existing:
                db.query(Episode).filter(Episode.series_id == sid).delete()
                db.delete(existing)

            series = Series(
                id=sid,
                title=c["zh"],
                original_title=c["commons"].replace("File:", "").rsplit(".", 1)[0],
                cover=m["thumb"],
                poster=m["thumb"],
                banner=m["thumb"],
                synopsis=c["desc"],
                tags=json.dumps(c["tags"], ensure_ascii=False),
                category_id=c["category_id"],
                region="NL",
                release_year=c["year"],
                status="completed",
                total_episodes=1,
                score=c["score"],
                views=0,
                is_vip=False,
                age_rating="all",
            )
            db.add(series)

            sources = []
            if c.get("hls"):
                sources.append({
                    "quality": "auto", "url": c["hls"], "container": "hls",
                    "codec": "h264", "bitrate_kbps": 2400,
                })
            sources.append({
                "quality": "auto", "url": m["url"], "container": "webm",
                "codec": "vp9", "bitrate_kbps": 0,
            })

            db.add(Episode(
                id=f"{sid}_e001",
                series_id=sid,
                index=1,
                title="正片",
                thumbnail=m["thumb"],
                duration_sec=m["duration"],
                is_free=True,
                sources=json.dumps(sources, ensure_ascii=False),
                subtitles="[]",
            ))
            print(f"  ✓ {sid} {c['zh']}")
        db.commit()
    finally:
        db.close()

    print("\n== 3/3 完成 ==")
    print("下一步必须重新导出静态资源，否则部署出去的站仍是旧数据：")
    print("  python makers/scripts/export_static.py --public-base https://<你的域名>")
    print("\n署名要求（CC BY）：内容 © Blender Foundation，经 Wikimedia Commons 分发，")
    print("许可 CC BY 3.0 / CC BY-SA 3.0 / CC BY 4.0（逐部不同，见数据库 license 字段）。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
