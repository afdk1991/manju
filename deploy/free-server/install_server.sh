#!/usr/bin/env bash
# ============================================================================
# 漫剧 Manju 后端 —— 免费服务器一键部署脚本（无 Docker）
#
# 适用：Oracle Cloud Always Free（ARM A1 / AMD E2.1）、国内免费云、任意 Ubuntu/Debian/CentOS 服务器
#
# 用法（在服务器上，脚本与 manju-server.tar.gz、keys/ 同目录）：
#     sudo bash install_server.sh http://<服务器公网IP>:8000
#
# 脚本会自动完成：
#   1. 安装 Python3 + venv
#   2. 解压 server/ 到 /opt/manju/server，创建虚拟环境并安装依赖
#   3. 校验/部署 OTA 签名密钥（优先使用随包上传的 keys/，缺失则新生成并警告）
#   4. 写入 .env（随机管理密钥与 JWT 密钥）
#   5. 初始化演示数据（22 部漫剧 + OTA windows/ios 9.9.9）
#   6. 把 OTA 产物 URL 修正为公网地址并重新签名
#   7. 注册 systemd 服务 manju.service 并开机自启
#   8. 防火墙放行 8000 端口，自检并输出访问地址
# ============================================================================
set -euo pipefail

PUBLIC_BASE="${1:-}"
if [[ -z "$PUBLIC_BASE" ]]; then
    echo "错误：缺少公网地址参数。用法：sudo bash install_server.sh http://公网IP:8000" >&2
    exit 2
fi
case "$PUBLIC_BASE" in
    http://*|https://*) ;;
    *) echo "错误：公网地址必须以 http:// 或 https:// 开头：$PUBLIC_BASE" >&2; exit 2 ;;
esac

# ---------- 0. 环境检查 ----------
if [[ "$(id -u)" -ne 0 ]]; then
    echo "错误：请用 root 或 sudo 运行。如：sudo bash $0 $PUBLIC_BASE" >&2
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="/opt/manju"
SERVER_DIR="$APP_ROOT/server"
VENV_DIR="$APP_ROOT/venv"
KEYS_DIR="$APP_ROOT/keys"
PKG_FILE="$SCRIPT_DIR/manju-server.tar.gz"

command -v curl >/dev/null 2>&1 || { echo "缺少 curl，先安装基础工具" >&2; }

echo "========================================================================"
echo " 漫剧 Manju 后端一键部署（无 Docker）"
echo " 公网地址 : $PUBLIC_BASE"
echo " 安装目录 : $APP_ROOT"
echo "========================================================================"

# ---------- 1. 系统依赖 ----------
echo "[1/8] 安装系统依赖（Python3 / venv / curl / ufw）..."
if command -v apt-get >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y
    apt-get install -y python3 python3-venv python3-pip curl ufw
elif command -v dnf >/dev/null 2>&1; then
    dnf install -y python3 python3-pip curl ufw || true
elif command -v yum >/dev/null 2>&1; then
    yum install -y python3 python3-pip curl || true
else
    echo "错误：未识别的包管理器（仅支持 apt/dnf/yum 系）" >&2
    exit 1
fi

# ---------- 2. 代码解压 ----------
echo "[2/8] 解压 server/ 到 $SERVER_DIR ..."
mkdir -p "$APP_ROOT"
if [[ ! -f "$PKG_FILE" ]]; then
    echo "错误：未找到 $PKG_FILE（请先把 server/ 打包上传，见 README 第 3 步）" >&2
    exit 1
fi
rm -rf "$SERVER_DIR"
mkdir -p "$SERVER_DIR"
tar -xzf "$PKG_FILE" -C "$SERVER_DIR" --strip-components=1

# ---------- 3. 签名密钥 ----------
echo "[3/8] 检查 OTA 签名密钥..."
mkdir -p "$KEYS_DIR"
# 兼容两种上传布局：<deploy>/keys/*.pem（推荐）或直接平铺在 <deploy>/*.pem
SRC_KEYS_DIR=""
if [[ -f "$SCRIPT_DIR/keys/ota_private.pem" && -f "$SCRIPT_DIR/keys/ota_public.pem" ]]; then
    SRC_KEYS_DIR="$SCRIPT_DIR/keys"
elif [[ -f "$SCRIPT_DIR/ota_private.pem" && -f "$SCRIPT_DIR/ota_public.pem" ]]; then
    SRC_KEYS_DIR="$SCRIPT_DIR"
fi
if [[ -n "$SRC_KEYS_DIR" ]]; then
    cp -f "$SRC_KEYS_DIR/ota_private.pem" "$KEYS_DIR/"
    cp -f "$SRC_KEYS_DIR/ota_public.pem" "$KEYS_DIR/"
    chmod 600 "$KEYS_DIR/ota_private.pem"
    echo "      已使用随包上传的密钥（$SRC_KEYS_DIR，与本地客户端公钥一致 ✓）"
else
    echo "      警告：未随包上传 keys/，将生成新密钥。"
    echo "      新密钥会导致已内置旧公钥的客户端验签失败！"
    echo "      若客户端尚未内置公钥，可继续；否则请先上传本地 keys/ 后重跑本脚本。"
    /opt/manju/venv/bin/python -c "pass" 2>/dev/null || true
    python3 - <<'PYEOF'
