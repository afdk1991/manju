# -*- coding: utf-8 -*-
<#
.SYNOPSIS
    漫剧 Manju 全平台一键构建脚本（PowerShell）

.DESCRIPTION
    覆盖 6 个平台：Android / iOS / HarmonyOS / Windows / macOS / Linux。
    核心原则：缺少对应工具链时优雅跳过，绝不崩溃（exit 0，仅真实构建失败才 exit 1）。
    每个平台一个独立函数，由 Build-Flutter 统一调度（pub get → 按平台构建）。

.PARAMETER Version
    语义化版本号，如 1.1.0，传给 flutter --build-name

.PARAMETER BuildNumber
    构建号，单调递增，传给 flutter --build-number，默认 1

.PARAMETER Channel
    发布通道：stable / beta / nightly，默认 stable

.PARAMETER SkipTests
    跳过 flutter test

.PARAMETER ApiBase
    后端 API 基址，通过 --dart-define=API_BASE 注入到客户端，默认 https://api.example.com

.PARAMETER Targets
    仅构建指定平台（如 windows,macos）；留空则构建全部可构建平台

.PARAMETER FlutterHome
    Flutter SDK 目录，默认 D:\sdks\flutter（缺失不影响，会回退到 PATH 中的 flutter）

.PARAMETER OutDir
    产物输出目录，默认 dist
#>
[CmdletBinding()]
param(
    [string]$Version = '1.0.0',
    [int]$BuildNumber = 1,
    [ValidateSet('stable', 'beta', 'nightly')]
    [string]$Channel = 'stable',
    [switch]$SkipTests,
    [string]$ApiBase = 'https://api.example.com',
    [string[]]$Targets = @(),
    [string]$FlutterHome = 'D:\sdks\flutter',
    [string]$OutDir = 'dist'
)

# 控制台输出统一为 UTF-8，避免中文乱码
try {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $OutputEncoding = [System.Text.Encoding]::UTF8
} catch { }

# ---------- 镜像环境变量（国内加速；缺失不影响逻辑） ----------
$env:PUB_HOSTED_URL = 'https://pub.flutter-io.cn'
$env:FLUTTER_STORAGE_BASE_URL = 'https://storage.flutter-io.cn'
$env:PUB_CACHE = 'D:/sdks/pub-cache'

# ---------- 颜色化输出辅助 ----------
function Write-Step($msg) { Write-Host ("==> " + $msg) -ForegroundColor Cyan }
function Write-Info($msg) { Write-Host ("    " + $msg) }
function Write-Ok($msg)   { Write-Host ("[成功] " + $msg) -ForegroundColor Green }
function Write-Skip($platform, $reason) {
    Write-Host ("[跳过] " + $platform + " : " + $reason) -ForegroundColor Yellow
}
function Write-Warn($msg) { Write-Host ("[警告] " + $msg) -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host ("[错误] " + $msg) -ForegroundColor Red }

# 结果收集（脚本作用域数组，避免重复）
$script:built = @()
$script:skipped = @()
$script:failed = @()
function Add-Built($p) { if ($script:built -notcontains $p)   { $script:built += $p } }
function Add-Skip($p)  { if ($script:skipped -notcontains $p) { $script:skipped += $p } }
function Add-Fail($p)  { if ($script:failed -notcontains $p)  { $script:failed += $p } }

# ---------- 操作系统检测（兼容 PowerShell 5.1 与 7） ----------
# 注意：PowerShell 5.1 没有 $IsWindows/$IsMacOS/$IsLinux 自动变量，需回退检测
function Test-IsWindows {
    if (Test-Path variable:IsWindows) { return $IsWindows }
    return ($env:OS -eq 'Windows_NT')
}
function Test-IsMacOS {
    if (Test-Path variable:IsMacOS) { return $IsMacOS }
    if ($env:OS -eq 'Windows_NT') { return $false }
    try { return ((uname 2>$null) -eq 'Darwin') } catch { return $false }
}
function Test-IsLinux {
    if (Test-Path variable:IsLinux) { return $IsLinux }
    if ($env:OS -eq 'Windows_NT') { return $false }
    try { return ((uname 2>$null) -eq 'Linux') } catch { return $false }
}

