#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成 OTA 更新用的 Ed25519 密钥对，并导出各客户端可直接粘贴的公钥常量。

用法：
    python scripts/gen_keypair.py                 # 生成到 keys/ 目录
    python scripts/gen_keypair.py --out-dir ./keys --force

安全提醒：
    ota_private.pem 是发布签名私钥，绝对不能提交进仓库、不能下发给客户端。
    本脚本会自动把 keys/*.pem 写入 .gitignore。
"""
from __future__ import annotations

import argparse
import base64
import sys
from pathlib import Path

try:
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import (
        Ed25519PrivateKey,
        Ed25519PublicKey,
    )
except ImportError:
    sys.exit("缺少依赖 cryptography，请先执行：pip install -r scripts/requirements.txt")


def generate() -> tuple[Ed25519PrivateKey, Ed25519PublicKey]:
    """生成一对 Ed25519 密钥。"""
    private_key = Ed25519PrivateKey.generate()
    return private_key, private_key.public_key()


def save_keys(private_key: Ed25519PrivateKey, out_dir: Path) -> tuple[Path, Path]:
    """把私钥与公钥以 PEM 格式落盘，并返回路径。"""
    out_dir.mkdir(parents=True, exist_ok=True)

    priv_path = out_dir / "ota_private.pem"
    pub_path = out_dir / "ota_public.pem"

    priv_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    pub_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )

    priv_path.write_bytes(priv_pem)
    pub_path.write_bytes(pub_pem)
    return priv_path, pub_path


def raw_public_bytes(public_key: Ed25519PublicKey) -> bytes:
    """Ed25519 原始公钥（32 字节），是客户端校验用的最终形态。"""
    return public_key.public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )


def ensure_gitignore(repo_root: Path) -> None:
    """确保私钥不会误提交。"""
    gi = repo_root / ".gitignore"
    entries = ["keys/*.pem", "keys/ota_private.pem"]
    existing = gi.read_text(encoding="utf-8") if gi.exists() else ""
    missing = [e for e in entries if e not in existing]
    if missing:
        with gi.open("a", encoding="utf-8") as f:
            f.write("\n# OTA 签名私钥（绝不可提交）\n")
            for e in missing:
                f.write(f"{e}\n")


def print_client_constants(raw_pub: bytes) -> None:
    """打印 Dart / Rust / TypeScript 三种客户端可粘贴的公钥常量。"""
    b64 = base64.b64encode(raw_pub).decode("ascii")
    hexs = raw_pub.hex()
    dart_list = ", ".join(f"0x{b:02x}" for b in raw_pub)
    rust_list = ", ".join(f"0x{b:02x}" for b in raw_pub)
    ts_list = ", ".join(f"0x{b:02x}" for b in raw_pub)

    print("\n" + "=" * 70)
    print("客户端内置公钥常量（复制粘贴即可）")
    print("=" * 70)
    print(f"\n[Base64]  {b64}")
    print(f"[Hex]     {hexs}\n")

    print("--- Dart / Flutter (lib/core/updater/ota_public_key.dart) ---")
    print(f"const kOtaPublicKeyBase64 = '{b64}';")
    print(f"const List<int> kOtaPublicKey = <int>[{dart_list}];\n")

    print("--- Rust / Tauri (src-tauri/src/updater.rs) ---")
    print(f"pub const OTA_PUBLIC_KEY: &str = \"{b64}\";")
    print(f"pub const OTA_PUBLIC_KEY_BYTES: [u8; 32] = [{rust_list}];\n")

    print("--- TypeScript / RN / ArkTS (src/updater/publicKey.ts) ---")
    print(f"export const OTA_PUBLIC_KEY_BASE64 = '{b64}';")
    print(f"export const OTA_PUBLIC_KEY = [{ts_list}];\n")


def verify_roundtrip(private_key: Ed25519PrivateKey, public_key: Ed25519PublicKey) -> bool:
    """自检：用私钥签名、用公钥验签，确认密钥对可用。"""
    msg = b"manju-ota-self-check"
    sig = private_key.sign(msg)
    try:
        public_key.verify(sig, msg)
        return True
    except Exception:
        return False


def main() -> int:
    parser = argparse.ArgumentParser(description="生成 OTA 更新 Ed25519 密钥对")
    parser.add_argument(
        "--out-dir",
        default=str(Path(__file__).resolve().parent.parent / "keys"),
        help="密钥输出目录，默认 <项目根>/keys",
    )
    parser.add_argument("--force", action="store_true", help="已存在时覆盖")
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    priv_path = out_dir / "ota_private.pem"

    if priv_path.exists() and not args.force:
        print(f"密钥已存在：{priv_path}")
        print("如需重新生成请加 --force（注意：换 key 会让所有旧客户端验签失败）")
        return 0

    private_key, public_key = generate()
    priv_path, pub_path = save_keys(private_key, out_dir)

    repo_root = Path(__file__).resolve().parent.parent
    ensure_gitignore(repo_root)

    raw_pub = raw_public_bytes(public_key)

    print(f"私钥已生成：{priv_path}")
    print(f"公钥已生成：{pub_path}")

    if verify_roundtrip(private_key, public_key):
        print("自检：签名/验签通过 ✓")
    else:
        print("自检：签名/验签失败 ✗", file=sys.stderr)
        return 1

    print_client_constants(raw_pub)
    print("=" * 70)
    print("警告：请把 ota_private.pem 加到 CI Secrets（ED25519_PRIVATE_KEY），不要提交仓库。")
    print("=" * 70)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
