# -*- coding: utf-8 -*-
"""把「重生：我成了漫画主角」第1集写入 server/data/manju.db。

自有 AI 生成内容（6 张分镜帧 → HLS），片源指向站内 files/videos/，
不走任何第三方 CDN。插入后应由 makers/scripts/export_static.py 重新生成静态 JSON。
"""
import json
import sqlite3
from pathlib import Path

DB = Path(__file__).resolve().parent.parent / "server" / "data" / "manju.db"

SOURCES = [
    {
        "quality": "720p",
        "url": "files/videos/demo_ai_rebirth/ep01/index.m3u8",
        "container": "hls",
        "codec": "h264",
        "bitrate_kbps": 1500,
    },
    {
        "quality": "720p",
        "url": "files/videos/demo_ai_rebirth/ep01/ep01.mp4",
        "container": "mp4",
        "codec": "h264",
        "bitrate_kbps": 1500,
    },
]

SERIES = {
    "id": "demo_ai_rebirth",
    "title": "重生：我成了漫画主角",
    "original_title": "原创 AI 漫剧",
    "cover": "files/covers/demo_ai_rebirth_cover.jpg",
    "poster": "files/covers/demo_ai_rebirth_cover.jpg",
    "banner": "files/covers/demo_ai_rebirth_cover.jpg",
    "synopsis": (
        "落魄漫画家深夜伏案沉睡，笔下世界竟在台灯光中复苏。"
        "他穿越进自己未完的漫画，双手开始化作墨线——一场关于「重生」的黑白漫剧由此展开。"
        "本站自有 AI 生成内容，纯原创，全程站内播放。"
    ),
    "tags": json.dumps(["漫剧", "AI剧", "原创", "玄幻"], ensure_ascii=False),
    "category_id": "cat_xuanhuan",
    "region": "CN",
    "release_year": 2026,
    "status": "ongoing",
    "total_episodes": 1,
    "score": 9.1,
    "views": 0,
    "is_vip": 0,
    "age_rating": "all",
}

EPISODE = {
    "id": "demo_ai_rebirth_e001",
    "series_id": "demo_ai_rebirth",
    "index": 1,
    "title": "觉醒",
    "thumbnail": "files/videos/demo_ai_rebirth/ep01/thumb.jpg",
    "duration_sec": 36,
    "is_free": 1,
    "sources": json.dumps(SOURCES, ensure_ascii=False),
    "subtitles": "[]",
}


def main() -> None:
    if not DB.exists():
        raise SystemExit(f"未找到数据库：{DB}")
    con = sqlite3.connect(str(DB))
    con.execute("PRAGMA foreign_keys = ON")
    try:
        cur = con.cursor()
        # 幂等：先清后插
        cur.execute("DELETE FROM episodes WHERE series_id = ?", (SERIES["id"],))
        cur.execute("DELETE FROM series WHERE id = ?", (SERIES["id"],))
        cur.execute(
            "INSERT INTO series "
            "(id,title,original_title,cover,poster,banner,synopsis,tags,category_id,"
            "region,release_year,status,total_episodes,score,views,is_vip,age_rating) "
            "VALUES (:id,:title,:original_title,:cover,:poster,:banner,:synopsis,:tags,"
            ":category_id,:region,:release_year,:status,:total_episodes,:score,:views,"
            ":is_vip,:age_rating)",
            SERIES,
        )
        cur.execute(
            "INSERT INTO episodes "
            "(id,series_id,\"index\",title,thumbnail,duration_sec,is_free,sources,subtitles) "
            "VALUES (:id,:series_id,:index,:title,:thumbnail,:duration_sec,:is_free,"
            ":sources,:subtitles)",
            EPISODE,
        )
        con.commit()
        print("✓ 已写入 series + episode 到", DB)
        n = cur.execute("SELECT count(*) FROM series").fetchone()[0]
        print(f"  当前剧集总数：{n}")
        row = cur.execute(
            "SELECT id,title,cover FROM series WHERE id=?", (SERIES["id"],)
        ).fetchone()
        print("  新剧集：", row)
        ep = cur.execute(
            "SELECT id,series_id,substr(sources,1,80) FROM episodes WHERE id=?",
            (EPISODE["id"],),
        ).fetchone()
        print("  新单集：", ep)
    finally:
        con.close()


if __name__ == "__main__":
    main()
