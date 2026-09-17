#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
对运行中的后端做端到端冒烟测试。

用法：
    python scripts/smoke_test.py --api http://localhost:8000
    python scripts/smoke_test.py --api http://localhost:8000 --verbose

全部用例通过才返回退出码 0。
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

PASS, FAIL = "PASS", "FAIL"
_results: list[tuple[str, str, str]] = []


def req(url: str, method: str = "GET", body: dict | None = None,
        headers: dict | None = None) -> tuple[int, str]:
    """发起 HTTP 请求，返回 (状态码, 响应体文本)。"""
    data = json.dumps(body).encode("utf-8") if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        r.add_header(k, v)
    try:
        with urllib.request.urlopen(r, timeout=15) as resp:
            return resp.status, resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")
    except urllib.error.URLError as e:
        return 0, f"CONNECTION_ERROR: {e.reason}"


def check(name: str, cond: bool, detail: str = "") -> bool:
    """记录一条用例结果。"""
    _results.append((name, PASS if cond else FAIL, detail))
    print(f"  [{'√' if cond else '×'}] {name}" + (f"  -> {detail}" if detail else ""))
    return cond


def ota_url(api: str, **params) -> str:
    return api.rstrip("/") + "/api/v1/ota/check?" + urllib.parse.urlencode(params)


def run(api: str, admin_key: str = "") -> int:
    print(f"\n>>> 冒烟目标：{api}\n")

    # ---------- 1. 内容接口 ----------
    print("[内容中台]")
    code, body = req(f"{api}/api/v1/home")
    ok = check("GET /home 返回 200", code == 200, f"HTTP {code}")
    if ok:
        try:
            sections = json.loads(body).get("sections", [])
            check("/home 返回非空分区", len(sections) > 0, f"{len(sections)} 个分区")
        except json.JSONDecodeError:
            check("/home 返回合法 JSON", False, body[:80])

    code, body = req(f"{api}/api/v1/categories")
    check("GET /categories 返回 200", code == 200, f"HTTP {code}")

    code, body = req(f"{api}/api/v1/series?page=1&size=5")
    ok = check("GET /series 返回 200", code == 200, f"HTTP {code}")
    first_series_id = None
    if ok:
        try:
            items = json.loads(body).get("items", [])
            check("/series 返回非空列表", len(items) > 0, f"{len(items)} 条")
            if items:
                first_series_id = items[0].get("id")
        except json.JSONDecodeError:
            check("/series 返回合法 JSON", False, body[:80])

    if first_series_id:
        code, _ = req(f"{api}/api/v1/series/{first_series_id}")
        check(f"GET /series/{first_series_id} 返回 200", code == 200, f"HTTP {code}")
        code, _ = req(f"{api}/api/v1/series/{first_series_id}/episodes")
        check("GET /series/{id}/episodes 返回 200", code == 200, f"HTTP {code}")

    code, _ = req(f"{api}/api/v1/search?q=%E5%BC%80%E5%B1%80")
    check("GET /search 返回 200", code == 200, f"HTTP {code}")

    code, _ = req(f"{api}/api/v1/series/definitely-not-exist")
    check("不存在的剧集返回 404", code == 404, f"HTTP {code}")

    # ---------- 2. OTA 场景 ----------
    print("\n[OTA 更新服务]")

    # 场景 A：Windows 有更新（假设服务端已发布 9.9.9）
    code, body = req(ota_url(api, platform="windows", arch="x86_64",
                             channel="stable", version="0.0.1", build=1,
                             device_id="smoke-test-device"))
    if code == 200:
        try:
            d = json.loads(body)
            has = d.get("has_update")
            check("Windows 有更新场景：has_update=true", has is True, f"has_update={has}")
            if has:
                rel = d.get("release", {})
                art = rel.get("artifact", {})
                check("响应含 artifact.sha256", bool(art.get("sha256")),
                      str(art.get("sha256"))[:16] + "...")
                check("policy 取值合法",
                      d.get("policy") in ("suggest", "forced", "silent"),
                      str(d.get("policy")))
        except json.JSONDecodeError:
            check("Windows 场景返回合法 JSON", False, body[:80])
    elif code == 204:
        check("Windows 有更新场景：has_update=true", False,
              "返回 204，服务端尚未发布比 0.0.1 更高的版本（请先发布一版）")
    else:
        check("Windows 有更新场景返回 200/204", False, f"HTTP {code} {body[:80]}")

    # 场景 B：无更新（请求一个极高的版本）
    code, body = req(ota_url(api, platform="windows", arch="x86_64",
                             channel="stable", version="99.0.0", build=9999,
                             device_id="smoke-test-device"))
    check("无更新场景返回 204", code == 204, f"HTTP {code}")

    # 场景 C：iOS 必须走商店兜底，绝不能给自安装产物
    code, body = req(ota_url(api, platform="ios", arch="arm64",
                             channel="stable", version="0.0.1", build=1,
                             device_id="smoke-test-device"))
    if code == 200:
        try:
            d = json.loads(body)
            fb = d.get("store_fallback") or {}
            check("iOS 场景：store_fallback.enabled=true", fb.get("enabled") is True,
                  f"enabled={fb.get('enabled')}")
            check("iOS 场景：store_fallback 含跳转 URL", bool(fb.get("url")),
                  str(fb.get("url"))[:50])
            check("iOS 场景：policy 不得为 silent",
                  d.get("policy") != "silent", f"policy={d.get('policy')}")
        except json.JSONDecodeError:
            check("iOS 场景返回合法 JSON", False, body[:80])
    elif code == 204:
        check("iOS 场景返回 200", False, "返回 204，服务端尚未发布 iOS 版本")
    else:
        check("iOS 场景返回 200/204", False, f"HTTP {code} {body[:80]}")

    # 场景 D：非法平台参数
    code, _ = req(ota_url(api, platform="windows98", arch="x86_64",
                          channel="stable", version="1.0.0", build=1,
                          device_id="smoke-test-device"))
    check("非法 platform 返回 400", code == 400, f"HTTP {code}")

    # 场景 E：降级拦截（若服务端已发布 9.9.9，请求 8.0.0 且当前高于它时应拒绝）
    code, body = req(ota_url(api, platform="windows", arch="x86_64",
                             channel="stable", version="9.9.9", build=999,
                             device_id="smoke-test-device"))
    check("已是最新版本时返回 204", code == 204, f"HTTP {code}")

    # ---------- 3. 上报 ----------
    print("\n[OTA 上报]")
    code, _ = req(f"{api}/api/v1/ota/report", method="POST", body={
        "device_id": "smoke-test-device",
        "platform": "windows",
        "version": "0.0.1",
        "build": 1,
        "event": "skipped",
        "reason": "smoke_test",
        "elapsed_ms": 0,
    })
    check("POST /ota/report 返回 202", code == 202, f"HTTP {code}")

    # ---------- 汇总 ----------
    failed = [r for r in _results if r[1] == FAIL]
    total = len(_results)
    print("\n" + "=" * 60)
    print(f"冒烟结果：{total - len(failed)}/{total} 通过")
    if failed:
        print("失败用例：")
        for name, _, detail in failed:
            print(f"  - {name}  {detail}")
    print("=" * 60)
    return 0 if not failed else 1


def main() -> int:
    p = argparse.ArgumentParser(description="后端 OTA 与内容接口冒烟测试")
    p.add_argument("--api", default="http://localhost:8000")
    p.add_argument("--admin-key", default="")
    p.add_argument("--verbose", action="store_true")
    a = p.parse_args()
    return run(a.api, a.admin_key)


if __name__ == "__main__":
    raise SystemExit(main())
