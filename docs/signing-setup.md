# 签名证书与上线配置

自动更新能否跑通，**签名是第一道分水岭**。未签名的安装包在多数平台上要么被系统拦截，
要么触发安全警告让用户不敢装。本文档说明各平台怎么签、以及怎么拿到长期可用的域名。

---

## 一、Android keystore ✅ 已生成

已用 JDK 21 的 `keytool` 生成好，可直接使用：

```
位置：clients/manju_rn/android/app/manju-release.keystore
配置：clients/manju_rn/android/keystore.properties
别名：manju
算法：RSA 2048，有效期 10000 天
```

`keystore.properties` 内容：

```properties
STORE_FILE=manju-release.keystore
STORE_PASSWORD=Manju#2026Keystore
KEY_ALIAS=manju
KEY_PASSWORD=Manju#2026Keystore
```

### ⚠️ 两个必须记住的警告

1. **更换 keystore = 更换应用**。一旦上架，后续所有版本必须用同一把密钥签名，
   否则用户必须先卸载旧版才能装新版，更新链路直接断掉。
2. **做好异地备份**。`manju-release.keystore` 丢失将无法再发布更新，且无法找回。

### 重新生成（如果需要正式密钥）

```bash
keytool -genkeypair -v \
  -keystore manju-release.keystore -alias manju \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass <你的密码> -keypass <你的密码> \
  -dname "CN=Manju, OU=Dev, O=Manju Studio, L=Shenzhen, ST=Guangdong, C=CN"
```

### 接入 Gradle（RN 端）

在 `android/app/build.gradle` 的 `android {}` 内加：

```groovy
def keystoreProps = new Properties()
def keystoreFile = rootProject.file("keystore.properties")
if (keystoreFile.exists()) {
    keystoreProps.load(new FileInputStream(keystoreFile))
}

signingConfigs {
    release {
        storeFile file(keystoreProps['STORE_FILE'])
        storePassword keystoreProps['STORE_PASSWORD']
        keyAlias keystoreProps['KEY_ALIAS']
        keyPassword keystoreProps['KEY_PASSWORD']
    }
}
buildTypes {
    release {
        signingConfig signingConfigs.release
    }
}
```

Flutter 端（`clients/manju_flutter/android/app/build.gradle.kts`）同理，Kotlin DSL 写法：

```kotlin
val keystoreFile = rootProject.file("keystore.properties")
val keystoreProps = java.util.Properties().apply {
    if (keystoreFile.exists()) load(keystoreFile.inputStream())
}
signingConfigs {
    create("release") {
        storeFile = file(keystoreProps["STORE_FILE"] as String)
        storePassword = keystoreProps["STORE_PASSWORD"] as String
        keyAlias = keystoreProps["KEY_ALIAS"] as String
        keyPassword = keystoreProps["KEY_PASSWORD"] as String
    }
}
```

> 生产环境建议改用环境变量或 CI Secrets 注入密码，不要把 `keystore.properties` 留在工作区。
> 该文件已在 `.gitignore` 中排除。

---

## 二、macOS / iOS —— 需要你自己操作（我无法代办）

Apple 的签名体系绑定开发者账号，必须你本人登录操作。

### 步骤

