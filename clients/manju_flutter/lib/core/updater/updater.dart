/// OTA 更新门面：把「检查 → 下载 → 校验 → 安装」串成一条完整链路。
///
/// 平台分发规则（**核心，不可违背**）：
///
/// | 平台        | 行为 |
/// |------------|------|
/// | Windows/macOS/Linux | 下载 → SHA256+Ed25519 校验 → 拉起系统安装器 → 退出应用重启 |
/// | Android    | 校验后调 `PackageInstaller`，需用户已授予"未知来源"权限 |
/// | iOS        | **禁止下载安装**，只能跳转 App Store |
/// | HarmonyOS  | **禁止下载安装**，只能跳转华为应用市场 |
///
/// 后两者由 [StoreUpdater] 处理，本类会在安装前再次拦截，
/// 即使服务端错误地下发了产物也不会执行安装。
library;

import 'dart:io';

import 'package:package_info_plus/package_info_plus.dart';

import '../device/device_info.dart';
import 'models/ota_release.dart';
import 'platform/android_updater.dart';
import 'platform/desktop_updater.dart';
import 'platform/store_updater.dart';
import 'update_client.dart';
import 'update_downloader.dart';
import 'verifier.dart';

/// 更新流程状态。
enum UpdatePhase {
  idle,
  checking,
  available,
  downloading,
  verifying,
  installing,

  /// 安装器已拉起，等待应用重启。
  waitingRestart,

  /// 已跳转商店，等待用户完成升级。
  waitingStore,
  done,
  failed,

  /// 平台不支持自安装，需要引导去商店。
  storeOnly,
}

/// 更新进度快照，供 UI 渲染。
class UpdateProgress {
  const UpdateProgress({
    required this.phase,
    this.ratio = 0,
    this.message,
    this.release,
    this.error,
  });

  final UpdatePhase phase;

  /// 下载进度 0~1，仅 downloading 阶段有效。
  final double ratio;
  final String? message;
  final OtaRelease? release;
  final String? error;

  UpdateProgress copyWith({
    UpdatePhase? phase,
    double? ratio,
    String? message,
    OtaRelease? release,
    String? error,
  }) =>
      UpdateProgress(
        phase: phase ?? this.phase,
        ratio: ratio ?? this.ratio,
        message: message ?? this.message,
        release: release ?? this.release,
        error: error ?? this.error,
      );
}

/// 更新门面。
class Updater {
  Updater({
    UpdateClient? client,
    UpdateDownloader? downloader,
    UpdateVerifier? verifier,
    OtaChannel channel = OtaChannel.stable,
  })  : _client = client,
        _downloader = downloader ?? UpdateDownloader(),
        _verifier = verifier ?? const UpdateVerifier(),
        _channel = channel;

  UpdateClient? _client;
  final UpdateDownloader _downloader;
  final UpdateVerifier _verifier;
  final OtaChannel _channel;

  /// 服务端地址，需在 App 启动时注入。
  String baseUrl = 'http://localhost:8000';

  UpdateClient get client => _client ??= UpdateClient(baseUrl: baseUrl);

  // ==================================================================
  // 检查更新
  // ==================================================================

  /// 检查是否有新版本。
  ///
  /// 返回 [OtaCheckOutcome]，调用方根据 `status` 决定 UI 行为。
  Future<OtaCheckOutcome> checkForUpdate() async {
    final info = await PackageInfo.fromPlatform();
    final platform = currentOtaPlatform;
    final arch = await currentOtaArch();
    final deviceId = await getOrCreateDeviceId();

    final build = int.tryParse(info.buildNumber) ?? 0;

    return client.check(
      platform: platform,
      arch: arch,
      channel: _channel,
      version: info.version,
      build: build,
      deviceId: deviceId,
      locale: currentLocaleName(),
    );
  }

  // ==================================================================
  // 完整更新流程
  // ==================================================================

