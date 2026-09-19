#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
补齐**四端所有平台**的应用图标 —— 零第三方依赖（复用 gen_icons.py 的纯标准库编码）。

背景：之前只生成了 Tauri 端的 icons/，其余各端的图标资源仍然缺失：
  - Flutter Windows : windows/runner/resources/app_icon.ico 缺失 → MSVC 资源编译失败
  - Flutter ohos    : base/media/* 缺失 → module.json5 的 $media: 引用解析失败
  - RN Android      : res/mipmap-*/ic_launcher.png 缺失 → AndroidManifest 的
                      @mipmap/ic_launcher 解析失败，Gradle 直接报错
  - RN harmony      : base/media/* 缺失 → 同 Flutter ohos

本脚本一次性生成上述全部文件。图标为"深蓝→紫渐变 + 白色播放三角"的占位设计，
正式发布前建议替换为品牌图标（替换后重新运行 dist/ 打包即可）。

用法：
    python scripts/gen_icons_all.py
"""
from __future__ import annotations

import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from gen_icons import encode_png, hex_to_rgb, render  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CLIENT_DIR = ROOT / "clients"

TOP = hex_to_rgb("#1a237e")
BOTTOM = hex_to_rgb("#7b1fa2")


# ----------------------------------------------------------------------
# 多尺寸 ICO（Windows 需要，单尺寸在高 DPI 下会模糊）
# ----------------------------------------------------------------------

def wrap_ico_multi(entries: list[tuple[int, bytes]]) -> bytes:
    """把多张 PNG 打包成单个 ICO；尺寸 >=256 时宽高字段写 0（ICO 规范）。"""
    count = len(entries)
    header = struct.pack("<HHH", 0, 1, count)
    offset = 6 + 16 * count
    dir_block = b""
    for size, png in entries:
        b = 0 if size >= 256 else size
        dir_block += struct.pack(
            "<BBBBHHII",
            b, b, 0, 0, 1, 32, len(png), offset,
        )
        offset += len(png)
    return header + dir_block + b"".join(png for _, png in entries)


def png_at(size: int) -> bytes:
    """渲染并编码一张渐变底 + 播放三角的方形 PNG。"""
    return encode_png(render(size, TOP, BOTTOM))


def write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    print(f"  [√] {path.relative_to(ROOT)}  ({len(data)} bytes)")


# ----------------------------------------------------------------------
# 各端生成
# ----------------------------------------------------------------------

def gen_flutter_windows() -> None:
    print("[Flutter / Windows]")
    out = CLIENT_DIR / "manju_flutter" / "windows" / "runner" / "resources" / "app_icon.ico"
    ico = wrap_ico_multi([(s, png_at(s)) for s in (16, 32, 48, 64, 128, 256)])
    write(out, ico)


def gen_flutter_linux() -> None:
    print("[Flutter / Linux]")
    # Flutter Linux 模板默认不引用图标文件，这里放一张 128 PNG 供打包脚本选用。
    out = CLIENT_DIR / "manju_flutter" / "linux" / "icon.png"
    write(out, png_at(128))


def gen_harmony_media(base: Path) -> None:
    """鸿蒙端 base/media 资源：layered_image 的前景/背景 + 启动窗口图标。"""
    media = base / "entry" / "src" / "main" / "resources" / "base" / "media"
    write(media / "background.png", png_at(432))
    write(media / "foreground.png", png_at(432))
    write(media / "startIcon.png", png_at(256))
    write(media / "app_icon.png", png_at(192))


def gen_rn_android() -> None:
    print("[React Native / Android]")
    res = CLIENT_DIR / "manju_rn" / "android" / "app" / "src" / "main" / "res"
    # Android 各密度桶的标准启动图标尺寸
    buckets = {
        "mipmap-mdpi": 48,
        "mipmap-hdpi": 72,
        "mipmap-xhdpi": 96,
        "mipmap-xxhdpi": 144,
        "mipmap-xxxhdpi": 192,
    }
    for folder, size in buckets.items():
        write(res / folder / "ic_launcher.png", png_at(size))


def main() -> int:
    gen_flutter_windows()
    gen_flutter_linux()

    print("[Flutter / HarmonyOS]")
    gen_harmony_media(CLIENT_DIR / "manju_flutter" / "ohos")

    print("[React Native / HarmonyOS]")
    gen_harmony_media(CLIENT_DIR / "manju_rn" / "harmony")

    gen_rn_android()

    print("\n全部图标生成完毕。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
