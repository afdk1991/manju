# -*- coding: utf-8 -*-
"""漫剧辅助素材获取器（仅 CC0 / 可商用授权来源，合规安全）。

设计红线：
- 只命中带明确 CC0 / Free-to-use 许可的官方 API（Pexels、Pixabay、Openverse）。
- Openverse 为 Creative Commons 官方聚合 API，无需 key，可按 license=cc0 过滤，合规可程序化访问。
- 绝不抓取任何主流漫剧平台正片或第三方搬运站。
- 每个下载素材自动写入 provenance.jsonl 留痕（来源/作者/license/时间/落盘路径）。

用法：
  # 预检（无 Pexels/Pixabay key 时只打印计划，不下载）
  python scripts/acquire_assets.py --provider pixabay --query "comic background" --dry-run

  # Openverse（keyless，CC0 过滤）：图片
  python scripts/acquire_assets.py --provider openverse --media image --query "comic city night" \
      --out server/data/artifacts/manju/demo_ai_rebirth --limit 2

  # Openverse：CC0 音频（BGM / SFX）
  python scripts/acquire_assets.py --provider openverse --media audio --query "cinematic ambient" \
      --out server/data/artifacts/manju/demo_ai_rebirth/audio --limit 1
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
PROVENANCE = PROJECT_ROOT / "content" / "library" / "provenance.jsonl"

# 需要私有 key 的 provider
KEYED_PROVIDERS = {"pixabay", "pexels"}
# 全部合规 provider（均 CC0 / 可商用）
CC0_PROVIDERS = {"pixabay", "pexels", "openverse"}


def _get_json(url: str, headers: dict | None = None, timeout: int = 20) -> dict:
    req = urllib.request.Request(url, headers=headers or {"User-Agent": "manju-acquire/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def _get_bytes(url: str, timeout: int = 30) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "manju-acquire/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def _save_provenance(record: dict) -> None:
    PROVENANCE.parent.mkdir(parents=True, exist_ok=True)
    with PROVENANCE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


def fetch_pixabay(query: str, limit: int, out: Path, api_key: str) -> list[dict]:
    """Pixabay API：素材为 CC0（免署名商用）。"""
    params = urllib.parse.urlencode({"key": api_key, "q": query, "per_page": min(limit, 20), "image_type": "all"})
    data = _get_json(f"https://pixabay.com/api/?{params}")
    rows = []
    for h in data.get("hits", [])[:limit]:
        url = h.get("webformatURL") or h.get("largeImageURL")
        if not url:
            continue
        rows.append({
            "provider": "pixabay", "license": "CC0", "author": h.get("user", "unknown"),
            "source_url": h.get("pageURL", url), "media_url": url,
            "saved_to": str(out / Path(url).name),
        })
    return rows


def fetch_pexels(query: str, limit: int, out: Path, api_key: str) -> list[dict]:
    """Pexels API：图片/视频为免费商用（Pexels License，无需署名）。"""
    params = urllib.parse.urlencode({"query": query, "per_page": min(limit, 20)})
    data = _get_json(f"https://api.pexels.com/v1/search?{params}", headers={"Authorization": api_key})
    rows = []
    for h in data.get("photos", [])[:limit]:
        url = h.get("src", {}).get("original") or h.get("src", {}).get("large")
        if not url:
            continue
        rows.append({
            "provider": "pexels", "license": "Free to use (Pexels License)",
            "author": h.get("photographer", "unknown"), "source_url": h.get("url", url),
            "media_url": url, "saved_to": str(out / Path(url).name),
        })
    return rows


def fetch_openverse(query: str, limit: int, out: Path, media: str) -> list[dict]:
    """Openverse（Creative Commons 官方聚合，keyless）。仅取 license=cc0。"""
    endpoint = "audio" if media == "audio" else "images"
    params = urllib.parse.urlencode({"q": query, "license": "cc0", "page_size": min(limit, 20)})
    data = _get_json(f"https://api.openverse.org/v1/{endpoint}/?{params}")
    rows = []
    for r in data.get("results", [])[:limit]:
        url = r.get("url")
        if not url:
            continue
        rows.append({
            "provider": "openverse", "media_type": media,
            "license": r.get("license", "cc0"), "author": r.get("creator") or "unknown",
            "source_url": r.get("foreign_landing_url") or url, "source_site": r.get("source", ""),
            "media_url": url, "saved_to": str(out / Path(url).name),
        })
    return rows


def main() -> int:
    ap = argparse.ArgumentParser(description="CC0 漫剧辅助素材获取器")
    ap.add_argument("--provider", required=True, choices=sorted(CC0_PROVIDERS))
    ap.add_argument("--query", required=True, help="素材检索词（英文命中率更高）")
    ap.add_argument("--out", required=True, help="落盘目录（相对/绝对均可）")
    ap.add_argument("--media", choices=["image", "audio"], default="image", help="openverse 媒介类型")
    ap.add_argument("--limit", type=int, default=5)
    ap.add_argument("--dry-run", action="store_true", help="只打印计划，不下载")
    args = ap.parse_args()

    out = Path(args.out)
    env_key = {"pixabay": "MANJU_PIXABAY_KEY", "pexels": "MANJU_PEXELS_KEY"}.get(args.provider)
    api_key = os.environ.get(env_key, "") if env_key else ""

    # 需要 key 的 provider 缺 key 时进入纯计划模式（不联网）
    if env_key and not api_key:
        print(f"[dry-run] 未检测到 {env_key}，仅输出计划（不联网、不下载）。")
        args.dry_run = True

    if args.dry_run and env_key and not api_key:
        print(f"  计划：provider={args.provider} query={args.query!r} limit={args.limit} out={out}")
        print("  → 提供对应 API key（环境变量）后重新运行即可实际获取。")
        return 0

    if args.provider == "pixabay":
        rows = fetch_pixabay(args.query, args.limit, out, api_key)
    elif args.provider == "pexels":
        rows = fetch_pexels(args.query, args.limit, out, api_key)
    else:
        rows = fetch_openverse(args.query, args.limit, out, args.media)

    print(f"候选素材 {len(rows)} 个（provider={args.provider}, query={args.query!r}）")
    for r in rows:
        print(f"  - {r['media_url']}  | author={r['author']} | license={r['license']}")

    if args.dry_run:
        print("[dry-run] 已列出候选，未写入任何文件。去掉 --dry-run 重新运行以实际下载。")
        return 0

    out.mkdir(parents=True, exist_ok=True)
    ok = 0
    for r in rows:
        try:
            blob = _get_bytes(r["media_url"])
            dest = out / Path(r["media_url"]).name
            # 防御：避免重名覆盖
            if dest.exists():
                dest = out / f"{dest.stem}_{ok}{dest.suffix}"
            dest.write_bytes(blob)
            r["saved_to"] = str(dest)
            r["downloaded_at"] = datetime.now(timezone.utc).isoformat()
            _save_provenance(r)
            ok += 1
            print(f"  ✓ {dest}  (provenance 已记录)")
        except Exception as e:
            print(f"  ✗ 下载失败 {r['media_url']}: {e}", file=sys.stderr)
    print(f"完成：成功 {ok}/{len(rows)}，凭证见 {PROVENANCE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
