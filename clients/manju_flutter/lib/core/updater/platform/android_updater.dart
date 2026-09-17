/// Android 端安装器。
///
/// Android **可以**自动安装 APK，但有两个前置条件（缺一不可）：
///
/// 1. 在 `AndroidManifest.xml` 声明
///    `<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />`
/// 2. 用户首次安装时授予"允许来自此来源的应用"（`canRequestPackageInstalls`）。
///    未授权时必须引导用户去设置页打开，否则 `PackageInstaller` 会静默失败。
///
/// 因此 Android 属于"**有条件**的自动更新"，不能等同于桌面端的静默安装。
library;

import 'dart:io';

import 'package:flutter/services.dart';

/// 与原生侧（Kotlin `UpdaterPlugin.kt`）约定的通道名与方法名。
const String kAndroidUpdaterChannel = 'com.manju/updater';

/// Android 更新能力预检结果。
class AndroidInstallCapability {
  const AndroidInstallCapability({
    required this.canInstall,
    this.reason,
  });

  final bool canInstall;
  final String? reason;
}

/// Android 端安装器。
class AndroidUpdater {
  AndroidUpdater();

  static const MethodChannel _channel = MethodChannel(kAndroidUpdaterChannel);

  /// 询问系统：本应用当前是否被允许安装未知来源 APK。
  Future<AndroidInstallCapability> checkCapability() async {
    if (!Platform.isAndroid) {
      return const AndroidInstallCapability(
        canInstall: false,
        reason: '非 Android 平台',
      );
    }
    try {
      final granted = await _channel.invokeMethod<bool>('canInstallPackages');
      if (granted == true) {
        return const AndroidInstallCapability(canInstall: true);
      }
      return const AndroidInstallCapability(
        canInstall: false,
        reason: '用户尚未授予"允许安装未知来源应用"权限',
      );
    } on PlatformException catch (e) {
      return AndroidInstallCapability(
        canInstall: false,
        reason: '查询安装权限失败：${e.message}',
      );
    }
  }

  /// 打开系统设置页，让用户授予安装权限。
  Future<bool> requestInstallPermission() async {
    try {
      final ok = await _channel.invokeMethod<bool>('openInstallPermissionSettings');
      return ok == true;
    } on PlatformException {
      return false;
    }
  }

  /// 调起系统安装界面。
  ///
  /// 走到这里说明 [artifact] 已通过 SHA256 + Ed25519 校验。
  /// Android 8.0+ 必须通过 `PackageInstaller` 会话安装，
  /// 直接发 `ACTION_VIEW` 隐式 intent 已被废弃且在部分 ROM 上被拦截。
  Future<bool> installApk(File file) async {
    try {
      final ok = await _channel.invokeMethod<bool>('installApk', {
        'path': file.path,
      });
      return ok == true;
    } on PlatformException catch (e) {
      throw AndroidInstallException(e.message ?? '调起安装器失败');
    }
  }

  /// 便捷方法：预检 → 未授权则跳设置 → 已授权则安装。
  Future<bool> installWithGuard(File file) async {
    final cap = await checkCapability();
    if (!cap.canInstall) {
      await requestInstallPermission();
      // 授权是异步的用户操作，这里无法立即得知结果，交给调用方在
      // 页面 resumed 后重新调用本方法。
      return false;
    }
    return installApk(file);
  }
}

/// Android 安装异常。
class AndroidInstallException implements Exception {
  AndroidInstallException(this.message);
  final String message;

  @override
  String toString() => 'AndroidInstallException: $message';
}
