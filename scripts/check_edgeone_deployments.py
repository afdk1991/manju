#!/usr/bin/env python3
"""
查询 EdgeOne Makers 项目的云端部署状态。

用途：当 CI 或本地部署出现 "上传成功 / 部署单已创建 / 云端构建 Failed" 时，
      CI 日志拿不到云端原因（projectId / deploymentId 均为 EMPTY），
      用本脚本直接调 Pages API 拿到真实的 Status 与错误 Code。

用法：
    python scripts/check_edgeone_deployments.py                # 默认项目 manju
    python scripts/check_edgeone_deployments.py --limit 20
    python scripts/check_edgeone_deployments.py --project makers-xxxx

鉴权（二选一，优先环境变量）：
    1) 环境变量 EDGEONE_PAGES_API_TOKEN
    2) 本机 edgeone CLI 的登录缓存 ~/.edgeone/<hash>（key=eo_token → value.Token）
"""

import argparse
import json
import os
import pathlib
import sys
import urllib.error
import urllib.request

API = "https://pages-api.cloud.tencent.com/v1"
DEFAULT_PROJECT_ID = "makers-vypuaynzkt0c"

# 实测得到的错误码 → 已知根因（持续追加）
KNOWN_CODES = {
    18: "云端构建失败。最常见根因：cloud-functions 目录内存在**含方括号的文件名**"
        "（如 [[default]].js / [id].js），构建器无法解析导致约 15 秒即 Failed。"
        " → 检查 makers/cloud-functions 下是否有 `[` 或 `]` 命名的文件。",
}


def load_token() -> str | None:
    env = os.environ.get("EDGEONE_PAGES_API_TOKEN")
    if env and env.strip():
        return env.strip()
    d = pathlib.Path.home() / ".edgeone"
    if not d.exists():
        return None
    for p in d.iterdir():
        if not p.is_file() or p.name == "pages-config.json":
            continue
        try:
            raw = json.loads(p.read_text(encoding="utf-8", errors="replace"))
        except (ValueError, OSError):
            continue
        if isinstance(raw, dict) and raw.get("key") == "eo_token":
            v = raw.get("value")
            if isinstance(v, dict):
                for k in ("Token", "Active", "value", "token"):
                    s = v.get(k)
                    if isinstance(s, str) and s.strip():
                        return s.strip()
    return None


def call(action: str, data: dict, token: str) -> dict:
    body = json.dumps({"Action": action, **data}, ensure_ascii=False).encode()
    req = urllib.request.Request(
        API,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
            "User-Agent": "manju-diag/1.0",
        },
    )
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", default=DEFAULT_PROJECT_ID)
    ap.add_argument("--limit", type=int, default=8)
    args = ap.parse_args()

    tok = load_token()
    if not tok:
        print("NO_TOKEN: 未取到 API token。"
              "请设置环境变量 EDGEONE_PAGES_API_TOKEN，或先执行 edgeone login")
        return 2

    try:
        res = call("DescribePagesDeployments",
                   {"ProjectId": args.project, "Offset": 0,
                    "Limit": args.limit, "OrderBy": "CreatedOn", "Order": "Desc"},
                   tok)
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:300]}")
        return 3
    except Exception as e:  # noqa: BLE001
        print(f"ERROR: {e}")
        return 3

    if res.get("Code") != 0:
        print("API Code:", res.get("Code"), "| Message:", res.get("Message"))
        return 4
    resp = (res.get("Data") or {}).get("Response") or {}
    err = resp.get("Error")
    if err:
        print("API Error:", err.get("Code"), err.get("Message"))
        return 4

    deps = resp.get("Deployments") or []
    print(f"project: {args.project}   共 {len(deps)} 条\n")
    print(f"{'DeploymentId':16} {'Status':10} {'Code':5} {'Env':11} {'Prod':5} {'构建ms':8} 创建时间")
    for x in deps:
        print(f"{x.get('DeploymentId',''):16} {x.get('Status',''):10} "
              f"{str(x.get('Code') or '-'):5} {x.get('Env',''):11} "
              f"{str(x.get('UsedInProd')):5} {str(x.get('BuildCost') or '-'):8} "
              f"{x.get('CreatedOn','')}")

    bad = [x for x in deps if (x.get("Code") or 0) != 0]
    if bad:
        codes = sorted({x["Code"] for x in bad})
        print(f"\n⚠️ 存在异常部署，Code = {codes}")
        for c in codes:
            tip = KNOWN_CODES.get(c)
            if tip:
                print(f"  [Code {c}] {tip}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
