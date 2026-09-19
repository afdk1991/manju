#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把构建产物转换成符合 OTA 协议 v1 的发布清单，并推送到后端 OTA 服务。

典型用法（Windows 桌面端，可自动静默安装）：
    python scripts/ota_manifest.py ^
        --platform windows --arch x86_64 --channel stable ^
        --version 1.1.0 --build 110 ^
        --file ./dist/manju-1.1.0-win-x64.msix ^
        --notes-zh "修复播放闪退" --api http://localhost:8000 --admin-key devkey

iOS / HarmonyOS（禁止静默安装，必须给商店地址）：
    python scripts/ota_manifest.py ^
        --platform ios --arch arm64 --channel stable ^
        --version 1.1.0 --build 110 --no-artifact ^
        --store-url "https://apps.apple.com/app/id0000000000" ...

先跑 --dry-run 检查生成的 JSON 再正式发布。
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import sys
from pathlib import Path

try:
    from cryptography.hazmat.primitives import serialization
except ImportError:
    sys.exit("缺少依赖 cryptography，请先执行：pip install -r scripts/requirements.txt")

import urllib.error
import urllib.request

# 允许静默自安装的平台 —— 这是操作系统级限制，不可绕过
SILENT_INSTALL_CAPABLE = {"windows", "macos", "linux", "android"}
# 只能引导跳转商店的平台
STORE_ONLY_PLATFORMS = {"ios", "harmonyos"}
ALL_PLATFORMS = SILENT_INSTALL_CAPABLE | STORE_ONLY_PLATFORMS

# 各平台允许的产物类型，防止传错文件
ARTIFACT_TYPES = {
    "windows": {"msix", "exe", "zip"},
    "macos": {"dmg", "pkg", "zip"},
    "linux": {"appimage", "deb", "rpm", "tar_gz", "zip"},
    "android": {"apk", "aab"},
    "ios": {"ipa"},
    "harmonyos": {"hap", "app"},
}


def sha256_of(path: Path) -> str:
    """流式计算文件 SHA256，避免大文件占内存。"""
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def sign(private_key_path: Path, message: str) -> str:
    """用 Ed25519 私钥对规范化签名消息签名，返回协议约定的 'ed25519:<base64>' 格式。"""
    if not private_key_path.is_file():
        print(f"[错误] 私钥不存在：{private_key_path}", file=sys.stderr)
        print("       请先运行： python scripts/gen_keypair.py", file=sys.stderr)
        sys.exit(2)
    private_key = serialization.load_pem_private_key(
        private_key_path.read_bytes(), password=None
    )
    signature = private_key.sign(message.encode("utf-8"))
    return "ed25519:" + base64.b64encode(signature).decode("ascii")


def guess_type(path: Path, platform: str) -> str:
    """从文件扩展名推断产物类型。"""
    ext = path.suffix.lower().lstrip(".")
    if ext == "gz" and ".tar" in path.name.lower():
        return "tar_gz"
    if ext == "appimage":
        return "appimage"
    return ext


def build_manifest(args: argparse.Namespace) -> dict:
    """构造符合 OTA 协议 v1 的发布请求体。"""
    manifest: dict = {
        "platform": args.platform,
        "arch": args.arch,
        "channel": args.channel,
        "version": args.version,
        "build": args.build,
        "min_supported_version": args.min_supported_version or args.version,
        "notes_i18n": {},
        "rollout_percent": args.rollout,
    }

    if args.notes_zh:
        manifest["notes_i18n"]["zh-CN"] = args.notes_zh
    if args.notes_en:
        manifest["notes_i18n"]["en"] = args.notes_en

    # 商店兜底：iOS / HarmonyOS 必填，其他平台可选
    if args.store_url:
        manifest["store_url"] = args.store_url

    # 产物：--no-artifact 时（纯商店分发场景）不生成
    if not args.no_artifact:
        f = Path(args.file)
        if not f.is_file():
            print(f"[错误] 产物文件不存在：{f}", file=sys.stderr)
            sys.exit(2)
        atype = args.artifact_type or guess_type(f, args.platform)
        allowed = ARTIFACT_TYPES.get(args.platform, set())
        if atype not in allowed:
            print(
                f"[错误] 产物类型 '{atype}' 与平台 '{args.platform}' 不匹配，"
                f"该平台允许：{sorted(allowed)}",
                file=sys.stderr,
            )
            sys.exit(2)
        digest = sha256_of(f)
        artifact_url = args.artifact_url or f.name
        artifact = {
            "type": atype,
            "url": artifact_url,
            "size": f.stat().st_size,
            "sha256": digest,
        }
        key = Path(args.private_key)
        if key.is_file():
            # 签名消息必须与服务端 sign_release 的 "{version}|{build}|{sha256}|{url}" 一致
            canonical = f"{args.version}|{args.build}|{digest}|{artifact_url}"
            artifact["signature"] = sign(key, canonical)
        else:
            print(f"[警告] 未找到私钥 {key}，产物将缺少 signature 字段", file=sys.stderr)
            print("       请先运行： python scripts/gen_keypair.py", file=sys.stderr)
        if args.install_args:
            artifact["install_args"] = args.install_args.split()
        manifest["artifact"] = artifact

    return manifest


