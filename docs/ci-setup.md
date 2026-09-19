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
| `ANDROID_KEYSTORE_PASSWORD` | ⚠️ | 同上 | keystore 密码 |
| `ANDROID_KEY_ALIAS` | ⚠️ | 同上 | 别名 |
| `APPLE_CERTIFICATE_BASE64` | ⚠️ | iOS/macOS 签名 | 导出 p12 后 base64 |
| `APPLE_CERT_PASSWORD` | ⚠️ | 同上 | 证书密码 |
| `APPLE_PROVISIONING_PROFILE` | ⚠️ | iOS 打包 | Provisioning Profile |
| `APPLE_ID` / `APPLE_TEAM_ID` | ⚠️ | 公证（notarize） | Apple Developer 账号 |

✅ = 当前流水线必需；⚠️ = 只在扩展流水线做全平台构建打包时需要。

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

jobs:
  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
        with:
          channel: stable
      - run: flutter build windows --release
      - uses: actions/upload-artifact@v4
        with:
          name: windows-bundle
          path: build/windows/x64/runner/Release/

  build-linux:
    runs-on: ubuntu-latest
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
      - run: flutter build linux --release
      - uses: actions/upload-artifact@v4
        with:
          name: linux-bundle
          path: build/linux/x64/release/bundle/

  build-android:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 21
      - uses: subosito/flutter-action@v2
        with:
          channel: stable
      - run: flutter build apk --release
      - uses: actions/upload-artifact@v4
        with:
          name: android-apk
          path: build/app/outputs/flutter-apk/app-release.apk

  build-macos-ios:
    runs-on: macos-latest   # macOS/iOS 只能在 macOS 上构建
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
        with:
          channel: stable
      - run: flutter build macos --release
      - run: flutter build ipa --release --no-codesign  # 需配置证书后可去掉
```

> **Windows 构建**：GitHub 托管的 `windows-latest` 镜像自带 Visual Studio，
> 可以直接 `flutter build windows`，无需额外配置。

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

```yaml
name: Release

on:
  push:
    tags: ["v*"]

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.13"
      - run: pip install -r scripts/requirements.txt

      # 下载各平台产物（由 build-matrix 产出）
      - uses: actions/download-artifact@v4
        with:
          path: dist/

      # 恢复签名私钥
      - name: Restore signing key
        run: |
          mkdir -p keys
          echo "$ED25519_PRIVATE_KEY" > keys/ota_private.pem
        env:
          ED25519_PRIVATE_KEY: ${{ secrets.ED25519_PRIVATE_KEY }}

      # 逐平台发布 —— 注意 iOS/鸿蒙必须带 --store-url
      - name: Publish Windows
        run: |
          python scripts/ota_manifest.py \
            --platform windows --arch x86_64 --channel stable \
            --version "${GITHUB_REF_NAME#v}" --build "$GITHUB_RUN_NUMBER" \
            --file dist/windows-bundle/manju.msix \
            --api "$OTA_API" --admin-key "$OTA_ADMIN_KEY"
        env:
          OTA_API: https://manju-drama-hub-tkwcxlaw.edgeone.cool
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
          OTA_API: https://manju-drama-hub-tkwcxlaw.edgeone.cool
          OTA_ADMIN_KEY: ${{ secrets.OTA_ADMIN_KEY }}
```

**关键点**：iOS 与 HarmonyOS 的发布步骤**必须**带 `--store-url`，
否则 `ota_manifest.py` 会以 exit 2 退出并让流水线失败——这是刻意的平台红线保护。

---

## 六、本地手工发布

不想配 CI 时，本地一条命令即可：

```bash
python scripts/ota_manifest.py \
  --platform windows --arch x86_64 --channel stable \
  --version 1.1.0 --build 110 \
  --file ./dist/manju-1.1.0-win-x64.msix \
  --api https://manju-drama-hub-tkwcxlaw.edgeone.cool \
  --admin-key $OTA_ADMIN_KEY
```

详见 [`build-release.md`](./build-release.md)。
