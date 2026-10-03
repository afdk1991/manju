# -*- coding: utf-8 -*-
"""演示数据初始化。

- 分类、≥20 部漫剧（中文剧名/简介）、每部 ≥12 集（mux 测试流视频源）。
- 发布 OTA 版本：windows 9.9.9 与 ios 9.9.9（满足冒烟前置要求）。
- 用法：
      cd server
      python seed/seed.py
"""
from __future__ import annotations

import hashlib
import json
import random
from datetime import datetime, timezone
from pathlib import Path

from app.db import SessionLocal, init_db
from app.models import Category, Episode, OtaRelease, Series
from app.security import sign_release

SERVER_ROOT = Path(__file__).resolve().parent.parent
ARTIFACTS_DIR = SERVER_ROOT / "data" / "artifacts"
M3U8 = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8"

CATEGORIES = [
    ("cat_hot", "热血", "🔥"),
    ("cat_love", "恋爱", "💗"),
    ("cat_mystery", "悬疑", "🕵️"),
    ("cat_fun", "搞笑", "😂"),
    ("cat_xuanhuan", "玄幻", "✨"),
    ("cat_city", "都市", "🌆"),
    ("cat_scifi", "科幻", "🚀"),
    ("cat_history", "历史", "📜"),
]

# (剧名, 简介, 分类id, 标签, 状态, 年份, 是否VIP)
SERIES_SEED = [
    ("开局一座山", "穿越异界，靠一座山头白手起家，逆袭成王。", "cat_xuanhuan", ["穿越", "逆袭", "搞笑"], "ongoing", 2025, False),
    ("我的女友是机器人", "程序员意外唤醒家用机器人，展开跨物种恋爱。", "cat_love", ["机器人", "甜宠", "都市"], "completed", 2024, False),
    ("深夜谜案录", "落魄侦探与实习助手，破解一桩桩都市怪谈。", "cat_mystery", ["推理", "悬疑", "单元剧"], "ongoing", 2025, True),
    ("王牌经纪人", "过气爱豆重出江湖，看金牌经纪人如何造星。", "cat_city", ["娱乐圈", "励志"], "ongoing", 2025, False),
    ("末日方舟", "病毒爆发十年后，幸存者在方舟上争夺最后生机。", "cat_scifi", ["末日", "生存", "燃"], "ongoing", 2025, True),
    ("厨神小当家", "少年继承失传菜谱，用料理征服整个美食界。", "cat_fun", ["美食", "热血", "日常"], "completed", 2023, False),
    ("霸道总裁的替身新娘", "一场契约婚姻，假戏真做引爆豪门恩怨。", "cat_love", ["豪门", "虐恋", "总裁"], "ongoing", 2024, True),
    ("修仙从种田开始", "灵气复苏时代，主角靠种田慢慢修成大道。", "cat_xuanhuan", ["修仙", "种田", "轻松"], "ongoing", 2025, False),
    ("重生之我是首富", "回到二十年前，利用先知先觉缔造商业帝国。", "cat_city", ["重生", "商战", "爽文"], "completed", 2024, False),
    ("诡秘档案", "特别行动组深入禁忌之地，揭开被掩盖的真相。", "cat_mystery", ["灵异", "探险", "悬疑"], "ongoing", 2025, True),
    ("电竞之巅", "草根少年组建战队，一路杀进世界总决赛。", "cat_hot", ["电竞", "青春", "热血"], "ongoing", 2025, False),
    ("国民校草是女生", "女扮男装混入男校，却成了全校的偶像。", "cat_fun", ["校园", "扮装", "甜"], "completed", 2023, False),
    ("星际农夫", "被流放边星的主角，用农业科技改变荒原。", "cat_scifi", ["星际", "种田", "基建"], "ongoing", 2025, False),
    ("大宋提刑官", "法医穿越宋朝，以验尸断案名动天下。", "cat_history", ["古装", "探案", "历史"], "ongoing", 2024, True),
    ("追光者", "一群追梦的舞者，在聚光灯下找回初心。", "cat_hot", ["舞蹈", "励志", "青春"], "ongoing", 2025, False),
    ("甜蜜暴击", "拳击少女与学霸少年的校园恋爱物语。", "cat_love", ["校园", "运动", "甜宠"], "completed", 2024, False),
    ("诸天万界", "穿梭诸天世界的收集者，逐渐触及世界真相。", "cat_xuanhuan", ["无限流", "诸天", "脑洞"], "ongoing", 2025, True),
    ("长安诡事", "大唐盛世下的暗流，坊市之间鬼影幢幢。", "cat_history", ["古装", "志怪", "悬疑"], "ongoing", 2025, False),
    ("上班族的逆袭", "被裁员的社畜转行摆摊，意外做成连锁品牌。", "cat_city", ["创业", "励志", "搞笑"], "ongoing", 2025, False),
    ("深海求生", "邮轮失事后，幸存者漂向一座神秘海岛。", "cat_scifi", ["求生", "孤岛", "悬疑"], "ongoing", 2025, True),
    ("国漫英雄传", "平凡少年觉醒异能，守护城市成为新一代英雄。", "cat_hot", ["异能", "英雄", "热血"], "ongoing", 2025, False),
    ("霸榜天后", "选秀出道的女孩，从陪练走向万人舞台中心。", "cat_fun", ["选秀", "音乐", "励志"], "completed", 2023, False),
]


