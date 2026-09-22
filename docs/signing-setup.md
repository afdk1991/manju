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

> ⚠️ **待确认：上面 `Manju#2026Keystore` 是不是真实口令？**
> 仓库里的模板文件 `clients/manju_rn/android/keystore.properties.example` 是**空口令**的，
> 而本段示例却带了具体字符串。若它与真实 keystore 口令一致，等同口令已经公开：
> - **A) 若只是示例**：改成 `<从 CI Secret 注入>` 之类占位，避免误导；
> - **B) 若是真实口令**：视为已泄露，需轮换 keystore 口令，并把真实值只放在
>   CI Secrets（`ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_PASSWORD`）里。
>
> 注意 `keystore.properties` 已在 `.gitignore` 第 24-25 行排除，
> **泄露面仅限本文档**，但本文档会随仓库分发。

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
// 只在 keystore.properties 存在时注册 release 配置，
// 避免无密钥时静默回落到 debug 签名。
def keystoreFile = rootProject.file('keystore.properties')
signingConfigs {
    release {
        if (!keystoreFile.exists()) {
            // 显式失败优于静默产出 debug 签名的 release 包：
            // debug 签名的包一旦安装，后续正式包无法覆盖升级。
            throw new GradleException(
                "缺少 ${keystoreFile}：release 构建需要发布签名配置。" +
                "复制 keystore.properties.example 并填入真实密钥，或在 CI 中注入。")
        }
        def keystoreProps = new Properties()
        keystoreFile.withInputStream { keystoreProps.load(it) }
        storeFile file(keystoreProps['STORE_FILE'])
        storePassword keystoreProps['STORE_PASSWORD']
        keyAlias keystoreProps['KEY_ALIAS']
        keyPassword keystoreProps['KEY_PASSWORD']
    }
}
buildTypes {
    release {
        signingConfig signingConfigs.release
        // RN 端另有 proguard 配置，视工程需要保留：
        // minifyEnabled enableProguardInReleaseBuilds
        // proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"
    }
}
```

> 上面的写法与仓库现状一致，可直接对照
> `clients/manju_rn/android/app/build.gradle` 第 30-64 行。
> 早期版本只有 `if (exists) load` 而没有 `else`，缺文件时会在
> `file(null)` 处抛出难以定位的错误——已经改为显式 `GradleException`。

Flutter 端（`clients/manju_flutter/android/app/build.gradle.kts`）同理，Kotlin DSL 写法：

```kotlin
val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties().apply {
    if (keystorePropertiesFile.exists()) {
        keystorePropertiesFile.inputStream().use { load(it) }
    }
}

android {
    signingConfigs {
        // 仅当 keystore.properties 存在时才注册 release 配置，避免无密钥时静默用 debug 签名。
        if (keystorePropertiesFile.exists()) {
            create("release") {
                storeFile = keystoreProperties["STORE_FILE"]?.let { file(it as String) }
                storePassword = keystoreProperties["STORE_PASSWORD"] as String?
                keyAlias = keystoreProperties["KEY_ALIAS"] as String?
                keyPassword = keystoreProperties["KEY_PASSWORD"] as String?
            }
        }
    }

    buildTypes {
        release {
            // 缺失发布签名时显式失败：debug 签名的 release 包会导致后续无法平滑升级。
            signingConfig = if (keystorePropertiesFile.exists()) {
                signingConfigs.getByName("release")
            } else {
                throw GradleException(
                    "缺少 ${keystorePropertiesFile}：release 构建需要发布签名配置。" +
                    "请复制 keystore.properties.example 并填入真实密钥，或在 CI 中注入。"
                )
            }
        }
    }
}
```

> 与仓库现状一致，可对照 `clients/manju_flutter/android/app/build.gradle.kts` 第 12-66 行。
> Kotlin DSL 里 `as String` 是**非空强转**，若 properties 缺某个键会直接 NPE；
> 上面写法用 `as String?` 交由 Gradle 侧校验并给出可读错误。

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

# 5. 验证——不做这一步，前面失败也可能"看起来成功"
xcrun stapler validate Manju.app
spctl -a -vvv --type install Manju.app
# 期望看到：source=Notarized Developer ID
```

