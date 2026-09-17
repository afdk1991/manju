# OTA 自动更新接入指南

本文档说明客户端如何接入 OTA 更新协议 v1。协议完整定义见 [`spec/ota-protocol.v1.md`](../spec/ota-protocol.v1.md)。

---

## 一、先搞清楚：哪些平台能自动装

这是接入前必须理解的第一件事。**"自动更新"在 6 个平台上的能力是不同的**，这是操作系统级别的差异，不是实现问题。

| 平台 | 能否静默自安装 | 接入方式 |
|---|:---:|---|
| Windows | ✅ | 下载 → 校验 → MSIX/EXE 安装器 → 重启 |
| macOS | ✅ | 下载 → 校验 → dmg/pkg 安装 → 重启 |
| Linux | ✅ | AppImage 自替换 / deb+polkit / tar.gz 覆盖 |
| Android | ⚠️ 有条件 | 需 `REQUEST_INSTALL_PACKAGES`，首次要用户授权 |
| **iOS** | ❌ | **只能跳 App Store** |
| **HarmonyOS** | ❌ | **只能跳华为应用市场** |

> **红线**：iOS 与 HarmonyOS 客户端不得声称支持"自动下载安装"。
> 正确做法：检测更新 → 展示说明 → 用户确认 → 跳转商店 → 上报 `event=unsupported`。

---

## 二、接入流程

### 步骤 1：内置公钥

用 `scripts/gen_keypair.py` 生成密钥对，把公钥常量放进客户端：

```bash
python scripts/gen_keypair.py
```

脚本会直接输出 Dart / Rust / TypeScript 三种格式的常量，复制即可。

### 步骤 2：检查更新

```http
GET /api/v1/ota/check?platform=windows&arch=x86_64&channel=stable
    &version=1.2.0&build=120&device_id=xxxx
```

- `200` + `has_update=true` → 有更新
- `204` / `304` → 无更新
- `409` → 降级拦截（拒绝）

### 步骤 3：按 `policy` 决定行为

| policy | 客户端行为 |
|---|---|
| `silent` | 后台静默下载安装（**仅桌面端**） |
| `forced` | 强制弹窗，不可关闭、不可跳过 |
| `suggest` | 可关闭的提示 |

### 步骤 4：下载并校验（**不可省略**）

```text
下载到临时目录
  ↓
校验 SHA256        ← 不匹配立即中止
  ↓
校验 Ed25519 签名  ← 不通过立即中止
  ↓
删除临时文件（若任一步失败）
```

**为什么要两道校验**：SHA256 防传输损坏，Ed25519 防中间人伪造。
只做 SHA256 是不够的——攻击者可以同时替换文件和清单里的哈希值。

### 步骤 5：安装

按平台调用对应安装器，安装成功后上报 `event=installed`。

### 步骤 6：上报

```http
POST /api/v1/ota/report
```

事件：`downloaded` / `installed` / `failed` / `skipped` / `unsupported`

---

## 三、各平台实现要点

### Windows

**推荐 MSIX**：免管理员权限、无残留卸载项，最干净。

```powershell
Add-AppxPackage -Path ".\app.msix" -ForceApplicationShutdown
```

传统 EXE 需打包时支持静默参数（Inno Setup `/VERYSILENT`、MSI `/qn`）。

> 构建需要 **Visual Studio 2022**（MSVC 链接器）。

### macOS

- `.pkg`：`installer -pkg xxx.pkg -target /`（可能需要管理员密码）
- `.dmg`：`hdiutil attach` → 拷贝 `.app` 到 `/Applications` → `hdiutil detach`

应用**必须签名**，否则 Gatekeeper 会拦截。

### Linux

- **AppImage**（最省事）：`chmod +x` → 覆盖自身 → 拉起新进程
- `.deb`：需 `pkexec dpkg -i`（弹系统授权框）
- `.rpm`：`pkexec rpm -U`

前提：安装目录可写。装到 `/opt` 需提权。

### Android

1. Manifest 声明 `REQUEST_INSTALL_PACKAGES`
2. 首次检查 `canRequestPackageInstalls()`，未授权则跳设置页
3. 通过 `PackageInstaller` 会话安装（Android 8.0+ 不能用隐式 Intent）

### iOS

```dart
// 只能跳转，不能下载安装
if (result.mustGoToStore) {
  await launchUrl(Uri.parse(result.storeFallback!.url),
      mode: LaunchMode.externalApplication);
}
```

### HarmonyOS

```typescript
// 拉起华为应用市场
await context.startAbility({ uri: 'store://appgallery/detail?id=Cxxxx' });
```

---

## 四、安全清单

上线前逐项确认：

- [ ] 全程 HTTPS，无明文传输
- [ ] 客户端强制校验 SHA256，失败即中止
- [ ] 客户端强制校验 Ed25519 签名（生产环境）
- [ ] 公钥已内置在客户端，私钥绝未进仓库
- [ ] 校验失败时删除临时文件
- [ ] 版本单调递增，拒绝降级
- [ ] 下载目录权限受限，安装后清理
- [ ] 服务端对 `install_args` 做白名单

---

## 五、灰度发布

服务端按 `device_id` 哈希分桶：

```python
bucket = zlib.crc32(device_id.encode()) % 100
if bucket >= rollout_percent:
    return 204  # 不分给这台设备
```

发布时通过 `--rollout 10` 先放 10%，观察 `ota/report` 的失败率再逐步放开。
