"""验证 makers/data/releases.json 中每条 artifact.signature 能否被当前公钥验过。
规范化消息：f"{version}|{build}|{sha256.lower()}|{url}"（server/app/security.py:80）
"""
import base64, json, pathlib, sys

ROOT = pathlib.Path(r"D:\网站全栈项目\项目007")
DOMAIN = sys.argv[1] if len(sys.argv) > 1 else None

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

pub = serialization.load_pem_public_key((ROOT / "keys" / "ota_public.pem").read_bytes())
assert isinstance(pub, Ed25519PublicKey)

data = json.loads((ROOT / "makers" / "data" / "releases.json").read_text(encoding="utf-8"))
rels = data.get("releases", data if isinstance(data, list) else [])
print(f"total releases: {len(rels)}\n")

for r in rels:
    art = r.get("artifact") or {}
    url = art.get("url") or ""
    sig = art.get("signature") or ""
    sha = (art.get("sha256") or "").lower()
    payload_src = f"{r.get('version')}|{r.get('build')}|{sha}|{url}"
    tag = f"{r.get('platform')}-{r.get('version')}-{r.get('build')}"

    print(f"--- {tag}")
    print(f"    url = {url}")
    ok_cur = False
    try:
        pub.verify(base64.b64decode(sig[len("ed25519:"):]), payload_src.encode())
        ok_cur = True
    except Exception:
        ok_cur = False
    print(f"    verify(with this url)       : {'PASS' if ok_cur else 'FAIL'}")

    if DOMAIN:
        new_url = None
        for old in ("manju-drama-hub-tkwcxlaw.edgeone.cool", "127.0.0.1", "localhost"):
            if old in url:
                new_url = url.replace(old, DOMAIN)
                break
        if new_url:
            ok_new = False
            try:
                pub.verify(base64.b64decode(sig[len("ed25519:"):]),
                           f"{r.get('version')}|{r.get('build')}|{sha}|{new_url}".encode())
                ok_new = True
            except Exception:
                ok_new = False
            print(f"    url -> {new_url}")
            print(f"    verify(with NEW domain url) : {'PASS' if ok_new else 'FAIL'}")
    print()
