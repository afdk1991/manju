# 漫剧 Manju —— 免费服务器部署指南（无 Docker）

把「漫剧内容中台 + OTA 服务」（FastAPI + SQLite）部署到互联网免费服务器，全程不使用 Docker。

## 0. 方案选型（2026-09 现状）

| 方案 | 免费额度 | 大陆访问 | 限制 | 适合 |
|---|---|---|---|---|
| **Oracle Cloud Always Free** ⭐推荐 | **永久免费**：ARM A1 最高 4核/24GB + 200GB 磁盘 + 10TB/月流量（或 AMD E2.1 微实例×2） | 好（选韩国/日本区） | 注册需信用卡预授权（不扣费）；长期低负载可能被回收 | 想要真正的免费 VPS，可长期稳定运行 |
| 国内免费云（阿贝云/三丰云类） | 免费 VPS 1核/1G/独立IP | 最好 | 需实名认证；小厂稳定性与信誉参差 | 快速测试、学习 |
| Zeabur Free Plan | $0/月，无需信用卡 | 一般 | **自动休眠**（冷启动数秒）；共享集群已淘汰，新项目受限 | 只想快速跑通、能接受休眠 |
| Render / Railway / Fly.io | 免费额度（会变动） | 差（大陆基本不可直连） | 海外线路不稳定、易被墙 | 不推荐（大陆用户） |

**结论：首选 Oracle Cloud Always Free。** 它是唯一"永久免费 + 真服务器（SSH 自由操作）+ 大陆可直连"的方案，与本项目（FastAPI + SQLite + 无 Docker）完全匹配。

---

## 1. 推荐方案：Oracle Cloud Always Free 完整步骤

### 1.1 注册账号（约 10 分钟）
1. 打开 https://signup.cloud.oracle.com/ （或 oracle.com/cn/cloud/free/）
2. 填写邮箱、国家（中国）、手机号验证
3. **信用卡绑定**：需一张支持预授权的 Visa/Mastercard（国内双币/全币卡即可）。会预授权扣 $1 验证后返还，**不产生实际扣费**
4. 账户类型选 **Pay As You Go（后付费）**——与 Always Free 不冲突，永久免费配额照常生效
5. **主区域（Home Region）选择**：推荐 `韩国-首尔(ap-seoul-1)` 或 `日本-东京(ap-tokyo-1)`，大陆直连延迟低。主区域不可更改，务必选对

> 注册失败提示：常见于信用卡验证不通过，可换一张全币种卡或换时段重试；注册成功后可开启 2FA。

### 1.2 创建实例
1. 控制台：`Compute → Instances → Create instance`
2. 名称随意（如 `manju-server`）
3. Image：**Ubuntu 24.04**（Canonical）
4. Shape 选 **VM.Standard.A1.Flex**（ARM）：
   - OCPU = 4、内存 = 24 GB（可用满配额；也可以减到 1 OCPU / 6GB 留余量）
   - 若提示"Out of capacity"（ARM 无容量）：换可用域/区域，或退而创建 `VM.Standard.E2.1.Micro`（AMD 1核/1GB，也够跑本项目）
5. **SSH 密钥**：上传本指南配套生成的公钥（见 1.3）
6. Boot volume 保持默认（50GB，在 200GB 免费配额内）
7. 创建后记录**公网 IP**

### 1.3 本机准备（已帮你完成）
- 部署专用 SSH 密钥已生成：
  - 私钥：`C:\Users\addk1\.ssh\manju_oci`
  - 公钥：`C:\Users\addk1\.ssh\manju_oci.pub`，内容为：
    ```
    ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMQvTLGGW0tenkR6396+Galk6JuoZdLtQokx18XvujAu manju-free-server-deploy
    ```
  - 在 Oracle 创建实例时把上面这行**完整粘贴**到 SSH 密钥框即可

### 1.4 放行端口（安全列表）
实例详情 → `Virtual cloud network → Security List`，添加两条入站规则：
- TCP 22（SSH，一般默认已开）
- TCP 8000（漫剧服务）来源 `0.0.0.0/0`

### 1.5 打包上传（本机 PowerShell 执行）
```powershell
cd D:\网站全栈项目\项目007
# 打包 server（排除本地数据与缓存）
tar -czf deploy\free-server\manju-server.tar.gz --exclude="data/*" --exclude="__pycache__" --exclude="*.pyc" -C server .

# 上传（把 <IP> 换成实例公网 IP）
scp -i C:\Users\addk1\.ssh\manju_oci deploy\free-server\manju-server.tar.gz `
    deploy\free-server\install_server.sh deploy\free-server\manju.service `
    deploy\free-server\fix_ota_url.py deploy\free-server\requirements.txt `
    keys\ota_private.pem keys\ota_public.pem `
    ubuntu@<IP>:/tmp/manju-deploy/
```
> 说明：`keys/` 随包上传是让服务器用**与本地客户端内置公钥一致**的密钥签名（必须一致，否则客户端验签失败）。

