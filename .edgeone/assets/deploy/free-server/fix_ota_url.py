#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
部署后修正 OTA 产物 URL 并重新签名。

原因：seed/seed.py 把发布版本的 artifact_url 硬编码为
http://localhost:8000/files/...，部署到公网后客户端无法下载。
本脚本把 localhost 前缀替换为服务器公网地址，并重新生成
Ed25519 签名（签名内容是 version|build|sha256|url，URL 变了签名必须重算）。

用法（在服务器上，venv 环境下）：
    cd /opt/manju/server
    /opt/manju/venv/bin/python /opt/manju/fix_ota_url.py http://<公网IP>:8000
"""
from __future__ import annotations

import sys
from pathlib import Path

# 允许从任意目录运行：把 server/ 加入 sys.path
SERVER_DIR = Path("/opt/manju/server")
if SERVER_DIR.exists():
    sys.path.insert(0, str(SERVER_DIR))

from app.db import SessionLocal  # noqa: E402
from app.models import OtaRelease  # noqa: E402
from app.security import sign_release  # noqa: E402

LOCALHOST = "http://localhost:8000"


def main() -> int:
    if len(sys.argv) < 2:
        print("用法: fix_ota_url.py <public_base> 例: http://1.2.3.4:8000", file=sys.stderr)
        return 2
    public_base = sys.argv[1].rstrip("/")

    db = SessionLocal()
    updated = 0
    try:
        for rel in db.query(OtaRelease).filter(OtaRelease.artifact_url.isnot(None)).all():
            new_url = rel.artifact_url.replace(LOCALHOST, public_base)
            if new_url == rel.artifact_url:
                continue
            rel.artifact_url = new_url
            if rel.artifact_sha256:
                rel.artifact_signature = sign_release(
                    rel.version, rel.build, rel.artifact_sha256, new_url
                )
            updated += 1
            print(f"  更新 {rel.platform}/{rel.arch or '*'}/{rel.channel} v{rel.version} "
                  f"→ {new_url}")
        db.commit()
    finally:
        db.close()

    print(f"完成：共修正 {updated} 条发布版本（URL + 签名）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
