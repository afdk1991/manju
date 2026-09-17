/// 商店跳转安装器：iOS / HarmonyOS。
///
/// ## 为什么这两个平台不能自动安装
///
/// - **iOS**：Apple 明令禁止应用自行下载并安装可执行文件（侧载）。
///   任何绕过 App Store 的静默安装都会导致应用下架、开发者账号封禁。
///   TestFlight / 企业分发同样需要用户在系统弹窗中确认。
///
/// - **HarmonyOS**：鸿蒙没有向第三方应用开放静默安装 API。
///   唯一合规的分发路径是华为应用市场，或企业场景下的 MDM 设备管理器下发。
///
/// 因此这两个端的"自动更新"正确实现是：
/// **检测更新 → 展示说明 → 用户确认 → 跳转商店 → 上报 `unsupported` 事件**。
/// 服务端对这两个平台会强制在响应里带上 `store_fallback`，
/// 客户端**必须**走本文件的跳转分支，不得尝试下载安装。
library;

import 'package:url_launcher/url_launcher.dart';

import '../models/ota_release.dart';

/// 商店跳转结果。
class StoreLaunchResult {
  const StoreLaunchResult._({required this.ok, this.message});

  final bool ok;
  final String? message;

  static const StoreLaunchResult success = StoreLaunchResult._(ok: true);
}

/// 商店跳转安装器。
class StoreUpdater {
  StoreUpdater(this.platform);

  final OtaPlatform platform;

  /// 确认当前平台确实只能走商店。
  bool get isStoreOnlyPlatform =>
      platform == OtaPlatform.ios || platform == OtaPlatform.harmonyos;

  /// 跳转到商店。
  ///
  /// [url] 来自服务端下发的 `store_fallback.url`。
  Future<StoreLaunchResult> launch(String url) async {
    if (!isStoreOnlyPlatform) {
      return const StoreLaunchResult._(
        ok: false,
        message: '当前平台支持静默安装，不应走商店跳转',
      );
    }
    if (url.isEmpty) {
      return const StoreLaunchResult._(
        ok: false,
        message: '服务端未下发 store_fallback.url，无法跳转',
      );
    }

    final uri = Uri.tryParse(url);
    if (uri == null) {
      return StoreLaunchResult._(ok: false, message: '商店地址非法：$url');
    }

    try {
      // externalApplication 确保跳到 App Store / 应用市场 App，
      // 而不是在 App 内部 WebView 打开。
      final can = await canLaunchUrl(uri);
      if (!can) {
        return StoreLaunchResult._(ok: false, message: '无法打开商店地址：$url');
      }
      final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
      return ok
          ? StoreLaunchResult.success
          : const StoreLaunchResult._(ok: false, message: '跳转商店失败');
    } catch (e) {
      return StoreLaunchResult._(ok: false, message: '跳转商店异常：$e');
    }
  }

  /// 两个平台各自的商店地址兜底（服务端没给时用）。
  String fallbackStoreUrlFor({
    required String appleAppId,
    required String harmonyAppId,
  }) {
    return switch (platform) {
      OtaPlatform.ios => 'https://apps.apple.com/app/id$appleAppId',
      OtaPlatform.harmonyos =>
        'https://appgallery.huawei.com/app/detail?id=$harmonyAppId',
      _ => '',
    };
  }
}
