# CI/CD 配置指南

---

## 一、现有流水线

项目目前有一条部署流水线：`.github/workflows/deploy.yml`

**触发条件**：推送到 `main` 分支，且改动落在 `makers/**` 或该 workflow 文件本身。

**执行内容**：
1. checkout 代码
2. 安装 Node 22
3. 安装 EdgeOne CLI（`edgeone@1.6.40`）
4. 部署 `makers/` 到 EdgeOne Makers 生产环境

```yaml
- name: Deploy to EdgeOne Makers (production)
  working-directory: makers
  env:
    EDGEONE_API_TOKEN: ${{ secrets.EDGEONE_API_TOKEN }}
  run: edgeone makers deploy . -n manju -t "$EDGEONE_API_TOKEN" --skip-ai-gateway-sync
```

---

## 二、需要配置的 Secrets

在 GitHub 仓库 **Settings → Secrets and variables → Actions → New repository secret** 添加：

| Secret 名称 | 必需 | 用途 | 如何获取 |
|---|:---:|---|---|
| `EDGEONE_API_TOKEN` | ✅ | 部署到 EdgeOne Makers | EdgeOne 控制台 → 账号 → API Token |
| `OTA_ADMIN_KEY` | ⚠️ | 发布 OTA 版本时调用 `/api/v1/admin/releases` | 服务端 `.env` 中的 `ADMIN_KEY` |
| `ED25519_PRIVATE_KEY` | ⚠️ | 对 OTA 产物签名 | `keys/ota_private.pem` 内容 |
| `ANDROID_KEYSTORE_BASE64` | ⚠️ | Android 签名 | `base64 -w0 your.keystore` |
| `ANDROID_KEYSTORE_PASSWORD` | ⚠️ | 同上 | keystore 密码（`STORE_PASSWORD`） |
| `ANDROID_KEY_ALIAS` | ⚠️ | 同上 | 别名（`KEY_ALIAS`，本项目为 `manju`） |
| `ANDROID_KEY_PASSWORD` | ⚠️ | 同上 | **密钥口令（`KEY_PASSWORD`）** —— 本节表格原先遗漏此项，缺它会使 `android/keystore.properties` 少一行，release 构建签名校验失败 |
| `APPLE_CERTIFICATE_BASE64` | ⚠️ | iOS/macOS 签名 | 导出 p12 后 base64 |
| `APPLE_CERT_PASSWORD` | ⚠️ | 同上 | 证书密码 |
| `APPLE_PROVISIONING_PROFILE` | ⚠️ | iOS 打包 | Provisioning Profile |
| `APPLE_ID` / `APPLE_TEAM_ID` | ⚠️ | 公证（notarize） | Apple Developer 账号 |

✅ = 当前流水线必需；⚠️ = 只在扩展流水线做全平台构建打包时需要。

### 变量（Variables）

除 Secrets 外，还需在 **Settings → Secrets and variables → Actions → Variables** 添加：

| 变量名称 | 用途 | 当前状态 |
|---|---|---|
| `OTA_API` | OTA 服务地址（--api 参数） | ⏳ **待填写**：正式域名尚未绑定。EdgeOne 预览域名 `manju-drama-hub-tkwcxlaw.edgeone.cool` 已过期（实测返回 401，预览域名约 3 小时失效），**不能写死在 workflow 里** |

> **为什么用变量而不是 Secret**：域名不是机密，且需要在日志/排障时可见。
> 之前把 `OTA_API` 硬编码进 workflow，域名轮换时必须改代码。

> **私钥安全**：`ED25519_PRIVATE_KEY` 一旦泄露，攻击者可以签发恶意更新包。
> 绝不要写进代码或日志，只在 CI secrets 中传递。

---

## 三、构建矩阵（可选扩展）

如果要让 CI 自动构建全平台产物，新增 `.github/workflows/build-matrix.yml`：