> **CI 里不要用密码认证**：`--apple-id` / `--password` 这种组合在开启双重认证后会失败，
> 且明文口令会进 CI 日志。改用 App Store Connect API Key + keychain-profile：
>
> ```bash
> # 一次性：用 .p8 私钥建立凭据档案（对应 Secrets：APPLE_API_KEY / APPLE_API_KEY_ID / APPLE_API_ISSUER）
> xcrun notarytool store-credentials "manju-notary" \
>   --key "../keys/AuthKey_XXXX.p8" \
>   --key-id "<APPLE_API_KEY_ID>" \
>   --issuer "<APPLE_API_ISSUER>"
>
> # 之后提交公证只需：
> xcrun notarytool submit Manju.zip --keychain-profile "manju-notary" --wait
> ```
>
> 这与 [`ci-setup.md`](./ci-setup.md) 里 `APPLE_ID` / `APPLE_TEAM_ID` 两个 Secret 的用途一致。

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
# 0) 导入到 LocalMachine\Root 需要管理员权限，先自检避免半途失败
$isAdmin = ([Security.Principal.WindowsPrincipal] `
  [Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { throw "请以管理员身份运行 PowerShell（导入受信任根证书需要提升的权限）" }

# 1) 生成自签名代码签名证书（不指定 -NotAfter 时默认只有 1 年，这里显式给 3 年）
$cert = New-SelfSignedCertificate `
  -Type CodeSigningCert `
  -Subject "CN=Manju Dev" `
  -KeyUsage DigitalSignature `
  -FriendlyName "Manju Dev Cert" `
  -CertStoreLocation "Cert:\CurrentUser\My" `
  -NotAfter (Get-Date).AddYears(3) `
  -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3")

# 2) 把它加入本机受信任根证书（仅本机生效）
Export-Certificate -Cert $cert -FilePath manju-dev.cer
Import-Certificate -FilePath manju-dev.cer -CertStoreLocation "Cert:\LocalMachine\Root"

# 3) 签名（上面只准备了证书，这一步才是真正的签名；缺了它文件仍处于未签名状态）
Set-AuthenticodeSignature -FilePath .\Manju.msix -Certificate $cert `
  -TimestampServer http://timestamp.digicert.com -HashAlgorithm SHA256

# 4) 校验签名状态：Status 必须为 Valid，否则 SmartScreen 仍会拦截
Get-AuthenticodeSignature .\Manju.msix | Format-List Status, StatusMessage, SignerCertificate
```

> ⚠️ **待确认**：第 3 步的目标文件写作 `.\Manju.msix`。
> 仓库 `scripts/build_all.ps1` 实际会产出 **两个可选结果**——MSIX 打包成功时是
> `dist\manju-<version>-win-x64.msix`，失败降级时是 `dist\manju-<version>-win-x64.zip`
> （zip 不支持 Authenticode 签名）。可选方案：
> **A)** 只对 MSIX 签名（保持上方写法，按实际文件名替换）；
> **B)** 在 pubspec 补 `dev_dependencies: msix` 并接入 MSIX 专用证书，使 MSIX 成为稳定产物。

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
- [x] 四端图标 + 鸿蒙 element/media 资源已全量补齐
- [x] OTA 密钥已轮换，旧私钥已从 git 历史清除
- [ ] **把新私钥填进两处 Secret**（见下，需你操作）
- [ ] Apple Developer ID 证书（需你操作）
- [ ] macOS 公证流程跑通
- [ ] Windows 代码签名证书（可选）
- [ ] EdgeOne 绑定自定义域名

---

## 八、OTA 密钥轮换记录（2026-09-20）

**事故**：初版 `keys/ota_private.pem` 被 `init: proj-07` 提交，并随 `origin/main`
推送到了 GitHub。`.gitignore` 对**已跟踪文件无效**，所以加忽略规则并不能撤回已推送的内容。

**已完成的处置**：
1. `scripts/gen_keypair.py --force` 生成新密钥对
2. 新公钥写入四端：`ota_public_key.dart` / `publicKey.ts`（RN、Tauri）/
   `tauri.conf.json` 的 `plugins.updater.pubkey` / makers 的 `ota/public-key.json`
3. `git rm --cached` 取消跟踪
4. `git filter-repo --path keys/ota_private.pem --invert-paths` 重写全部历史
5. `git push --force` 覆盖远端

**⚠️ 你必须补的一步**：新私钥只在本地磁盘，两处 Secret 还是旧值，不同步会导致
CI 与云端签出的包**被客户端拒绝**：
- GitHub → Settings → Secrets：`ED25519_PRIVATE_KEY` ← `keys/ota_private.pem` 全文
- EdgeOne Makers 控制台：`MANJU_OTA_PRIVATE_KEY` ← 同上

**注意**：GitHub 对被强推覆盖的旧对象仍可能通过直接 commit SHA 短暂访问，
所以旧密钥一律视为已泄露，不要再用于任何产物签名。
