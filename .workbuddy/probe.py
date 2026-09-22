# -*- coding: utf-8 -*-
"""分析分类页 HTML：找出承载视频列表的 SSR 数据结构。"""
import re, pathlib, json

p = pathlib.Path(r"D:\网站全栈项目\项目007\.workbuddy\cat_p1.html")
raw = p.read_bytes()
print("bytes:", len(raw))

for enc in ("utf-8", "gb18030", "latin-1"):
    try:
        html = raw.decode(enc)
        print(f"decoded with: {enc}")
        break
    except Exception:
        continue

# 常见 SSR 数据挂载点
for pat in ("__NEXT_DATA__", "__NUXT__", "__INITIAL_STATE__", "__INITIAL_SSR_STATE__",
            "window.__", "application/ld+json", "__APP_DATA__"):
    n = html.count(pat)
    if n:
        print(f"  pattern {pat!r}: {n} 处")

# ld+json 块
blocks = re.findall(r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
                    html, re.S | re.I)
print(f"\nld+json blocks: {len(blocks)}")
for b in blocks[:2]:
    print("   ", b.strip()[:200].replace("\n", " "))

# 找 window.xxx = {...} 赋值
assigns = re.findall(r'(window\.[A-Za-z_$][\w$]*)\s*=', html)
from collections import Counter
print("\nwindow 赋值变量:", Counter(assigns).most_common(12))

# 详情链接模式
links = re.findall(r'href="(/[a-z0-9\-_/]+)"', html)
c = Counter(links)
print("\n高频链接模式 (top 25):")
for k, v in c.most_common(25):
    print(f"  {v:4d}  {k}")

# 看看是否有 JSON 里含 "episode"/"series"/"title"
for kw in ("cover", "thumbnail", "duration", "episode_count", "real-drama"):
    print(f"\nkw {kw!r} 出现 {html.count(kw)} 次")
