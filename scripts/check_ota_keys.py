"""交叉核对 OTA Ed25519 密钥一致性的四个来源：
1. makers/.env 里的 MANJU_OTA_PRIVATE_KEY (base64 -> PEM)  —— CLI link 刚从云端拉取
2. keys/ota_private.pem                                    —— 本地私钥
3. keys/ota_public.pem                                     —— 本地公钥
4. makers/static/api/v1/ota/public-key.json                —— 已导出到线上的公钥
"""
import base64, json, pathlib, sys

ROOT = pathlib.Path(r"D:\网站全栈项目\项目007")

try:
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import (
        Ed25519PrivateKey, Ed25519PublicKey,
    )
except ImportError:
    print("NEED_CRYPTOGRAPHY")
    sys.exit(2)


def raw_pub_from_priv_pem(pem: bytes):
    key = serialization.load_pem_private_key(pem, password=None)
    if not isinstance(key, Ed25519PrivateKey):
        return None, type(key).__name__
    pub = key.public_key()
    raw = pub.public_bytes(
        serialization.Encoding.Raw, serialization.PublicFormat.Raw
    )
    return base64.b64encode(raw).decode(), None


def raw_pub_from_pub_pem(pem: bytes):
    key = serialization.load_pem_public_key(pem)
    raw = key.public_bytes(
        serialization.Encoding.Raw, serialization.PublicFormat.Raw
    )
    return base64.b64encode(raw).decode()


sources = {}

# 1) .env
env = (ROOT / "makers" / ".env").read_text(encoding="utf-8", errors="replace")
b64 = ""
for line in env.splitlines():
    if line.startswith("MANJU_OTA_PRIVATE_KEY="):
        b64 = line.split("=", 1)[1].strip()
if b64:
    try:
        pem = base64.b64decode(b64 + "=" * (-len(b64) % 4))
        pub, kind = raw_pub_from_priv_pem(pem)
        sources["1_env_private_b64"] = pub if pub else f"NOT_ED25519:{kind}"
    except Exception as e:
        sources["1_env_private_b64"] = f"ERROR:{e}"
else:
    sources["1_env_private_b64"] = "NOT_FOUND"

# 2) keys/ota_private.pem
p = ROOT / "keys" / "ota_private.pem"
try:
    pub, kind = raw_pub_from_priv_pem(p.read_bytes())
    sources["2_keys_private_pem"] = pub if pub else f"NOT_ED25519:{kind}"
except Exception as e:
    sources["2_keys_private_pem"] = f"ERROR:{e}"

# 3) keys/ota_public.pem
p = ROOT / "keys" / "ota_public.pem"
try:
    sources["3_keys_public_pem"] = raw_pub_from_pub_pem(p.read_bytes())
except Exception as e:
    sources["3_keys_public_pem"] = f"ERROR:{e}"

# 4) 线上导出的 public-key.json
p = ROOT / "makers" / "static" / "api" / "v1" / "ota" / "public-key.json"
try:
    j = json.loads(p.read_text(encoding="utf-8"))
    sources["4_static_public_json"] = j.get("public_key") or j.get("key") or str(j)[:60]
    sources["4_static_public_json_full_file"] = json.dumps(j, ensure_ascii=False)[:200]
except Exception as e:
    sources["4_static_public_json"] = f"ERROR:{e}"

for k, v in sources.items():
    print(f"{k:28s} {v}")

vals = [v for k, v in sources.items()
        if not k.endswith("_full_file") and len(v) == 44 and not v.startswith("ERROR")]
print("\nALL_MATCH:", len(set(vals)) == 1 and len(vals) == 4)
