# -*- coding: utf-8 -*-
"""OTA 签名与密钥管理（Ed25519）。

- 私钥用于对外发布产物时签名（防篡改）。
- 公钥通过 /api/v1/ota/public-key 下发，客户端内置于代码中用于验签。
- 生产环境严禁将私钥提交仓库或下发给客户端。
"""
from __future__ import annotations

import base64
import functools
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)

from app.config import settings

PRIVATE_PEM = Path(settings.ota_keys_dir) / "ota_private.pem"
PUBLIC_PEM = Path(settings.ota_keys_dir) / "ota_public.pem"


@functools.lru_cache(maxsize=1)
def _load_keys() -> tuple[Ed25519PrivateKey, Ed25519PublicKey]:
    if not PRIVATE_PEM.exists() or not PUBLIC_PEM.exists():
        raise FileNotFoundError(
            f"缺少 OTA 密钥文件：{PRIVATE_PEM} / {PUBLIC_PEM}。"
            f"请先运行 scripts/gen_keypair.py 生成。"
        )
    private_key = serialization.load_pem_private_key(PRIVATE_PEM.read_bytes(), password=None)
    public_key = serialization.load_pem_public_key(PUBLIC_PEM.read_bytes())
    assert isinstance(private_key, Ed25519PrivateKey)
    assert isinstance(public_key, Ed25519PublicKey)
    return private_key, public_key


def raw_public_key_bytes() -> bytes:
    """Ed25519 原始公钥（32 字节），客户端校验用的最终形态。"""
    _, public_key = _load_keys()
    return public_key.public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )


def public_key_b64() -> str:
    """公开接口返回 base64 编码的原始公钥。"""
    return base64.b64encode(raw_public_key_bytes()).decode("ascii")


def sign_payload(payload: bytes) -> str:
    """对字节负载签名，返回 `ed25519:<base64>` 格式字符串。"""
    private_key, _ = _load_keys()
    signature = private_key.sign(payload)
    return "ed25519:" + base64.b64encode(signature).decode("ascii")


def verify_payload(payload: bytes, signature_header: str) -> bool:
    """验签。`signature_header` 形如 `ed25519:<base64>`。"""
    if not signature_header or not signature_header.startswith("ed25519:"):
        return False
    try:
        raw = base64.b64decode(signature_header[len("ed25519:"):])
        _, public_key = _load_keys()
        public_key.verify(raw, payload)
        return True
    except Exception:
        return False


def sign_release(version: str, build: int, sha256: str, url: str) -> str:
    """对一次发布产物做规范化签名，作为 artifact.signature。

    规范化消息为 `{version}|{build}|{sha256_lower}|{url}`，
    客户端与 scripts/ota_manifest.py 必须使用完全相同的消息。
    """
    canonical = f"{version}|{build}|{sha256.lower()}|{url}".encode("utf-8")
    return sign_payload(canonical)
