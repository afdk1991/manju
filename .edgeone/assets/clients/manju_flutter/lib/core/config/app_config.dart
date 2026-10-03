/// 应用配置与全局依赖注入。
///
/// 后端地址等敏感/环境相关配置通过 `--dart-define` 注入，避免硬编码：
/// ```bash
/// flutter run --dart-define=MANJU_API_BASE=https://api.example.com \
///             --dart-define=MANJU_CHANNEL=stable \
///             --dart-define=MANJU_PLATFORM=harmonyos   # 仅鸿蒙端需要
/// ```
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api/content_api.dart';
import '../updater/models/ota_release.dart';
import '../updater/updater.dart';

/// 应用配置。
class AppConfig {
  const AppConfig({
    required this.apiBase,
    required this.channel,
  });

  /// 内容中台 + OTA 服务地址。
  final String apiBase;

  /// 发布通道：stable / beta / nightly
  final OtaChannel channel;

  /// 从编译期常量读取，便于 CI 分环境打包。
  factory AppConfig.fromEnvironment() => AppConfig(
        apiBase: const String.fromEnvironment(
          'MANJU_API_BASE',
          defaultValue: 'http://localhost:8000',
        ),
        channel: OtaChannel.values.firstWhere(
          (c) =>
              c.value ==
              const String.fromEnvironment(
                'MANJU_CHANNEL',
                defaultValue: 'stable',
              ),
          orElse: () => OtaChannel.stable,
        ),
      );
}

/// 全局配置。
final appConfigProvider = Provider<AppConfig>((ref) => AppConfig.fromEnvironment());

/// 内容 API。
final contentApiProvider = Provider<ContentApi>((ref) {
  final cfg = ref.watch(appConfigProvider);
  return ContentApi(baseUrl: cfg.apiBase);
});

/// 更新器。
final updaterProvider = Provider<Updater>((ref) {
  final cfg = ref.watch(appConfigProvider);
  final updater = Updater(channel: cfg.channel);
  updater.baseUrl = cfg.apiBase;
  return updater;
});