1. 加入 [Apple Developer Program](https://developer.apple.com/programs/)（年费 688 元）
2. Xcode → Settings → Accounts 登录 Apple ID
3. 创建 **Developer ID Application** 证书（用于 macOS 分发）
4. 下载并双击安装到钥匙串

### macOS 签名 + 公证（缺一不可）

```bash
# 1. 签名（--options runtime 启用 hardened runtime，公证的必要条件）
codesign --force --deep --options runtime \
  --sign "Developer ID Application: Your Name (TEAMID)" \
  --timestamp Manju.app

# 2. 打包
ditto -c -k --keepParent Manju.app Manju.zip

# 3. 公证（提交到 Apple 扫描，通常几分钟）
xcrun notarytool submit Manju.zip \
  --apple-id "you@example.com" \
  --team-id "TEAMID" \
  --password "app-specific-password" \
  --wait

# 4. 把公证票据钉到应用上（离线也能通过 Gatekeeper）
xcrun stapler staple Manju.app
```

> **不做第 3、4 步会怎样**：用户在其他 Mac 上打开会看到
> "无法打开，因为它来自身份不明的开发者"，必须右键 → 打开才能绕过。
> 对于自动更新来说这等于失败——更新完用户打不开应用。

### iOS

iOS 只能通过 App Store / TestFlight 分发，没有侧载路径。
签名由 Xcode 自动管理即可（勾选 Automatically manage signing）。

---

## 三、Windows 签名（可选但强烈建议）

MSIX 不签名也能装，但会触发 SmartScreen 警告，降低用户信任。

### 正式证书

从 DigiCert、Sectigo 等 CA 购买 **Code Signing Certificate**（OV 约 1000-3000 元/年）。

```powershell
signtool sign /f cert.pfx /p <密码> /tr http://timestamp.digicert.com /td SHA256 /fd SHA256 Manju.msix
```

### 开发期自签名（仅供测试）

```powershell
$cert = New-SelfSignedCertificate `
  -Type CodeSigningCert `
  -Subject "CN=Manju Dev" `
  -KeyUsage DigitalSignature `
  -FriendlyName "Manju Dev Cert" `
  -CertStoreLocation "Cert:\CurrentUser\My" `
  -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3")

# 把它加入本机受信任根证书（仅本机生效）
Export-Certificate -Cert $cert -FilePath manju-dev.cer
Import-Certificate -FilePath manju-dev.cer -CertStoreLocation "Cert:\LocalMachine\Root"
```

> 自签名证书只在导入过的机器上有效，**不能用于分发**。

---

## 四、Linux

通常不需要签名。AppImage 建议用 GPG 签名便于用户校验：

```bash
gpg --armor --detach-sign Manju-x86_64.AppImage
```

---

## 五、永久域名（EdgeOne 控制台操作）

当前预览地址带 `eo_token` 且 **3 小时后过期**：

```
https://manju-drama-hub-tkwcxlaw.edgeone.cool?eo_token=...&eo_time=1789840241
```

### 绑定自定义域名步骤

1. 登录 [EdgeOne 控制台](https://console.cloud.tencent.com/edgeone)
2. 进入 `manju-drama-hub` 项目 → **域名管理** → **绑定域名**
3. 填入你的域名（如 `manju.yourdomain.com`）
4. 按提示到你的 DNS 服务商添加一条 **CNAME** 记录，指向平台给出的目标地址
5. 等待 DNS 生效（通常几分钟，最长 48 小时）
6. 平台自动签发 HTTPS 证书（免费）

完成后即可用 `https://manju.yourdomain.com` 长期访问，不再有 token 和时效问题。

> 如果你还没有域名：腾讯云/阿里云新用户常有 1 元首年优惠，
> 或用免费的 eu.org、nic.eu.org 等二级域名（解析较慢，仅测试用）。

---

## 六、图标 ✅ 已生成

Tauri 打包所需的图标已用 `scripts/gen_icons.py` 生成在
`clients/manju_tauri/src-tauri/icons/`：

| 文件 | 用途 |
|---|---|
| `32x32.png` | Windows 任务栏 |
| `128x128.png` | Linux / 通用 |
| `128x128@2x.png` | 高分屏（实际 256×256） |
| `icon.png` | 1024×1024，Linux AppImage |
| `icon.ico` | Windows 可执行文件 |
| `icon.icns` | macOS 应用 |

生成脚本**零第三方依赖**（纯标准库手写 PNG/ICO/ICNS 编码），可随时重跑：

```bash
python scripts/gen_icons.py
python scripts/gen_icons.py --bg-top "#0d47a1" --bg-bottom "#7b1fa2"   # 换配色
```

> 当前是**占位图标**（渐变背景 + 播放三角）。正式发布前建议换成品牌设计的版本，
> 各平台对图标尺寸和圆角有细微差异，替换时保持同名即可。

---

## 七、检查清单

- [x] Android keystore 已生成并配置
- [x] 签名物料已在 `.gitignore` 排除
- [x] Tauri 图标已生成
- [ ] Apple Developer ID 证书（需你操作）
- [ ] macOS 公证流程跑通
- [ ] Windows 代码签名证书（可选）
- [ ] EdgeOne 绑定自定义域名
