#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
红果短剧 · 分类页公开元数据采集器（合规、可续跑、限速、通用分类）

数据来源：https://hongguoduanju.com/category/<category>
  支持分类（站点导航标签）：
    real-drama   真人剧
    comic-drama  漫剧
    ai-drama     AI剧
合规边界（见同目录 README.md）：
  - robots.txt 对分类页 Allow: /；本脚本只抓取 /category/<category> 列表页 HTML；
  - 不抓取被 Disallow 的 /player/*/*、/series/、/query/ 路径（不进播放页/详情页）；
  - 仅提取列表页“公开可见”的元数据（标题、详情页链接、封面图地址、集数），
    不下载视频/图片二进制、不绕过登录或反爬校验；
  - 请求间隔 2 秒、单线程、浏览器 UA、失败自动重试并保留已得结果。

续跑：输出文件已存在时，以详情页链接去重，重跑同一命令只加新条目；
      每页解析后即时落盘，中断后重跑即可接着抓。

用法：
    python resources/external/hongguoduanju/fetch_category.py --category comic-drama
    python resources/external/hongguoduanju/fetch_category.py --category ai-drama
    python resources/external/hongguoduanju/fetch_category.py --category real-drama
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE = "https://hongguoduanju.com"
HERE = Path(__file__).resolve().parent

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36")
DELAY_SEC = 2.0
TIMEOUT = 30

CARD_RE = re.compile(
    r'<a[^>]*class="pc-card-[^"]*"[^>]*href="(?P<href>/detail\?series_id=\d+)"[^>]*>(?P<body>.*?)</a>',
    re.S,
)
IMG_RE = re.compile(r'<img[^>]*src="(?P<src>https://[^"]+)"[^>]*alt="(?P<alt>[^"]*)"', re.S)
EP_RE = re.compile(r'<p[^>]*class="[^"]*episode[^"]*"[^>]*>(?P<ep>[^<]+)</p>', re.S)


def http_get(url: str, retries: int = 3) -> str:
    last = None
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": UA,
                "Accept-Language": "zh-CN,zh;q=0.9",
                "Referer": BASE + "/",
                "Accept": "text/html,application/xhtml+xml",
            })
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                charset = resp.headers.get_content_charset() or "utf-8"
                return resp.read().decode(charset, errors="replace")
        except Exception as e:  # noqa: BLE001
            last = e
            wait = 2 * attempt
            print(f"    ! 请求失败({attempt}/{retries})：{e}；{wait}s 后重试", file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError(f"GET 失败 {url}: {last}")


def parse_cards(html: str) -> list[dict]:
    items = []
    for m in CARD_RE.finditer(html):
        body = m.group("body")
        img = IMG_RE.search(body)
        ep = EP_RE.search(body)
        cover, title = "", ""
        if img:
            cover = img.group("src").strip()
            title = img.group("alt").strip()
        ep_text = ep.group("ep").strip() if ep else ""
        ep_num = None
        mn = re.search(r"(\d+)", ep_text)
        if mn:
            ep_num = int(mn.group(1))
        items.append({
            "title": title,
            "detail_url": BASE + m.group("href"),
            "cover_url": cover,
            "episodes_text": ep_text,
            "episodes": ep_num,
        })
    return items


def detect_max_page(html: str, category: str) -> int:
    nums = [int(x) for x in re.findall(rf"/category/{re.escape(category)}\?page=(\d+)", html)]
    return max(nums) if nums else 1


def load_existing(out_json: Path) -> dict[str, dict]:
    if out_json.exists():
        data = json.loads(out_json.read_text(encoding="utf-8"))
        return {x["detail_url"]: x for x in data.get("items", [])}
    return {}


def save(out_json: Path, store: dict[str, dict], category: str, *, page: int, note: str) -> None:
    items = sorted(store.values(), key=lambda x: x["detail_url"])
    payload = {
        "source": {
            "name": "红果短剧官网",
            "base_url": BASE,
            "category_url": f"{BASE}/category/{category}",
            "category": category,
            "scope": "仅分类列表页公开可见元数据；未抓取播放页/详情页；未下载任何视频或图片",
            "robots": BASE + "/robots.txt",
            "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "last_page": page,
            "note": note,
        },
        "total": len(items),
        "items": items,
    }
    out_json.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--category", required=True,
                    choices=["real-drama", "comic-drama", "ai-drama"],
                    help="分类标识：real-drama 真人剧 / comic-drama 漫剧 / ai-drama AI剧")
    ap.add_argument("--start-page", type=int, default=1)
    ap.add_argument("--max-page", type=int, default=0, help="0=自动探测末页")
    args = ap.parse_args()

    cat = args.category
    cat_path = f"/category/{cat}"
    out_json = HERE / f"{cat}.json"

    store = load_existing(out_json)
    print(f"分类 {cat}：已有去重记录 {len(store)} 条")

    first_html = http_get(BASE + cat_path)
    max_page = args.max_page or detect_max_page(first_html, cat)
    print(f"分类总页数：{max_page}")

    added_total = 0
    failures: list[int] = []
    for page in range(args.start_page, max_page + 1):
        url = BASE + cat_path + (f"?page={page}" if page > 1 else "")
        try:
            html = first_html if page == 1 and args.start_page == 1 else http_get(url)
            cards = parse_cards(html)
        except Exception as e:  # noqa: BLE001
            print(f"  [第{page}页] 失败保留：{e}", file=sys.stderr)
            failures.append(page)
            save(out_json, store, cat, page=page - 1, note=f"第 {page} 页请求失败，已保留前序结果")
            time.sleep(DELAY_SEC)
            continue

        new = 0
        for c in cards:
            if c["detail_url"] not in store:
                store[c["detail_url"]] = c
                new += 1
        added_total += new
        print(f"  [{cat} 第{page:>2}/{max_page}页] 解析 {len(cards):>2} 条，新增 {new}，累计 {len(store)}")
        save(out_json, store, cat, page=page, note="进行中")
        if page < max_page:
            time.sleep(DELAY_SEC)

    save(out_json, store, cat, page=max_page,
         note=("完成" if not failures else f"部分页失败：{failures}；可重跑续抓"))
    print(f"\n{cat} 完成：本轮新增 {added_total} 条，累计去重后 {len(store)} 条 → {out_json}")
    if failures:
        print(f"失败页：{failures}（重跑同一命令会自动续抓去重）", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