def make_episodes(series_id: str, count: int) -> list[Episode]:
    eps = []
    for i in range(1, count + 1):
        sources = [
            {
                "quality": "auto",
                "url": M3U8,
                "container": "hls",
                "codec": "h264",
                "bitrate_kbps": 2400,
            }
        ]
        subtitles = [
            {"lang": "zh-CN", "label": "简体中文", "url": f"https://example.com/sub/{series_id}/{i}.vtt", "format": "vtt", "is_default": True}
        ]
        eps.append(
            Episode(
                id=f"{series_id}_e{i:03d}",
                series_id=series_id,
                index=i,
                title=f"第{i}集",
                thumbnail=f"https://example.com/cover/{series_id}_{i}.jpg",
                duration_sec=random.randint(120, 360),
                is_free=(i <= 3),  # 前 3 集免费
                sources=json.dumps(sources, ensure_ascii=False),
                subtitles=json.dumps(subtitles, ensure_ascii=False),
            )
        )
    return eps


def publish_windows(db) -> None:
    """发布 windows 9.9.9，并生成占位安装包用于静态分发演示。"""
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    pkg_name = "Manju-Setup-9.9.9.exe"
    pkg_path = ARTIFACTS_DIR / pkg_name
    if not pkg_path.exists():
        pkg_path.write_bytes(b"MANJU-OTA-PLACEHOLDER-INSTALLER-9.9.9")
    sha256 = hashlib.sha256(pkg_path.read_bytes()).hexdigest()
    url = f"http://localhost:8000/files/{pkg_name}"
    signature = sign_release("9.9.9", 999, sha256, url)

    db.add(
        OtaRelease(
            platform="windows",
            arch="x86_64",
            channel="stable",
            version="9.9.9",
            build=999,
            released_at=datetime.now(timezone.utc),
            min_supported_version="1.0.0",
            notes_i18n=json.dumps(
                {
                    "zh-CN": "- 全新播放引擎，首屏加载更快\n- 新增倍速记忆与跳过片头\n- 修复部分机型下载失败",
                    "en": "- New playback engine\n- Speed memory\n- Fix download issues",
                },
                ensure_ascii=False,
            ),
            artifact_type="exe",
            artifact_url=url,
            artifact_size=pkg_path.stat().st_size,
            artifact_sha256=sha256,
            artifact_signature=signature,
            artifact_install_args=json.dumps(["/VERYSILENT", "/NORESTART"], ensure_ascii=False),
            delta_available=False,
            delta_from_versions=json.dumps([], ensure_ascii=False),
            store_url=None,
            rollout_percent=100,
        )
    )


def publish_ios(db) -> None:
    """发布 ios 9.9.9：平台受限，必须走 App Store 兜底，不得返回自安装产物。"""
    db.add(
        OtaRelease(
            platform="ios",
            arch="arm64",
            channel="stable",
            version="9.9.9",
            build=999,
            released_at=datetime.now(timezone.utc),
            min_supported_version="1.0.0",
            notes_i18n=json.dumps(
                {
                    "zh-CN": "- 体验优化与稳定性修复\n- 前往 App Store 更新",
                    "en": "- Improvements and bug fixes\n- Update on the App Store",
                },
                ensure_ascii=False,
            ),
            artifact_type=None,
            artifact_url=None,
            artifact_sha256=None,
            artifact_signature=None,
            artifact_install_args=json.dumps([], ensure_ascii=False),
            delta_available=False,
            delta_from_versions=json.dumps([], ensure_ascii=False),
            store_url="https://apps.apple.com/app/id0000000000",
            rollout_percent=100,
        )
    )


def seed() -> None:
    init_db()
    db = SessionLocal()
    try:
        # 清空旧内容（保留 OTA 发布，避免重复）
        db.query(Episode).delete()
        db.query(Series).delete()
        db.query(Category).delete()

        for cid, name, icon in CATEGORIES:
            db.add(Category(id=cid, name=name, icon=icon))

        sid = 10001
        for title, synopsis, cat, tags, status, year, vip in SERIES_SEED:
            series_id = f"s_{sid}"
            sid += 1
            count = random.randint(12, 16)
            score = round(random.uniform(6.5, 9.6), 1)
            views = random.randint(10000, 9999999)
            db.add(
                Series(
                    id=series_id,
                    title=title,
                    cover=f"https://example.com/cover/{series_id}.jpg",
                    poster=f"https://example.com/poster/{series_id}.jpg",
                    banner=f"https://example.com/banner/{series_id}.jpg",
                    synopsis=synopsis,
                    tags=json.dumps(tags, ensure_ascii=False),
                    category_id=cat,
                    region="CN",
                    release_year=year,
                    status=status,
                    total_episodes=count,
                    score=score,
                    views=views,
                    is_vip=vip,
                    age_rating="all",
                )
            )
            db.add_all(make_episodes(series_id, count))

        # 发布 OTA（若已存在则跳过，保证幂等）
        existing = {r.platform for r in db.query(OtaRelease).all()}
        if "windows" not in existing:
            publish_windows(db)
        if "ios" not in existing:
            publish_ios(db)

        db.commit()
        print(f"种子数据完成：{len(SERIES_SEED)} 部漫剧，已发布 windows/ios 9.9.9")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
