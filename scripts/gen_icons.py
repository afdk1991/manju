#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成各平台应用图标 —— **零第三方依赖**（纯标准库 zlib/struct 手写 PNG/ICO/ICNS）。

设计：深蓝→紫的竖向渐变背景 + 居中的白色播放三角，呼应"漫剧视频"定位。
生成的是**可用的占位图标**；正式发布前建议替换为专业设计的品牌图标。

用法：
    python scripts/gen_icons.py                       # 生成到默认目录（Tauri 端）
    python scripts/gen_icons.py --out-dir ./icons     # 指定输出目录
    python scripts/gen_icons.py --bg-top "#1a237e" --bg-bottom "#7b1fa2"

输出文件（Tauri 打包所需的最小集合）：
    32x32.png         Windows 任务栏小图标
    128x128.png       Linux / 通用
    128x128@2x.png    高分屏（256x256 实际）
    icon.png          1024x1024，Linux AppImage 用
    icon.ico          Windows 可执行文件图标（内嵌 PNG）
    icon.icns         macOS 应用图标（内嵌 PNG，ic08 条目）
"""
from __future__ import annotations

import argparse
import struct
import zlib
from pathlib import Path

# ----------------------------------------------------------------------
# 颜色
# ----------------------------------------------------------------------

def hex_to_rgb(value: str) -> tuple[int, int, int]:
    """把 #RRGGBB 解析成 RGB 元组。"""
    v = value.lstrip("#")
    if len(v) != 6:
        raise argparse.ArgumentTypeError(f"颜色格式应为 #RRGGBB，收到：{value}")
    return (int(v[0:2], 16), int(v[2:4], 16), int(v[4:6], 16))


def mix(c1: tuple[int, int, int], c2: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    """线性插值混合两个颜色。"""
    return (
        int(c1[0] + (c2[0] - c1[0]) * t),
        int(c1[1] + (c2[1] - c1[1]) * t),
        int(c1[2] + (c2[2] - c1[2]) * t),
    )


# ----------------------------------------------------------------------
# 绘制
# ----------------------------------------------------------------------

def render(size: int, top: tuple[int, int, int], bottom: tuple[int, int, int]) -> list[list[tuple[int, int, int, int]]]:
    """
    逐像素渲染图标，返回 RGBA 二维数组。

    构图：圆角矩形渐变背景 + 居中白色播放三角。
    圆角半径取短边的 18%，播放三角占整体 46%。
    """
    radius = size * 0.18
    tri = size * 0.46  # 三角形外接尺寸
    cx = cy = size / 2.0

    # 三角形三顶点（等腰，尖端朝右）
    tri_left = cx - tri / 2
    tri_right = cx + tri / 2
    tri_top = cy - tri / 2
    tri_bottom = cy + tri / 2

    rows: list[list[tuple[int, int, int, int]]] = []
    for y in range(size):
        row: list[tuple[int, int, int, int]] = []
        for x in range(size):
            # --- 背景渐变 ---
            t = y / max(size - 1, 1)
            r, g, b = mix(top, bottom, t)

            # --- 圆角遮罩（超出圆角部分设为透明）---
            px, py = x + 0.5, y + 0.5
            alpha = 255
            # 判断四个角
            if px < radius and py < radius:
                if (radius - px) ** 2 + (radius - py) ** 2 > radius ** 2:
                    alpha = 0
            elif px > size - radius and py < radius:
                if (px - (size - radius)) ** 2 + (radius - py) ** 2 > radius ** 2:
                    alpha = 0
            elif px < radius and py > size - radius:
                if (radius - px) ** 2 + (py - (size - radius)) ** 2 > radius ** 2:
                    alpha = 0
            elif px > size - radius and py > size - radius:
                if (px - (size - radius)) ** 2 + (py - (size - radius)) ** 2 > radius ** 2:
                    alpha = 0

            # --- 播放三角（点在多边形内的重心坐标判定）---
            if alpha == 255 and _in_triangle(px, py, tri_left, tri_top, tri_right, cy, tri_left, tri_bottom):
                # 三角内部用纯白，边缘做 1 像素抗锯齿
                r, g, b = 255, 255, 255

            row.append((r, g, b, alpha))
        rows.append(row)
    return rows


def _in_triangle(px: float, py: float, x1: float, y1: float,
                 x2: float, y2: float, x3: float, y3: float) -> bool:
    """用重心坐标判断点是否落在三角形内（含边界）。"""
    denom = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3)
    if denom == 0:
        return False
    a = ((y2 - y3) * (px - x3) + (x3 - x2) * (py - y3)) / denom
    b = ((y3 - y1) * (px - x3) + (x1 - x3) * (py - y3)) / denom
    c = 1.0 - a - b
    return a >= -0.001 and b >= -0.001 and c >= -0.001