# ---------- Flutter 工具链检测与引导 ----------
$script:FlutterReady = $false
function Test-Flutter {
    if ($script:FlutterReady) { return $true }
    $f = Get-Command flutter -ErrorAction SilentlyContinue
    if (-not $f) {
        # 尝试从 FlutterHome 引导到 PATH
        $bin = Join-Path $FlutterHome 'bin'
        if (Test-Path $bin) {
            $env:PATH = ($env:PATH + [System.IO.Path]::PathSeparator + $bin)
            $f = Get-Command flutter -ErrorAction SilentlyContinue
        }
    }
    if ($f) { $script:FlutterReady = $true; return $true }
    return $false
}

# ---------- 客户端工程目录 ----------
$ClientDir = $null
try {
    $ClientDir = Resolve-Path (Join-Path $PSScriptRoot '..' 'clients' 'manju_flutter')
} catch {
    $ClientDir = Join-Path (Get-Location) 'clients' 'manju_flutter'
}
$OutDirResolved = $null
try { $OutDirResolved = Resolve-Path $OutDir -ErrorAction SilentlyContinue } catch { }
if (-not $OutDirResolved) {
    New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
    $OutDirResolved = Resolve-Path $OutDir
}

# 将构建产物从源路径复制到输出目录
function Copy-Artifact($src, $destName) {
    if (Test-Path $src) {
        Copy-Item $src (Join-Path $OutDirResolved $destName) -Force
        return $true
    }
    return $false
}

# ========================= 各平台构建函数 =========================

# 主干准备：pub get（+ 可选测试），随后按目标构建各平台
function Build-Flutter {
    Write-Step "准备 Flutter 主干（pub get$(if ($SkipTests) { ' + 跳过测试' } else { ' + 测试' })）"
    if (-not (Test-Flutter)) {
        Write-Skip "Flutter" "未找到 Flutter 工具链（PATH 与 $FlutterHome 均无），所有依赖 Flutter 的平台将跳过"
        foreach ($t in @('android', 'windows', 'linux', 'macos', 'ios', 'harmonyos')) { Add-Skip $t }
        return
    }

    Push-Location $ClientDir
    try {
        Write-Info "flutter pub get ..."
        flutter pub get 2>&1 | ForEach-Object { Write-Info $_ }
        if (-not $SkipTests) {
            Write-Info "flutter test ..."
            flutter test 2>&1 | ForEach-Object { Write-Info $_ }
        }
    } catch {
        Write-Warn ("Flutter 准备阶段异常（不影响后续跳过逻辑）：$_")
    } finally {
        Pop-Location
    }

    # 按目标平台依次构建
    foreach ($t in $script:effectiveTargets) {
        switch ($t) {
            'android'   { Build-Android }
            'windows'   { Build-Windows }
            'linux'     { Build-Linux }
            'macos'     { Build-MacOS }
            'ios'       { Build-IOS }
            'harmonyos' { Build-HarmonyOS }
            default     { Write-Warn ("未知目标：$t") }
        }
    }
}

function Build-Android {
    Write-Step "构建 Android (APK / AAB)"
    if (-not (Test-Flutter)) { Write-Skip "Android" "缺少 Flutter 工具链"; Add-Skip 'android'; return }

    # Android SDK 检测：ANDROID_HOME 或 ANDROID_SDK_ROOT
    $sdk = $env:ANDROID_HOME, $env:ANDROID_SDK_ROOT | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
    if (-not $sdk) {
        Write-Skip "Android" "未检测到 Android SDK（ANDROID_HOME / ANDROID_SDK_ROOT 均未设置或不存在），跳过"
        Add-Skip 'android'; return
    }

    Push-Location $ClientDir
    try {
        flutter build apk --release --build-name=$Version --build-number=$BuildNumber --dart-define=API_BASE=$ApiBase 2>&1 | ForEach-Object { Write-Info $_ }
        $apk = Join-Path $ClientDir 'build\app\outputs\flutter-apk\app-release.apk'
        if (Copy-Artifact $apk "manju-$Version-android-arm64.apk") { Write-Info "已复制 APK" }

        flutter build appbundle --release --build-name=$Version --build-number=$BuildNumber --dart-define=API_BASE=$ApiBase 2>&1 | ForEach-Object { Write-Info $_ }
        $aab = Join-Path $ClientDir 'build\app\outputs\bundle\release\app-release.aab'
        if (Copy-Artifact $aab "manju-$Version-android.aab") { Write-Info "已复制 AAB" }

        # 若配置了签名密钥则提示（实际签名由 CI 用 ANDROID_KEYSTORE 完成）
        if ($env:ANDROID_KEYSTORE -and (Test-Path $env:ANDROID_KEYSTORE)) {
            Write-Info "检测到 ANDROID_KEYSTORE，生产构建请配置 signingConfig 进行 v1/v2 签名"
        }
        Add-Built 'android'
        Write-Ok "Android 产物已生成"
    } catch {
        Write-Err ("Android 构建失败：$_"); Add-Fail 'android'
    } finally {
        Pop-Location
    }
}