  /// 下载并安装，通过回调推送进度。
  ///
  /// [result] 为 [checkForUpdate] 的返回值。
  /// 返回 true 表示"安装器已成功拉起"或"已跳转商店"；
  /// 返回 false 需检查 [UpdateProgress.error]。
  Future<bool> downloadAndInstall(
    OtaCheckResult result, {
    required void Function(UpdateProgress progress) onProgress,
  }) async {
    final release = result.release;
    final platform = currentOtaPlatform;

    // ---- 红线拦截：iOS / HarmonyOS 绝不允许走下载安装 ----
    if (!platform.canSelfInstall) {
      final url = result.storeFallback?.url ?? '';
      onProgress(UpdateProgress(
        phase: UpdatePhase.storeOnly,
        message: _storeOnlyMessage(platform),
        release: release,
      ));

      await _report(OtaReportEvent.unsupported, result,
          reason: 'platform_restricted');

      if (url.isNotEmpty) {
        final storeResult = await StoreUpdater(platform).launch(url);
        onProgress(UpdateProgress(
          phase: storeResult.ok ? UpdatePhase.waitingStore : UpdatePhase.failed,
          message: storeResult.message,
          release: release,
        ));
        return storeResult.ok;
      }
      onProgress(UpdateProgress(
        phase: UpdatePhase.failed,
        error: '服务端未下发商店地址，无法引导升级',
        release: release,
      ));
      return false;
    }

    if (release == null) {
      onProgress(const UpdateProgress(
        phase: UpdatePhase.failed,
        error: '未包含版本信息',
      ));
      return false;
    }

    final artifact = release.artifact;
    final sw = Stopwatch()..start();

    // ---- 1. 下载 ----
    onProgress(UpdateProgress(
      phase: UpdatePhase.downloading,
      release: release,
      message: '正在下载更新包',
    ));

    final dl = await _downloader.download(
      artifact,
      onProgress: (p) => onProgress(UpdateProgress(
        phase: UpdatePhase.downloading,
        ratio: p.ratio,
        release: release,
      )),
    );

    if (!dl.ok || dl.file == null) {
      onProgress(UpdateProgress(
        phase: UpdatePhase.failed,
        error: dl.error ?? '下载失败',
        release: release,
      ));
      await _report(OtaReportEvent.failed, result, reason: 'download_failed');
      return false;
    }

    final file = dl.file!;
    await _report(OtaReportEvent.downloaded, result,
        elapsedMs: sw.elapsedMilliseconds);

    // ---- 2. 校验（生命线）----
    onProgress(UpdateProgress(
      phase: UpdatePhase.verifying,
      ratio: 1,
      release: release,
      message: '正在校验安装包',
    ));

    final verify = await _verifier.verify(file, artifact);
    if (!verify.ok) {
      // 校验失败必须删除文件，绝不能留下未验证的可执行文件
      if (await file.exists()) await file.delete();

      onProgress(UpdateProgress(
        phase: UpdatePhase.failed,
        release: release,
        error: verify.detail ?? verify.reason?.value ?? '校验失败',
      ));
      await _report(OtaReportEvent.failed, result,
          reason: verify.reason?.value ?? 'verify_failed');
      return false;
    }

    // ---- 3. 安装 ----
    onProgress(UpdateProgress(
      phase: UpdatePhase.installing,
      ratio: 1,
      release: release,
      message: '正在安装',
    ));

    final installed = await _install(platform, artifact, file);

    if (installed) {
      await _report(OtaReportEvent.installed, result,
          elapsedMs: sw.elapsedMilliseconds);
      onProgress(UpdateProgress(
        phase: UpdatePhase.waitingRestart,
        ratio: 1,
        release: release,
        message: '安装完成，即将重启应用',
      ));
      return true;
    }

    onProgress(UpdateProgress(
      phase: UpdatePhase.failed,
      release: release,
      error: '拉起安装器失败',
    ));
    await _report(OtaReportEvent.failed, result, reason: 'install_failed');
    return false;
  }

  /// 按平台分发安装。
  Future<bool> _install(
      OtaPlatform platform, OtaArtifact artifact, File file) async {
    switch (platform) {
      case OtaPlatform.android:
        final updater = AndroidUpdater();
        final cap = await updater.checkCapability();
        if (!cap.canInstall) {
          // 引导用户去设置页授权，授权完成后需用户再次触发安装
          await updater.requestInstallPermission();
          return false;
        }
        return updater.installApk(file);

      case OtaPlatform.windows:
      case OtaPlatform.macos:
      case OtaPlatform.linux:
        final r = await DesktopUpdater(platform).install(artifact, file);
        return r.ok;

      case OtaPlatform.ios:
      case OtaPlatform.harmonyos:
        // 理论上到不了这里（已在 downloadAndInstall 开头拦截）
        return false;
    }
  }

  /// 跳过本次更新并上报。
  Future<void> skip(OtaCheckResult result) =>
      _report(OtaReportEvent.skipped, result);

  Future<void> _report(
    OtaReportEvent event,
    OtaCheckResult result, {
    String? reason,
    int? elapsedMs,
  }) async {
    final info = await PackageInfo.fromPlatform();
    final deviceId = await getOrCreateDeviceId();
    await client.report(
      deviceId: deviceId,
      platform: currentOtaPlatform,
      version: info.version,
      build: int.tryParse(info.buildNumber) ?? 0,
      event: event,
      reason: reason,
      elapsedMs: elapsedMs,
    );
  }

  String _storeOnlyMessage(OtaPlatform platform) => switch (platform) {
        OtaPlatform.ios =>
          'iOS 不支持应用内自动安装，即将前往 App Store 完成升级',
        OtaPlatform.harmonyos =>
          '鸿蒙不支持应用内自动安装，即将前往华为应用市场完成升级',
        _ => '当前平台需通过应用商店升级',
      };
}
