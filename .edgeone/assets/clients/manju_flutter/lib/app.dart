/// 应用根组件：路由 + 启动时自动检查更新。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'core/config/app_config.dart';
import 'core/updater/models/ota_release.dart';
import 'core/updater/update_client.dart';
import 'presentation/pages/detail_page.dart';
import 'presentation/pages/home_page.dart';
import 'presentation/pages/player_page.dart';
import 'presentation/pages/search_page.dart';
import 'presentation/pages/settings_page.dart';
import 'presentation/widgets/update_dialog.dart';

/// 应用根组件。
class ManjuApp extends ConsumerStatefulWidget {
  const ManjuApp({super.key});

  @override
  ConsumerState<ManjuApp> createState() => _ManjuAppState();
}

class _ManjuAppState extends ConsumerState<ManjuApp> {
  @override
  void initState() {
    super.initState();
    // 首帧渲染完成后再检查更新，避免弹窗抢在页面构建前弹出导致 context 异常
    WidgetsBinding.instance.addPostFrameCallback((_) => _checkUpdate());
  }

  /// 启动时静默检查更新。
  ///
  /// - silent 策略：直接后台下载安装，不打扰用户（仅桌面端）
  /// - forced / suggest：弹窗提示
  Future<void> _checkUpdate() async {
    if (!mounted) return;
    final updater = ref.read(updaterProvider);

    try {
      final outcome = await updater.checkForUpdate();
      if (!mounted) return;
      if (outcome.status != OtaCheckStatus.available) return;

      final result = outcome.result;
      if (result == null) return;

      final forced = result.policy == UpdatePolicy.forced;

      // silent 且平台支持自安装 → 直接装，不弹窗
      if (result.policy == UpdatePolicy.silent) {
        await updater.downloadAndInstall(
          result,
          onProgress: (_) {}, // 静默模式不展示进度
        );
        return;
      }

      await showUpdateDialog(
        context,
        result: result,
        updater: updater,
        forced: forced,
      );
    } catch (_) {
      // 更新检查失败不应影响正常使用，静默吞掉
    }
  }

  @override
  Widget build(BuildContext context) {
    final router = GoRouter(
      initialLocation: '/',
      routes: [
        GoRoute(
          path: '/',
          builder: (context, state) => const HomePage(),
        ),
        GoRoute(
          path: '/series/:id',
          builder: (context, state) =>
              DetailPage(seriesId: state.pathParameters['id'] ?? ''),
        ),
        GoRoute(
          path: '/player/:id',
          builder: (context, state) =>
              PlayerPage(episodeId: state.pathParameters['id'] ?? ''),
        ),
        GoRoute(
          path: '/search',
          builder: (context, state) =>
              SearchPage(keyword: state.uri.queryParameters['q'] ?? ''),
        ),
        GoRoute(
          path: '/settings',
          builder: (context, state) => const SettingsPage(),
        ),
      ],
      errorBuilder: (context, state) => Scaffold(
        body: Center(child: Text('页面不存在：${state.uri}')),
      ),
    );

    final theme = ThemeData(
      useMaterial3: true,
      colorSchemeSeed: const Color(0xFF6C4CF1),
      brightness: Brightness.light,
    );

    return MaterialApp.router(
      title: '漫剧 Manju',
      theme: theme,
      darkTheme: ThemeData(
        useMaterial3: true,
        colorSchemeSeed: const Color(0xFF6C4CF1),
        brightness: Brightness.dark,
      ),
      routerConfig: router,
      debugShowCheckedModeBanner: false,
    );
  }
}