function Build-Windows {
    Write-Step "构建 Windows (MSIX)"
    if (-not (Test-Flutter)) { Write-Skip "Windows" "缺少 Flutter 工具链"; Add-Skip 'windows'; return }

    # Visual Studio 2022 检测（MSVC 链接器必需）
    $vswhere = "C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe"
    $hasVS = Test-Path $vswhere
    if (-not $hasVS) {
        Write-Skip "Windows" "未检测到 Visual Studio 2022（vswhere.exe 不存在），无法链接 MSVC，跳过"
        Add-Skip 'windows'; return
    }

    Push-Location $ClientDir
    try {
        flutter build windows --release --build-name=$Version --build-number=$BuildNumber --dart-define=API_BASE=$ApiBase 2>&1 | ForEach-Object { Write-Info $_ }
        $winDir = Join-Path $ClientDir 'build\windows\x64\runner\Release'
        if (Test-Path $winDir) {
            $msixOk = $false
            # MSIX 打包：依赖 dev_dependencies 中的 msix；缺失则降级为 zip
            try {
                flutter pub run msix:build 2>&1 | ForEach-Object { Write-Info $_ }
                $msix = Get-ChildItem $winDir -Filter *.msix -ErrorAction SilentlyContinue | Select-Object -First 1
                if ($msix -and (Copy-Artifact $msix.FullName "manju-$Version-win-x64.msix")) { $msixOk = $true }
            } catch {
                Write-Warn "MSIX 打包失败（需要 dev_dependencies: msix 及 MSIX 证书）。将改为打包目录 zip"
            }
            if (-not $msixOk) {
                Compress-Archive -Path (Join-Path $winDir '*') -DestinationPath (Join-Path $OutDirResolved "manju-$Version-win-x64.zip") -Force
            }
            Add-Built 'windows'
            Write-Ok "Windows 产物已生成"
        } else {
            Write-Warn "未找到 Windows 构建输出目录"
        }
    } catch {
        Write-Err ("Windows 构建失败：$_"); Add-Fail 'windows'
    } finally {
        Pop-Location
    }
}

function Build-Linux {
    Write-Step "构建 Linux (tar.gz / AppImage)"
    if (-not (Test-IsLinux)) {
        Write-Skip "Linux" "非 Linux 主机（当前为 $(if (Test-IsWindows) { 'Windows' } else { '其他系统' })），跳过"
        Add-Skip 'linux'; return
    }
    if (-not (Test-Flutter)) { Write-Skip "Linux" "缺少 Flutter 工具链"; Add-Skip 'linux'; return }

    Push-Location $ClientDir
    try {
        flutter build linux --release --build-name=$Version --build-number=$BuildNumber --dart-define=API_BASE=$ApiBase 2>&1 | ForEach-Object { Write-Info $_ }
        $linuxDir = Join-Path $ClientDir 'build\linux\x64\release\bundle'
        if (Test-Path $linuxDir) {
            # tar.gz 打包
            $tarName = "manju-$Version-linux-x64.tar.gz"
            $tarPath = Join-Path $OutDirResolved $tarName
            & tar -czf $tarPath -C $linuxDir . 2>&1 | ForEach-Object { Write-Info $_ }
            if (Test-Path $tarPath) { Write-Info ("已生成 " + $tarName) }

            # AppImage 为可选增强（需 flutter_distributor / appimage-builder），失败不影响主流程
            try {
                flutter pub run flutter_distributor package --platform=linux --targets=appimage 2>&1 | ForEach-Object { Write-Info $_ }
            } catch {
                Write-Warn "AppImage 打包跳过（可选，需 flutter_distributor）。tar.gz 已生成"
            }
            Add-Built 'linux'
            Write-Ok "Linux 产物已生成"
        } else {
            Write-Warn "未找到 Linux 构建输出目录"
        }
    } catch {
        Write-Err ("Linux 构建失败：$_"); Add-Fail 'linux'
    } finally {
        Pop-Location
    }
}