import sys
from pathlib import Path
sys.path.insert(0, "/opt/manju/server")
try:
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    d = Path("/opt/manju/keys"); d.mkdir(parents=True, exist_ok=True)
    if not (d / "ota_private.pem").exists():
        k = Ed25519PrivateKey.generate()
        (d / "ota_private.pem").write_bytes(k.private_bytes(
            serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption()))
        (d / "ota_public.pem").write_bytes(k.public_key().public_bytes(
            serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo))
        print("      已生成新密钥对到 /opt/manju/keys")
except Exception as e:
    print(f"      密钥生成失败：{e}（可先本地生成后上传）")
PYEOF
fi

# ---------- 4. Python 虚拟环境 ----------
echo "[4/8] 创建虚拟环境并安装依赖..."
python3 -m venv "$VENV_DIR"
"$VENV_DIR/bin/pip" install --upgrade pip -q
"$VENV_DIR/bin/pip" install -r "$SERVER_DIR/requirements.txt" -q
# 兼容旧版目录：若 server 内无 requirements.txt 则用部署包内的副本
if [[ ! -f "$SERVER_DIR/requirements.txt" && -f "$SCRIPT_DIR/requirements.txt" ]]; then
    "$VENV_DIR/bin/pip" install -r "$SCRIPT_DIR/requirements.txt" -q
fi

# ---------- 5. 环境变量 ----------
echo "[5/8] 写入 server/.env（随机管理密钥 / JWT 密钥）..."
ADMIN_KEY="$(openssl rand -hex 16)"
JWT_SECRET="$(openssl rand -hex 32)"
cat > "$SERVER_DIR/.env" <<EOF
MANJU_ADMIN_KEY=$ADMIN_KEY
MANJU_JWT_SECRET=$JWT_SECRET
MANJU_OTA_KEYS_DIR=$KEYS_DIR
MANJU_ARTIFACTS_DIR=$SERVER_DIR/data/artifacts
MANJU_CONTENT_SOURCE=internal
MANJU_CORS_ALLOW_ORIGINS=*
# 生产建议开启 OTA 检查频率限制（6 小时/设备）；开启后冒烟测试需错开设备号
MANJU_OTA_RATE_LIMIT_ENABLED=false
EOF
chmod 600 "$SERVER_DIR/.env"
echo "      管理密钥已写入 $SERVER_DIR/.env（X-Admin-Key 用）"

# ---------- 6. 初始化数据 + 修正 OTA URL ----------
echo "[6/8] 初始化演示数据..."
cd "$SERVER_DIR"
"$VENV_DIR/bin/python" seed/seed.py

echo "      修正 OTA 产物 URL 并重新签名..."
"$VENV_DIR/bin/python" "$SCRIPT_DIR/fix_ota_url.py" "$PUBLIC_BASE"

# ---------- 7. systemd 服务 ----------
echo "[7/8] 注册并启动 systemd 服务 manju.service ..."
cp -f "$SCRIPT_DIR/manju.service" /etc/systemd/system/manju.service
systemctl daemon-reload
systemctl enable manju.service
systemctl restart manju.service

# ---------- 8. 防火墙 + 自检 ----------
echo "[8/8] 配置防火墙并自检..."
if command -v ufw >/dev/null 2>&1; then
    ufw allow 22/tcp >/dev/null 2>&1 || true
    ufw allow 8000/tcp >/dev/null 2>&1 || true
    ufw --force enable >/dev/null 2>&1 || true
    echo "      防火墙已放行 22/8000"
fi

sleep 3
echo ""
echo "========================================================================"
echo " 部署完成，开始自检..."
echo "-----------------------------------------------------------------------"
ok=1
check() {
    local name="$1"; shift
    if "$@" >/dev/null 2>&1; then echo "  [✓] $name"; else echo "  [×] $name"; ok=0; fi
}
check "服务状态 systemctl is-active" systemctl is-active --quiet manju
check "健康检查 GET /healthz" curl -sf "http://127.0.0.1:8000/healthz"
check "首页 GET /api/v1/home" curl -sf "http://127.0.0.1:8000/api/v1/home"
check "分类 GET /api/v1/categories" curl -sf "http://127.0.0.1:8000/api/v1/categories"
check "OTA 公钥 GET /api/v1/ota/public-key" curl -sf "http://127.0.0.1:8000/api/v1/ota/public-key"
check "运营后台 GET /admin" curl -sf "http://127.0.0.1:8000/admin"
echo "-----------------------------------------------------------------------"
if [[ "$ok" == "1" ]]; then
    echo " 全部自检通过 ✓"
else
    echo " 存在失败项，请查看：journalctl -u manju -n 50 --no-pager" >&2
fi
echo ""
echo " 访问地址："
echo "   内容/OTA API : $PUBLIC_BASE"
echo "   运营后台     : $PUBLIC_BASE/admin  （管理密钥见 /opt/manju/server/.env 的 MANJU_ADMIN_KEY）"
echo "   健康检查     : $PUBLIC_BASE/healthz"
echo ""
echo " 常用运维命令："
echo "   systemctl status manju        # 服务状态"
echo "   journalctl -u manju -f        # 实时日志"
echo "   systemctl restart manju       # 重启"
echo "========================================================================"
