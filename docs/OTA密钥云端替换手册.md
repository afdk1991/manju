# OTA Ed25519 密钥（MANJU_OTA_PRIVATE_KEY）云端替换手册

> 适用场景：`scripts/check_ota_keys.py` 报告 `makers/.env` 中的 `MANJU_OTA_PRIVATE_KEY`
> 是「曾泄露进 GitHub 的旧密钥」，或你想彻底轮换密钥以退役泄露钥。
> 本手册不改动代码，只处理**密钥身份**与**云端环境变量**。

---

## 一、当前事实基线（执行 `check_ota_keys.py` 得出）

| 来源 | 公钥(base64) | 身份 |
|---|---|---|
| `keys/ota_private.pem` | `f2obZdLFwhWJtuA/u/VW/EB1jAZ/UiZF/eEbxFJ0a3c=` | **新有效钥** ✅ |
| `keys/ota_public.pem` | `f2obZdLFwhWJtuA/u/VW/EB1jAZ/UiZF/eEbxFJ0a3c=` | 新有效钥 ✅ |
| `makers/static/api/v1/ota/public-key.json` | `f2obZdLFwhWJtuA/u/VW/EB1jAZ/UiZF/eEbxFJ0a3c=` | 新有效钥 ✅（部署上线） |
| `makers/.env` → `MANJU_OTA_PRIVATE_KEY` | `DuW8zxjUYPNEnNY8RMIe4G670V5ZzX39rl1v9CEVQRU=` | **旧泄露钥** ⚠️ |

**关键结论**

- 导出 / 签名链路是**安全**的：发布签名读的是 `keys/ota_private.pem`（新钥），线上公钥也匹配新钥，OTA 校验能通过。
- 仅本地 `makers/.env` 是脏状态：`edgeone makers deploy` 会把云端 env **反向覆盖**到本地 `.env`，而云端该变量目前仍是旧泄露钥（或部署过程残留），于是 `.env` 被写成旧钥。
- `.env` 受 `makers/.gitignore:44 (**/.env)` 保护，**未被 git 跟踪**，git status 干净 —— 不会造成新的代码泄露，纯粹是本地磁盘上的脏文件。

---

## 二、决策树：你需要做哪一种？

```
check_ota_keys.py 输出
│
├─ 导出链路安全 ✅ 且 .env 脏状态 ⚠️（当前状态）
│      → 发布不受影响，可暂不处理。
│      → 想要「本地也彻底干净」→ 走 方案 A（覆盖 .env 即可，不动云端）
│
└─ 导出链路 ❌（keys/ 或线上公钥是旧泄露钥）
       → 必须立即轮换 → 走 方案 B（生成全新密钥对并全链路对齐）
```

> 当前属于第一种。下面两个方案都给出，按需取用。

---

## 三、方案 A：仅清理本地 .env（不动云端，最快）

适用：确认云端 `MANJU_OTA_PRIVATE_KEY` 已经是新有效钥，只是本地 `.env` 被旧值覆盖。

1. 打开 EdgeOne 控制台 → 你的 `manju` 项目 → **环境变量 / Environment Variables**。
2. 找到 `MANJU_OTA_PRIVATE_KEY`，确认其值对应的公钥是
   `f2obZdLFwhWJtuA/u/VW/EB1jAZ/UiZF/eEbxFJ0a3c=`（即下面的新私钥 PEM）。
   - 如果云端已经是新私钥 → 直接第 3 步重拉即可。
   - 如果云端仍是旧泄露私钥 → 先用本手册「四、控制台替换步骤」把它改成新私钥，再第 3 步。
3. 本地重新拉取环境变量，覆盖脏的 `.env`：
   ```bash
   cd D:/网站全栈项目/项目007/makers
   edgeone makers link --env    # 重新关联项目，会重新写入 .env
   # 若 link 不刷新 env，改用：
   edgeone makers env pull      # 部分版本支持，把云端 env 拉回本地
   ```
4. 复核：
   ```bash
   cd D:/网站全栈项目/项目007
   "C:/Users/addk1/.workbuddy/binaries/python/versions/3.13.12/python.exe" scripts/check_ota_keys.py
   ```
   期望：`1_env_private_b64` → `[NEW(有效)]`，且「本地 .env 脏状态」变为「否」。

> ⚠️ 已知坑：`edgeone makers env set MANJU_OTA_PRIVATE_KEY=...` 在本机会**静默失败**（命令返回成功但云端值不变）。
> 任何真正改变云端密钥的操作都**必须走控制台**，CLI 不可信。

---