```yaml
name: Build Matrix

on:
  push:
    tags: ["v*"]
  workflow_dispatch:

# 最小权限原则：只读代码即可
permissions:
  contents: read

jobs:
  build-windows:
    runs-on: windows-latest
    defaults:
      run:
        # ⚠️ pubspec.yaml 在 clients/manju_flutter 下，不加这句 flutter 命令会在仓库根执行并失败
        working-directory: clients/manju_flutter
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
        with:
          channel: stable
      - run: flutter pub get
      - run: flutter build windows --release
      # 产物路径相对 workspace 根目录，必须带 clients/manju_flutter 前缀
      - uses: actions/upload-artifact@v4
        with:
          name: windows-bundle
          path: clients/manju_flutter/build/windows/x64/runner/Release/

  build-linux:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: clients/manju_flutter
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
        with:
          channel: stable
      # Linux 构建需要额外的系统依赖
      - run: |
          sudo apt-get update
          sudo apt-get install -y clang cmake ninja-build \
            libgtk-3-dev liblzma-dev libmpv-dev
      - run: flutter pub get
      - run: flutter build linux --release
      - uses: actions/upload-artifact@v4
        with:
          name: linux-bundle
          path: clients/manju_flutter/build/linux/x64/release/bundle/

  build-android:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: clients/manju_flutter
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 21
      - uses: subosito/flutter-action@v2
        with:
          channel: stable
      # 恢复 Android 发布签名物料。
      # 缺 android/keystore.properties 时，app/build.gradle.kts 会主动抛 GradleException
      # （刻意保护：避免静默产出 debug 签名的 release 包），所以这一步不可省。
      # keystore 落在 android/app/ 下 —— build.gradle.kts 中 file("manju-release.keystore")
      # 是相对 app 模块解析的；keystore.properties 落在 android/ 下，
      # 因为脚本用 rootProject.file("keystore.properties") 读取。
      - name: Restore Android keystore
        run: |
          echo "$ANDROID_KEYSTORE_BASE64" | base64 -d > android/app/manju-release.keystore
          cat > android/keystore.properties <<EOF
          STORE_FILE=manju-release.keystore
          STORE_PASSWORD=$ANDROID_KEYSTORE_PASSWORD
          KEY_ALIAS=$ANDROID_KEY_ALIAS
          KEY_PASSWORD=$ANDROID_KEY_PASSWORD
          EOF
        env:
          ANDROID_KEYSTORE_BASE64: ${{ secrets.ANDROID_KEYSTORE_BASE64 }}
          ANDROID_KEYSTORE_PASSWORD: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
          ANDROID_KEY_ALIAS: ${{ secrets.ANDROID_KEY_ALIAS }}
          ANDROID_KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}
      - run: flutter pub get
      - run: flutter build apk --release
      - uses: actions/upload-artifact@v4
        with:
          name: android-apk
          path: clients/manju_flutter/build/app/outputs/flutter-apk/app-release.apk

  build-macos-ios:
    runs-on: macos-latest   # macOS/iOS 只能在 macOS 上构建
    defaults:
      run:
        working-directory: clients/manju_flutter
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
        with:
          channel: stable
      - run: flutter pub get
      - run: flutter build macos --release
      - run: flutter build ipa --release --no-codesign  # 需配置证书后可去掉
      - uses: actions/upload-artifact@v4
        with:
          name: macos-bundle
          path: clients/manju_flutter/build/macos/Build/Products/Release/
      - uses: actions/upload-artifact@v4
        with:
          name: ios-ipa
          path: clients/manju_flutter/build/ios/ipa/
```

> **Windows 构建**：GitHub 托管的 `windows-latest` 镜像自带 Visual Studio，
> 可以直接 `flutter build windows`，无需额外配置。

> ⚠️ **待确认：Tauri 桌面端是否纳入本矩阵？**
> 仓库里 `clients/manju_tauri/` 是桌面交付方案之一，但依赖 Rust + Node 双工具链
> （`npm run tauri build`），与 Flutter 桌面端产物会重名冲突。可选方案：
> **A)** 新增 `build-tauri` job，产物上传为 `tauri-*` 前缀，与 Flutter 桌面端并存；
> **B)** 暂不纳入 CI，桌面端统一由 Flutter 产出。
> 二者未确定前，上方矩阵不包含 Tauri。

---

## 四、自托管 Runner（macOS 构建机）

GitHub 托管的 macOS runner 有分钟数限制（免费额度内）。
若频繁构建 macOS/iOS，建议接入自己的 Mac 作为自托管 runner：

```bash
# 1. 在 Mac 上创建 runner 目录
mkdir actions-runner && cd actions-runner

# 2. 下载 runner（版本以 GitHub 页面提示为准）
curl -o actions-runner.tar.gz -L \
  https://github.com/actions/runner/releases/download/v2.321.0/actions-runner-osx-arm64-2.321.0.tar.gz
tar xzf actions-runner.tar.gz

# 3. 配置（token 从 GitHub 仓库 Settings → Actions → Runners → New self-hosted runner 获取）
./config.sh --url https://github.com/<owner>/<repo> --token <TOKEN>

# 4. 启动（后台常驻）
./run.sh
```