# ----------------------------------------------------------------------
# 编码：PNG / ICO / ICNS
# ----------------------------------------------------------------------

def _chunk(tag: bytes, data: bytes) -> bytes:
    """构造一个 PNG chunk（长度 + 类型 + 数据 + CRC32）。"""
    return (
        struct.pack(">I", len(data))
        + tag
        + data
        + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    )


def encode_png(rows: list[list[tuple[int, int, int, int]]]) -> bytes:
    """把 RGBA 像素数组编码成 PNG（色深 8，颜色类型 6 = RGBA）。"""
    height = len(rows)
    width = len(rows[0])

    raw = bytearray()
    for row in rows:
        raw.append(0)  # 过滤器类型：None
        for r, g, b, a in row:
            raw += bytes((r, g, b, a))

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + _chunk(b"IHDR", ihdr)
        + _chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + _chunk(b"IEND", b"")
    )


def wrap_ico(png_bytes: bytes, size: int) -> bytes:
    """
    把 PNG 包装成 ICO。

    Windows Vista 起 ICO 支持内嵌 PNG；尺寸 >=256 时宽高字段写 0。
    """
    b = 0 if size >= 256 else size
    header = struct.pack("<HHH", 0, 1, 1)  # reserved, type=icon, count=1
    entry = struct.pack(
        "<BBBBHHII",
        b, b,        # width, height
        0,           # 调色板色数
        0,           # reserved
        1,           # 色彩平面
        32,          # 每像素位数
        len(png_bytes),
        6 + 16,      # 数据偏移 = ICONDIR(6) + ICONDIRENTRY(16)
    )
    return header + entry + png_bytes


def wrap_icns(png_bytes: bytes) -> bytes:
    """
    把 PNG 包装成 ICNS。

    macOS 的 icns 容器可内嵌 PNG，这里写入 ic08（256x256）条目，
    系统会按需缩放；这是体积与兼容性最平衡的做法。
    """
    entry_type = b"ic08"
    entry = entry_type + struct.pack(">I", len(png_bytes) + 8) + png_bytes
    return b"icns" + struct.pack(">I", len(entry) + 8) + entry


# ----------------------------------------------------------------------
# 主流程
# ----------------------------------------------------------------------

def main() -> int:
    default_out = Path(__file__).resolve().parent.parent / "clients" / "manju_tauri" / "src-tauri" / "icons"

    p = argparse.ArgumentParser(description="生成各平台应用图标（零依赖）")
    p.add_argument("--out-dir", default=str(default_out), help="图标输出目录")
    p.add_argument("--bg-top", default="#1a237e", help="渐变顶部颜色 #RRGGBB")
    p.add_argument("--bg-bottom", default="#7b1fa2", help="渐变底部颜色 #RRGGBB")
    args = p.parse_args()

    top = hex_to_rgb(args.bg_top)
    bottom = hex_to_rgb(args.bg_bottom)
    out = Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)

    # Tauri 打包需要的尺寸集合：(文件名, 实际像素)
    targets = [
        ("32x32.png", 32),
        ("128x128.png", 128),
        ("128x128@2x.png", 256),
        ("icon.png", 1024),
    ]

    print(f"图标输出目录：{out}")
    print(f"配色：{args.bg_top} → {args.bg_bottom}\n")

    png_cache: dict[int, bytes] = {}

    for name, size in targets:
        rows = render(size, top, bottom)
        data = encode_png(rows)
        png_cache[size] = data
        (out / name).write_bytes(data)
        print(f"  ✓ {name:<20} {size}x{size}  {len(data):>7,} 字节")

    # ICO（Windows）：用 256x256 PNG 内嵌
    ico_data = wrap_ico(png_cache[256], 256)
    (out / "icon.ico").write_bytes(ico_data)
    print(f"  ✓ {'icon.ico':<20} 256x256  {len(ico_data):>7,} 字节")

    # ICNS（macOS）：ic08 条目
    icns_data = wrap_icns(png_cache[256])
    (out / "icon.icns").write_bytes(icns_data)
    print(f"  ✓ {'icon.icns':<20} 256x256  {len(icns_data):>7,} 字节")

    print("\n完成。Tauri 打包所需的图标已齐备。")
    print("提示：这是占位图标，正式发布前请替换为品牌设计的版本。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
