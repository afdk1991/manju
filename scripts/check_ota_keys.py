#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""交叉核对 OTA Ed25519 密钥一致性的四个来源：
1. makers/.env 里的 MANJU_OTA_PRIVATE_KEY (base64 -> PEM)  —— CLI link 刚从云端拉取
2. keys/ota_private.pem                                    —— 本地私钥（导出/签名链路实际读取）
3. keys/ota_public.pem                                     —— 本地公钥
4. makers/static/api/v1/ota/public-key.json                —— 已导出到线上的公钥

依赖策略（自包含，无需手动装包）：
  1) 优先用 cryptography（本项目 venv 已装 50.0.0）
  2) 当前默认 python 缺 cryptography 时，自动回退到 Node 内置 crypto
     （Ed25519，无需任何 npm 包；Node 在本环境始终可用）

结论同时标注每个来源是「新有效钥」还是「曾泄露的旧钥」，并给出：
  - 导出/签名链路是否安全（取决于 keys/ 与线上是否都为新钥）
  - 本地 .env 是否处于脏状态（被 deploy 反向覆盖成旧钥，但受 .gitignore 保护）
"""
import base64, json, os, pathlib, subprocess, sys, tempfile

ROOT = pathlib.Path(r"D:\网站全栈项目\项目007")

# 已知密钥身份常量（由 keys/ota_private.pem 与历史记录核对得出）
EXPECTED_NEW = "f2obZdLFwhWJtuA/u/VW/EB1jAZ/UiZF/eEbxFJ0a3c="  # 当前有效钥，导出链路应始终使用它
LEAKED_OLD = "DuW8zxjUYPNEnNY8RMIe4G670V5ZzX39rl1v9CEVQRU="   # 曾泄露进 GitHub 的旧钥

# ---------- 加密后端加载 ----------
BACKEND = None


def _load_py_crypto():
    global BACKEND
    try:
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric.ed25519 import (
            Ed25519PrivateKey, Ed25519PublicKey,
        )
        globals().update(
            serialization=serialization,
            Ed25519PrivateKey=Ed25519PrivateKey,
            Ed25519PublicKey=Ed25519PublicKey,
        )
        BACKEND = "py"
        return True
    except ImportError:
        return False


if not _load_py_crypto():
    # 不依赖 venv 重跑（在部分子进程捕获环境下 os.execv 输出会丢失），
    # 直接用 Node 内置 crypto 作为兜底后端——Node 在本环境始终可用。
    NODE = r"C:\Users\addk1\.workbuddy\binaries\node\versions\22.22.2-3\node.exe"
    if not os.path.exists(NODE):
        print("NO_CRYPTO_BACKEND: 既无 cryptography，也无 Node 可执行文件")
        sys.exit(2)
    BACKEND = "node"


# ---------- Node 回退：从 PEM 算原始 32 字节公钥的 base64 ----------
_NODE_SRC = r"""
const crypto = require('crypto'), fs = require('fs');
const mode = process.argv[2];          // 'priv' | 'pub'
const pem = fs.readFileSync(process.argv[3], 'utf8');
const key = mode === 'priv' ? crypto.createPrivateKey(pem) : crypto.createPublicKey(pem);
// 私钥需先派生出公钥对象，再导出 spki（PKCS8 末 32 字节是 seed 而非公钥）
const pubKey = mode === 'priv' ? crypto.createPublicKey(key) : key;
const der = pubKey.export({ type: 'spki', format: 'der' });
const raw = Buffer.from(der).subarray(Buffer.from(der).length - 32);
process.stdout.write(raw.toString('base64'));
"""


def _node_pub(pem_bytes: bytes, is_private: bool) -> str:
    NODE = r"C:\Users\addk1\.workbuddy\binaries\node\versions\22.22.2-3\node.exe"
    with tempfile.TemporaryDirectory() as td:
        p = pathlib.Path(td) / "k.pem"
        p.write_bytes(pem_bytes)
        js = pathlib.Path(td) / "h.js"
        js.write_text(_NODE_SRC, encoding="utf-8")
        out = subprocess.run(
            [NODE, str(js), "priv" if is_private else "pub", str(p)],
            capture_output=True, text=True, timeout=30,
        )
        if out.returncode != 0:
            raise RuntimeError(out.stderr.strip() or "node exited non-zero")
        return out.stdout.strip()


# ---------- 公钥提取（按后端分发） ----------
def raw_pub_from_priv_pem(pem: bytes):
    if BACKEND == "py":
        key = serialization.load_pem_private_key(pem, password=None)
        if not isinstance(key, Ed25519PrivateKey):
            return None, type(key).__name__
        raw = key.public_key().public_bytes(
            serialization.Encoding.Raw, serialization.PublicFormat.Raw
        )
        return base64.b64encode(raw).decode(), None
    # node
    try:
        return _node_pub(pem, True), None
    except Exception as e:  # noqa
        return None, f"NODE_ERR:{e}"


def raw_pub_from_pub_pem(pem: bytes):
    if BACKEND == "py":
        raw = serialization.load_pem_public_key(pem).public_bytes(
            serialization.Encoding.Raw, serialization.PublicFormat.Raw
        )
        return base64.b64encode(raw).decode()
    try:
        return _node_pub(pem, False)
    except Exception as e:  # noqa
        return f"NODE_ERR:{e}"


def classify(v: str) -> str:
    if not isinstance(v, str):
        return "INVALID"
    if v == EXPECTED_NEW:
        return "NEW(有效)"
    if v == LEAKED_OLD:
        return "OLD(已泄露⚠)"
    if v.startswith("ERROR") or v.startswith("NODE_ERR"):
        return "ERROR"
    if v in ("NOT_FOUND", "NOT_ED25519"):
        return v
    return "UNKNOWN"


# ---------- 收集四个来源 ----------
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
except Exception as e:
    sources["4_static_public_json"] = f"ERROR:{e}"

# ---------- 输出 ----------
print(f"后端: {BACKEND}   期望新钥: {EXPECTED_NEW}\n")
for k in ["1_env_private_b64", "2_keys_private_pem", "3_keys_public_pem", "4_static_public_json"]:
    v = sources[k]
    print(f"{k:26s} {str(v):46s} [{classify(v)}]")

env_v = sources["1_env_private_b64"]
keys_v = sources["2_keys_private_pem"]
pub_v = sources["3_keys_public_pem"]
online_v = sources["4_static_public_json"]

export_safe = (keys_v == EXPECTED_NEW and pub_v == EXPECTED_NEW and online_v == EXPECTED_NEW)
env_dirty = (env_v == LEAKED_OLD)
# 四个来源内部完全一致（导出链路安全时，keys/ 与线上都是新钥，.env 是旧钥，故通常不一致但有合理解释）
internal_all = len({v for v in [env_v, keys_v, pub_v, online_v]
                    if isinstance(v, str) and not v.startswith(("ERROR", "NODE_ERR", "NOT_"))}) == 1

print("\n======================== 结论 ========================")
print(f"导出/签名链路安全 (keys/ 与线上都为新有效钥): {'✅ 是' if export_safe else '❌ 否'}")
print(f"本地 makers/.env 脏状态 (被 deploy 反向覆盖为旧泄露钥): {'⚠️ 是' if env_dirty else '否'}")
print(f"四来源内部完全一致: {'是' if internal_all else '否（见上方差异）'}")

if export_safe and not env_dirty:
    print("\n✅ 当前状态安全：发布签名使用 keys/ 新钥，线上公钥匹配；可正常 deploy。")
    print("   本地 .env 已是正确的新钥，无需处理。")
elif export_safe and env_dirty:
    print("\n⚠️ 发布安全但本地 .env 为脏状态：导出走 keys/ 新钥（安全），仅本地 .env 是旧泄露钥。")
    print("   .env 受 .gitignore 保护、未被 git 跟踪，不会造成新泄露。")
    print("   如需彻底干净：在 EdgeOne 控制台把 MANJU_OTA_PRIVATE_KEY 改为 keys/ota_private.pem 对应的新钥，")
    print("   再 `edgeone makers link` 重新拉取即可覆盖本地脏值。详见 docs/OTA密钥云端替换手册.md")
else:
    print("\n❌ 需要立即处理：导出链路或线上公钥使用了旧泄露钥，存在 OTA 伪造风险。")
    print("   按 docs/OTA密钥云端替换手册.md 更换云端密钥并重新导出。")

sys.exit(0 if export_safe else 1)