## 四、方案 B：整套轮换新密钥（彻底退役泄露钥，推荐）

适用：你希望旧泄露钥在任何地方都不再有效，或属于合规要求必须轮换。

### 4.1 本地生成全新 Ed25519 密钥对

```bash
cd D:/网站全栈项目/项目007
# 用 openssl（受管环境通常可用）生成新私钥
openssl genpkey -algorithm ed25519 -out keys/ota_private.pem
# 导出匹配的公钥
openssl pkey -in keys/ota_private.pem -pubout -out keys/ota_public.pem
```

或用 Node（本环境必有）：

```bash
"C:/Users/addk1/.workbuddy/binaries/node/versions/22.22.2-3/node.exe" -e '
const crypto=require("crypto"),fs=require("fs");
const k=crypto.generateKeyPairSync("ed25519");
fs.writeFileSync("keys/ota_private.pem",k.privateKey.export({type:"pkcs8",format:"pem"}));
fs.writeFileSync("keys/ota_public.pem",k.publicKey.export({type:"spki",format:"pem"}));
console.log("新私钥已写入 keys/ota_private.pem");
'
```

### 4.2 把新公钥写入线上（导出静态资源）

项目导出脚本用 `keys/ota_public.pem` 生成 `makers/static/api/v1/ota/public-key.json`：

```bash
cd D:/网站全栈项目/项目007
# 若 export_static.py 在本机可跑（需 sqlalchemy）：
python makers/scripts/export_static.py
# 否则用等价重建脚本（仅依赖 sqlite3，已验证可用）：
python scripts/regen_static_content.py
# 复核线上公钥文件已被新公钥覆盖
cat makers/static/api/v1/ota/public-key.json
```

### 4.3 把新私钥写入云端环境变量（控制台，必须）

1. 读取新私钥内容：
   ```bash
   cat D:/网站全栈项目/项目007/keys/ota_private.pem
   ```
2. 打开 EdgeOne 控制台 → `manju` 项目 → **环境变量**。
3. 编辑 `MANJU_OTA_PRIVATE_KEY`，把**整段 PEM**（含 `-----BEGIN PRIVATE KEY-----` 与 `-----END PRIVATE KEY-----` 及中间换行）粘贴为新值。
   - 注意：CLI 的 `edgeone makers env set` 会静默失败，请务必在控制台界面操作。
4. 保存。

### 4.4 重新关联并部署

```bash
cd D:/网站全栈项目/项目007/makers
edgeone makers link --env     # 把云端新私钥拉回本地 .env
cd ..
python scripts/localize_assets.py
edgeone makers deploy
```

### 4.5 复核

```bash
python scripts/check_ota_keys.py
# 期望：四来源全部 [NEW(有效)]，导出链路安全 ✅，.env 脏状态 否
```

---

## 五、当前正确的密钥值（如仅回填 .env，用这组）

**新有效私钥 PEM（与 `keys/ota_private.pem` 一致）：**

```
-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIH8jpFxoMozjoa7tyfyfTWldgeVx88Pi6qe5jAVBEFej
-----END PRIVATE KEY-----
```

对应公钥（base64 原始 32 字节）：`f2obZdLFwhWJtuA/u/VW/EB1jAZ/UiZF/eEbxFJ0a3c=`

> ⚠️ 私钥即 root 权限：仅在可信环境粘贴，不要发到群聊 / 工单 / 截图外泄。
> 本泄露事件正源于旧私钥曾进入过 Git 历史；如需彻底干净，优先走**方案 B 轮换**。

---

## 六、回滚与应急

- 若轮换后 OTA 校验失败（客户端拒绝更新）：确认 `public-key.json`（线上）与云端 `MANJU_OTA_PRIVATE_KEY` 必须**同源**——二者不一致是唯一会导致 OTA 失败的原因。重新执行 4.2 + 4.3 保证同源即可。
- 旧泄露钥 `DuW8zxjUYPNEnNY8RMIe4G670V5ZzX39rl1v9CEVQRU=` 一旦完成轮换即自动失效，无需额外撤销操作。
- 任何情况下都不要提交 `.env`（`**/.env` 已在 .gitignore）；若误提交，立即走方案 B 轮换并清理 Git 历史。

---

## 七、一键健康检查

```bash
cd D:/网站全栈项目/项目007
"C:/Users/addk1/.workbuddy/binaries/python/versions/3.13.12/python.exe" scripts/check_ota_keys.py
```

脚本自带自动回退：优先 cryptography，缺失时直接用 Node 内置 crypto，无需手动装包。