def push(manifest: dict, api: str, admin_key: str) -> int:
    """推送发布清单到后端 OTA 服务。"""
    url = api.rstrip("/") + "/api/v1/admin/releases"
    body = json.dumps(manifest, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "X-Admin-Key": admin_key,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            print(f"[成功] HTTP {resp.status}")
            print(resp.read().decode("utf-8"))
            return 0
    except urllib.error.HTTPError as e:
        print(f"[失败] HTTP {e.code}", file=sys.stderr)
        print(e.read().decode("utf-8", errors="replace"), file=sys.stderr)
        return 1
    except urllib.error.URLError as e:
        print(f"[失败] 无法连接 {url}：{e.reason}", file=sys.stderr)
        return 1


def main() -> int:
    p = argparse.ArgumentParser(
        description="生成并发布 OTA 更新清单（协议 v1）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    p.add_argument("--platform", required=True, choices=sorted(ALL_PLATFORMS))
    p.add_argument("--arch", required=True,
                   choices=["x86_64", "arm64", "armv7", "x86"])
    p.add_argument("--channel", default="stable",
                   choices=["stable", "beta", "nightly"])
    p.add_argument("--version", required=True, help="语义化版本，如 1.1.0")
    p.add_argument("--build", required=True, type=int, help="构建号，单调递增")
    p.add_argument("--file", help="构建产物文件路径")
    p.add_argument("--no-artifact", action="store_true",
                   help="不附带安装包（纯商店分发场景，如 iOS/鸿蒙）")
    p.add_argument("--artifact-type", help="覆盖自动推断的产物类型")
    p.add_argument("--artifact-url", help="客户端实际下载地址，默认取文件名")
    p.add_argument("--install-args", help="安装参数，空格分隔（服务端有白名单）")
    p.add_argument("--store-url",
                   help="商店地址。iOS/HarmonyOS 必填（这两个平台禁止静默安装）")
    p.add_argument("--min-supported-version",
                   help="最低支持版本，低于此值强制更新")
    p.add_argument("--notes-zh", help="中文更新说明")
    p.add_argument("--notes-en", help="英文更新说明")
    p.add_argument("--rollout", type=int, default=100,
                   help="灰度放量百分比 0-100，默认 100")
    p.add_argument("--private-key",
                   default=str(Path(__file__).resolve().parent.parent / "keys" / "ota_private.pem"),
                   help="Ed25519 私钥路径")
    p.add_argument("--api", default="http://localhost:8000", help="后端地址")
    p.add_argument("--admin-key", default="", help="管理接口密钥 X-Admin-Key")
    p.add_argument("--dry-run", action="store_true",
                   help="只打印将要提交的 JSON，不实际推送")
    args = p.parse_args()

    # ---- 平台红线校验 ----
    if args.platform in STORE_ONLY_PLATFORMS:
        if not args.store_url:
            print(
                f"[错误] 平台 '{args.platform}' 不支持静默自动安装，"
                f"必须提供 --store-url 引导用户前往商店。\n"
                f"       这是 {args.platform.upper()} 的平台限制，不是本工具的限制。",
                file=sys.stderr,
            )
            return 2
    if not args.no_artifact and not args.file:
        print("[错误] 未提供 --file；如确无安装包请显式加 --no-artifact", file=sys.stderr)
        return 2
    if not (0 <= args.rollout <= 100):
        print("[错误] --rollout 必须在 0-100 之间", file=sys.stderr)
        return 2

    manifest = build_manifest(args)

    print("=" * 70)
    print("OTA 发布清单（协议 v1）")
    print("=" * 70)
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    print("=" * 70)

    if args.platform in STORE_ONLY_PLATFORMS:
        print(f"[提示] {args.platform} 为商店分发平台，客户端将引导跳转：{args.store_url}")

    if args.dry_run:
        print("[dry-run] 未实际推送。")
        return 0

    if not args.admin_key:
        print("[错误] 正式发布需提供 --admin-key", file=sys.stderr)
        return 2

    return push(manifest, args.api, args.admin_key)


if __name__ == "__main__":
    raise SystemExit(main())