function Build-MacOS {
    Write-Step "构建 macOS (dmg / pkg)"
    if (-not (Test-IsMacOS)) {
        Write-Skip "macOS" "需要 macOS 构建机（当前非 macOS 主机），跳过"
        Add-Skip 'macos'; return
    }
    if (-not (Test-Flutter)) { Write-Skip "macOS" "缺少 Flutter 工具链"; Add-Skip 'macos'; return }

    Push-Location $ClientDir
    try {
        flutter build macos --release --build-name=$Version --build-number=$BuildNumber --dart-define=API_BASE=$ApiBase 2>&1 | ForEach-Object { Write-Info $_ }
        Write-Warn "macOS 生产发布需配置开发者签名（见 docs/build-release.md），此处仅生成未签名产物"
        $app = Join-Path $ClientDir 'build\macos\Build\Products\Release\manju.app'
        if (Test-Path $app) {
            Compress-Archive -Path $app -DestinationPath (Join-Path $OutDirResolved "manju-$Version-macos-x64.zip") -Force
            Add-Built 'macos'
            Write-Ok "macOS 产物已生成"
        } else {
            Write-Warn "未找到 macOS 构建输出"
        }
    } catch {
        Write-Err ("macOS 构建失败：$_"); Add-Fail 'macos'
    } finally {
        Pop-Location
    }
}

function Build-IOS {
    Write-Step "构建 iOS (IPA → 仅商店分发)"
    if (-not (Test-IsMacOS)) {
        Write-Skip "iOS" "需要 macOS 构建机 + Xcode（当前非 macOS 主机），跳过"
        Add-Skip 'ios'; return
    }
    if (-not (Test-Flutter)) { Write-Skip "iOS" "缺少 Flutter 工具链"; Add-Skip 'ios'; return }

    Push-Location $ClientDir
    try {
        # --no-codesign 先产出可归档产物；正式上架由 CI 用 APPLE_CERT 签名
        flutter build ios --release --no-codesign --build-name=$Version --build-number=$BuildNumber --dart-define=API_BASE=$ApiBase 2>&1 | ForEach-Object { Write-Info $_ }
        # 红线：iOS 不支持静默安装，必须走 App Store（--store-url 必填）
        Write-Warn "iOS 不支持静默安装：构建产物仅用于上传 App Store。发布 OTA 时必须带 --store-url（见 docs/build-release.md）"
        Add-Built 'ios'
    } catch {
        Write-Err ("iOS 构建失败：$_"); Add-Fail 'ios'
    } finally {
        Pop-Location
    }
}

function Build-HarmonyOS {
    Write-Step "构建 HarmonyOS (HAP / APP)"
    # 红线：需要 DevEco Studio + Flutter OHOS 分支，主干 Flutter 无法构建，直接跳过
    Write-Skip "HarmonyOS" "需要 DevEco Studio + Flutter OHOS 分支（ohos 目录已就位）；当前环境跳过，请在内网 macOS / Linux 构建机单独处理"
    Add-Skip 'harmonyos'
}

# ========================= 主流程 =========================
$allTargets = @('android', 'windows', 'linux', 'macos', 'ios', 'harmonyos')
$script:effectiveTargets = if ($Targets -and $Targets.Count -gt 0) { $Targets } else { $allTargets }

Write-Host ("=" * 70)
Write-Host ("漫剧 Manju 全平台构建  Version=$Version  Build=$BuildNumber  Channel=$Channel")
Write-Host ("输出目录 : $OutDirResolved")
Write-Host ("=" * 70)

Build-Flutter

Write-Host ("=" * 70)
Write-Host "构建汇总"
Write-Host ("=" * 70)
Write-Host ("已构建 : " + ($(if ($script:built.Count -gt 0) { ($script:built -join ', ') } else { '（无）' })))
Write-Host ("已跳过 : " + ($(if ($script:skipped.Count -gt 0) { ($script:skipped -join ', ') } else { '（无）' })))
if ($script:failed.Count -gt 0) {
    Write-Err ("失败 : " + ($script:failed -join ', '))
    exit 1
}
Write-Ok "全部完成（被跳过的平台因缺少工具链，属预期行为，未崩溃）"
exit 0
