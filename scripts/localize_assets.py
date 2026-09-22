#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 makers 静态站依赖的境外资源本地化，避免部署后"打不开/很慢/看起来没内容"。

背景：upload.wikimedia.org / thumb.wikimedia.org 在大陆间歇性不可用
（实测加载 4~15s，且 3 次里约 1 次连接超时），直接外链会导致页面长时间空白。

本脚本做两件事（均幂等，已存在则跳过）：
  1. 下载 hls.js 到 static/js/hls.min.js（让 Chrome/Firefox 也能播 HLS）
  2. 遍历 static/api/v1/**/*.json，把 cover / poster / banner / thumbnail 指向的
     境外图片下载到 static/files/covers/，并把 JSON 里的 URL 改写为站内相对路径
     `files/covers/<name>`（hash 路由下始终从站点根解析，安全）

用法（项目根目录执行）：
    python scripts/localize_assets.py
"""
from __future__ import annotations

import hashlib
import json
import urllib.request
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
STATIC = PROJECT_ROOT / "makers" / "static"
API_DIR = STATIC / "api" / "v1"
COVERS = STATIC / "files" / "covers"
# 注意：目录名不能叫 `vendor` —— EdgeOne Makers 的 StaticAssetsBuilder 会跳过该目录，
# 导致文件不进部署包（实测踩坑）。改用常规的 `js/`。
VENDOR = STATIC / "js"

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")

IMAGE_FIELDS = ("cover", "poster", "banner", "thumbnail")

HLS_URL = "https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js"


def download(url: str, dest: Path, attempts: int = 3, timeout: int = 40) -> bool:
    """带重试的下载。返回是否成功。"""
    if dest.exists() and dest.stat().st_size > 0:
        return True
    for i in range(attempts):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = resp.read()
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)
            return True
        except Exception as e:  # noqa: BLE001 - 网络类错误统一重试
            print(f"    重试 {i + 1}/{attempts} 失败：{type(e).__name__}: {e}")
    return False


def local_name(url: str) -> str:
    ext = ".jpg"
    low = url.lower().split("?")[0]
    for e in (".jpg", ".jpeg", ".png", ".webp", ".gif"):
        if low.endswith(e):
            ext = e
            break
    return hashlib.md5(url.encode("utf-8")).hexdigest()[:16] + ext


def main() -> int:
    print("== 1. 本地化 hls.js ==")
    VENDOR.mkdir(parents=True, exist_ok=True)
    hls = VENDOR / "hls.min.js"
    ok = download(HLS_URL, hls)
    print(f"  {'OK  ' if ok else 'FAIL'} vendor/hls.min.js "
          f"({hls.stat().st_size if hls.exists() else 0} bytes)")

    print("\n== 2. 本地化封面/海报/缩略图 ==")
    COVERS.mkdir(parents=True, exist_ok=True)
    jsons = sorted(API_DIR.rglob("*.json"))
    cache: dict[str, str] = {}
    changed = failed = skipped = 0

    for jf in jsons:
        try:
            data = json.loads(jf.read_text(encoding="utf-8"))
        except Exception as e:  # noqa: BLE001
            print(f"  ! 跳过无法解析：{jf.name} ({e})")
            continue

        def walk(node):
            nonlocal changed, failed, skipped
            if isinstance(node, dict):
                for k, v in list(node.items()):
                    if k in IMAGE_FIELDS and isinstance(v, str) and v.startswith("http"):
                        if v in cache:
                            node[k] = cache[v]
                            changed += 1
                            continue
                        name = local_name(v)
                        dest = COVERS / name
                        if download(v, dest, attempts=3, timeout=45):
                            rel = f"files/covers/{name}"
                            cache[v] = rel
                            node[k] = rel
                            changed += 1
                        else:
                            cache[v] = v
                            failed += 1
                    else:
                        walk(v)
            elif isinstance(node, list):
                for item in node:
                    walk(item)

        original = json.dumps(data, ensure_ascii=False, sort_keys=True)
        walk(data)
        new = json.dumps(data, ensure_ascii=False, sort_keys=True)
        if new != original:
            jf.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
        else:
            skipped += 1

    print(f"  改写字段 {changed} 处，失败 {failed} 处，无需改动的文件 {skipped} 个")
    print(f"  本地图片目录：{COVERS} （{len(list(COVERS.glob('*')))} 个文件）")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
