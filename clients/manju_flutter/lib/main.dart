/// 入口。
///
/// 分环境启动示例：
/// ```bash
/// flutter run --dart-define=MANJU_API_BASE=https://api.example.com \
///             --dart-define=MANJU_CHANNEL=stable
/// ```
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'core/updater/update_downloader.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // 清掉上次更新残留的临时安装包，避免占满磁盘
  await UpdateDownloader.purgeOldPackages();

  runApp(const ProviderScope(child: ManjuApp()));
}