### 1.6 一键部署（本机 PowerShell 执行）
```powershell
ssh -i C:\Users\addk1\.ssh\manju_oci ubuntu@<IP> "sudo bash /tmp/manju-deploy/install_server.sh http://<IP>:8000"
```
脚本自动完成：装 Python → 建 venv → 装依赖 → 写 .env（随机密钥）→ 初始化 22 部漫剧数据 → 修正 OTA 产物 URL 并重新签名 → systemd 开机自启 → 防火墙 → 自检。

### 1.7 验证
- API：`http://<IP>:8000/healthz` → `{"status":"ok"}`
- 内容：`http://<IP>:8000/api/v1/home`
- OTA：`http://<IP>:8000/api/v1/ota/check?platform=windows&arch=x86_64&channel=stable&version=0.0.1&build=1&device_id=test`
- 运营后台：`http://<IP>:8000/admin`（密钥：`sudo cat /opt/manju/server/.env` 里的 `MANJU_ADMIN_KEY`）

### 1.8 客户端连接公网服务
- **Flutter 客户端**：
  ```bash
  cd clients/manju_flutter
  flutter run -d windows --dart-define=MANJU_API_BASE=http://<IP>:8000
  ```
- **Tauri 客户端**：修改 `clients/manju_tauri/src/api/client.ts` 第 20 行
  `export const API_BASE = "http://localhost:8000";` → `"http://<IP>:8000"`

---

## 2. 备选方案：国内免费云（阿贝云 / 三丰云类）

1. 官网实名认证开通免费云服务器（选 Ubuntu 22.04/24.04）
2. 拿到公网 IP 与 root 密码（或自配密钥）
3. 本机上传（Windows PowerShell，密码登录时去掉 `-i`）：
   ```powershell
   scp deploy\free-server\manju-server.tar.gz deploy\free-server\install_server.sh `
       deploy\free-server\manju.service deploy\free-server\fix_ota_url.py `
       deploy\free-server\requirements.txt keys\ota_private.pem keys\ota_public.pem `
       root@<IP>:/tmp/manju-deploy/
   ```
4. 执行：`ssh root@<IP> "bash /tmp/manju-deploy/install_server.sh http://<IP>:8000"`

> 提醒：小厂商免费实例可能存在强制续期、性能限制或服务下线风险，请勿用于生产关键数据。

---

## 3. 备选方案：Zeabur 免费计划（平台托管）

Zeabur 提供 $0 免费计划（无需信用卡，中文文档）。但注意：
- 免费计划服务**无流量会自动休眠**，下次请求需数秒冷启动
- 2026 年起新项目共享集群已逐步淘汰，免费部署能力可能受限
- 部署方式：GitHub 仓库连接 → 选择 `server/` 目录 → 平台自动检测 FastAPI

若选用 Zeabur，需在项目根新建 `zeabur.json` 指向 `server/`，并确保 `requirements.txt` 存在（已补齐）。

---

## 4. 安全清单（必读）

- [ ] 管理密钥与 JWT 密钥已随机生成（脚本自动完成，位于 `/opt/manju/server/.env`，权限 600）
- [ ] 防火墙仅放行 22 / 8000
- [ ] OTA 私钥 `/opt/manju/keys/ota_private.pem` 仅存在于服务器与本地，切勿提交仓库、切勿外发
- [ ] 生产建议开启 OTA 频率限制：编辑 `/opt/manju/server/.env` 设 `MANJU_OTA_RATE_LIMIT_ENABLED=true` 后 `systemctl restart manju`
- [ ] 生产建议收紧 CORS：`MANJU_CORS_ALLOW_ORIGINS=https://你的域名`
- [ ] 生产建议上 HTTPS：见 `Caddyfile`（需域名 A 记录指向服务器）

## 5. 常见问题

| 问题 | 处理 |
|---|---|
| Oracle 注册被拒 | 换全币种信用卡、换时段重试；确认国家/地址与卡信息一致 |
| ARM 无容量（Out of capacity） | 换可用域（AD）或区域；或先建 E2.1.Micro（1核/1G） |
| ARM 上 pip 装 cryptography 失败 | 该库有 ARM wheel，先 `pip install --upgrade pip`；仍失败则 `apt install python3-dev gcc` 编译 |
| 服务器长期空闲被 Oracle 回收 | 保持 CPU 有负载（如每 5 分钟 curl 一次 healthz 的 cron）；Always Free 有回收风险 |
| 客户端验签失败 | 服务器必须使用与客户端内置公钥一致的 keys/（部署时随包上传，勿让脚本新生成） |
| 更新后客户端仍下载不到安装包 | 重新运行 `fix_ota_url.py` 更新 URL 并重签名 |

## 6. 部署文件清单

```
deploy/free-server/
├── README.md           本指南
├── install_server.sh   服务器一键部署脚本（无 Docker）
├── manju.service       systemd 服务单元
├── fix_ota_url.py      修正 OTA 产物 URL + 重新签名
├── requirements.txt    后端依赖副本
├── Caddyfile           可选 HTTPS 反代（需域名）
└── manju-server.tar.gz （由 1.5 步打包生成）
```