然后在 workflow 中指定：

```yaml
build-macos:
  runs-on: [self-hosted, macOS, ARM64]
```

**自托管 runner 上需预装**：Flutter SDK、Xcode + Command Line Tools、CocoaPods、
Apple 开发者证书（钥匙串中）。

---

## 五、发布流水线（可选扩展）

打 tag 触发，构建全平台后自动发布 OTA：

> ⚠️ **待确认：本 workflow 现在取不到 build-matrix 的产物。**
> `actions/download-artifact@v4` **只能下载同一次 workflow run 内的产物**，而上方 Build Matrix
> 是另一个 workflow 文件 —— 即使触发器相同（`push: tags: v*`）也是两次独立运行，会取到空目录。
> 可选方案：
> **A)（推荐）合并**：把 Build Matrix 的四个 job 与下面的 release job 放进**同一个** workflow，
> 并加 `needs: [build-windows, build-linux, build-android, build-macos-ios]`；
> **B) 保留拆分**：把这里的触发器改成
> `on: workflow_run: workflows: ["Build Matrix"] types: [completed]`，
> 并在 job 上加 `if: github.event.workflow_run.conclusion == 'success'`。
> 未确定前，下方代码块仍按 A 方案的产物路径书写。

```yaml
name: Release

on:
  push:
    tags: ["v*"]

permissions:
  contents: read

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.13"
      - run: pip install -r scripts/requirements.txt

      # 下载各平台产物（需与 Build Matrix 处于同一 workflow run，见上方"待确认"）
      - uses: actions/download-artifact@v4
        with:
          path: dist/

      # 恢复签名私钥（收紧权限，避免同 runner 上其它步骤可读）
      - name: Restore signing key
        run: |
          umask 077
          mkdir -p keys
          echo "$ED25519_PRIVATE_KEY" > keys/ota_private.pem
        env:
          ED25519_PRIVATE_KEY: ${{ secrets.ED25519_PRIVATE_KEY }}

      # —— 打包：Flutter 原生产出是"目录/未封装"，OTA 只接受单文件，
      #    且 ota_manifest.py 按平台白名单校验扩展名（windows 允许 msix/exe/zip，
      #    macos 允许 dmg/pkg/zip，linux 允许 appimage/deb/rpm/tar_gz/zip）——
      - name: Package bundles
        run: |
          set -euo pipefail
          VER="${GITHUB_REF_NAME#v}"
          ( cd dist/windows-bundle && zip -qr "../../manju-$VER-win-x64.zip" . )
          tar -czf "manju-$VER-linux-x64.tar.gz" -C dist/linux-bundle .
          ( cd dist/macos-bundle && zip -qr "../../manju-$VER-macos.zip" . )
          ls -lh manju-$VER-*

      # 逐平台发布 —— 注意 iOS/鸿蒙必须带 --store-url
      - name: Publish Windows
        run: |
          python scripts/ota_manifest.py \
            --platform windows --arch x86_64 --channel stable \
            --version "${GITHUB_REF_NAME#v}" --build "$GITHUB_RUN_NUMBER" \
            --file "manju-${GITHUB_REF_NAME#v}-win-x64.zip" \
            --api "$OTA_API" --admin-key "$OTA_ADMIN_KEY"
        env:
          OTA_API: ${{ vars.OTA_API }}
          OTA_ADMIN_KEY: ${{ secrets.OTA_ADMIN_KEY }}

      - name: Publish Linux
        run: |
          python scripts/ota_manifest.py \
            --platform linux --arch x86_64 --channel stable \
            --version "${GITHUB_REF_NAME#v}" --build "$GITHUB_RUN_NUMBER" \
            --file "manju-${GITHUB_REF_NAME#v}-linux-x64.tar.gz" \
            --api "$OTA_API" --admin-key "$OTA_ADMIN_KEY"
        env:
          OTA_API: ${{ vars.OTA_API }}
          OTA_ADMIN_KEY: ${{ secrets.OTA_ADMIN_KEY }}

      - name: Publish macOS
        run: |
          python scripts/ota_manifest.py \
            --platform macos --arch x86_64 --channel stable \
            --version "${GITHUB_REF_NAME#v}" --build "$GITHUB_RUN_NUMBER" \
            --file "manju-${GITHUB_REF_NAME#v}-macos.zip" \
            --api "$OTA_API" --admin-key "$OTA_ADMIN_KEY"
        env:
          OTA_API: ${{ vars.OTA_API }}
          OTA_ADMIN_KEY: ${{ secrets.OTA_ADMIN_KEY }}

      - name: Publish Android
        run: |
          python scripts/ota_manifest.py \
            --platform android --arch arm64 --channel stable \
            --version "${GITHUB_REF_NAME#v}" --build "$GITHUB_RUN_NUMBER" \
            --file dist/android-apk/app-release.apk \
            --api "$OTA_API" --admin-key "$OTA_ADMIN_KEY"
        env:
          OTA_API: ${{ vars.OTA_API }}
          OTA_ADMIN_KEY: ${{ secrets.OTA_ADMIN_KEY }}

      - name: Publish iOS (store only)
        run: |
          python scripts/ota_manifest.py \
            --platform ios --arch arm64 --channel stable \
            --version "${GITHUB_REF_NAME#v}" --build "$GITHUB_RUN_NUMBER" \
            --no-artifact \
            --store-url "https://apps.apple.com/app/id0000000000" \
            --api "$OTA_API" --admin-key "$OTA_ADMIN_KEY"
        env:
          OTA_API: ${{ vars.OTA_API }}
          OTA_ADMIN_KEY: ${{ secrets.OTA_ADMIN_KEY }}

      - name: Publish HarmonyOS (store only)
        run: |
          python scripts/ota_manifest.py \
            --platform harmonyos --arch arm64 --channel stable \
            --version "${GITHUB_REF_NAME#v}" --build "$GITHUB_RUN_NUMBER" \
            --no-artifact \
            --store-url "https://appgallery.huawei.com/app/C000000" \
            --api "$OTA_API" --admin-key "$OTA_ADMIN_KEY"
        env:
          OTA_API: ${{ vars.OTA_API }}
          OTA_ADMIN_KEY: ${{ secrets.OTA_ADMIN_KEY }}

      # 无论成败都清掉私钥，避免随 runner 残留被后续步骤读到
      - name: Cleanup signing key
        if: always()
        run: rm -f keys/ota_private.pem
```

**关键点**：iOS 与 HarmonyOS 的发布步骤**必须**带 `--store-url`，
否则 `ota_manifest.py` 会以 exit 2 退出并让流水线失败——这是刻意的平台红线保护。

> ⚠️ **待确认（3 项，均无法从仓库推断）**
> 1. **iOS `--store-url` 的 `id0000000000` 与鸿蒙的 `C000000` 都是占位值**，必须替换成
>    真实 App Store ID / 华为应用市场 App ID，否则用户会被跳到404。
> 2. **Windows 走 zip 而非 msix（现状所迫，非偏好）**：已核实
>    `clients/manju_flutter/pubspec.yaml` **没有 `dev_dependencies: msix`**，
>    所以 `flutter pub run msix:build` 会失败，`scripts/build_all.ps1` 也必然降级为 zip。
>    若要改产 MSIX，需要先补该依赖与 MSIX 签名证书：
>    **A)** 补 `dev_dependencies: msix` 后在 Package bundles 步骤改用 `flutter pub run msix:build`；
>    **B)** 直接复用 `scripts/build_all.ps1 -Targets windows -OutDir dist`，让它内部决定 msix/zip。
>    在此之前，发布 `zip` 是唯一可达的路径（`ota_manifest.py` 允许 windows 的 `zip` 类型）。
> 3. **macOS 产物当前未签名**：未签名包会被 Gatekeeper 拦截，等于"能发布但装不上"。
>    接入 Developer ID 签名前，建议先跳过 macOS 发布步骤。

---

## 六、本地手工发布

不想配 CI 时，本地一条命令即可：

```bash
# $OTA_API 用你的真实服务地址（本地联调为 http://localhost:8000）
python scripts/ota_manifest.py \
  --platform windows --arch x86_64 --channel stable \
  --version 1.1.0 --build 110 \
  --file ./dist/manju-1.1.0-win-x64.msix \
  --api "${OTA_API:-http://localhost:8000}" \
  --admin-key "$OTA_ADMIN_KEY"
```

> ⚠️ **待确认**：本节原本硬编码了 EdgeOne 预览域名
> `https://manju-drama-hub-tkwcxlaw.edgeone.cool`，该域名已过期（返回 401，见
> [`blockers.md`](./blockers.md) §2.1）。正式域名绑定前，请显式导出 `OTA_API`。

详见 [`build-release.md`](./build-release.md)。
