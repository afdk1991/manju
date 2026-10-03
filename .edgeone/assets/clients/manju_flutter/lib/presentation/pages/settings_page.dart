/// 设置页：版本信息、手动检查更新、平台能力说明。
library;

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../../core/config/app_config.dart';
import '../../core/device/device_info.dart';
import '../../core/updater/models/ota_release.dart';
import '../../core/updater/update_client.dart';
import '../widgets/update_dialog.dart';

/// 设置页。
class SettingsPage extends ConsumerStatefulWidget {
  const SettingsPage({super.key});

  @override
  ConsumerState<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends ConsumerState<SettingsPage> {
  PackageInfo? _info;
  bool _checking = false;

  @override
  void initState() {
    super.initState();
    _loadInfo();
  }

  Future<void> _loadInfo() async {
    final info = await PackageInfo.fromPlatform();
    if (!mounted) return;
    setState(() => _info = info);
  }

  Future<void> _checkUpdate() async {
    if (_checking) return;
    setState(() => _checking = true);
    try {
      final updater = ref.read(updaterProvider);
      final outcome = await updater.checkForUpdate();
      if (!mounted) return;

      if (outcome.status == OtaCheckStatus.upToDate) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('当前已是最新版本')),
        );
        return;
      }
      if (outcome.status == OtaCheckStatus.error) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('检查失败：${outcome.message ?? outcome.errorCode}')),
        );
        return;
      }

      final result = outcome.result;
      if (result == null) return;
      await showUpdateDialog(
        context,
        result: result,
        updater: updater,
        forced: result.policy == UpdatePolicy.forced,
      );
    } finally {
      if (mounted) setState(() => _checking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final platform = currentOtaPlatform;
    final cfg = ref.watch(appConfigProvider);
    final info = _info;

    return Scaffold(
      appBar: AppBar(title: const Text('设置')),
      body: ListView(
        children: [
          // 版本
          ListTile(
            leading: const Icon(Icons.info_outline),
            title: const Text('当前版本'),
            subtitle: Text(info == null
                ? '读取中…'
                : '${info.version} (build ${info.buildNumber})'),
          ),

          // 手动检查更新
          ListTile(
            leading: const Icon(Icons.system_update_alt),
            title: const Text('检查更新'),
            subtitle: Text(_checking ? '正在检查…' : '通道：${cfg.channel.value}'),
            trailing: _checking
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.chevron_right),
            onTap: _checkUpdate,
          ),

          const Divider(),

          // 平台与更新能力
          ListTile(
            leading: const Icon(Icons.devices),
            title: const Text('运行平台'),
            subtitle: Text('${platform.value}  ·  ${Platform.operatingSystemVersion}'),
          ),
          ListTile(
            leading: Icon(
              platform.canSelfInstall
                  ? Icons.check_circle_outline
                  : Icons.info_outline,
              color: platform.canSelfInstall ? Colors.green : Colors.orange,
            ),
            title: const Text('自动安装能力'),
            subtitle: Text(_capabilityText(platform)),
          ),

          const Divider(),

          ListTile(
            leading: const Icon(Icons.dns_outlined),
            title: const Text('服务地址'),
            subtitle: Text(cfg.apiBase),
          ),
        ],
      ),
    );
  }

  /// 用大白话告诉用户这个平台能不能自动装。
  String _capabilityText(OtaPlatform p) => switch (p) {
        OtaPlatform.windows =>
          '支持：下载后自动安装（MSIX 免管理员权限）',
        OtaPlatform.macos => '支持：下载后自动安装，需应用已签名',
        OtaPlatform.linux => '支持：AppImage 自替换，或 deb/rpm 需授权',
        OtaPlatform.android =>
          '有条件支持：需先授予"允许安装未知来源应用"',
        OtaPlatform.ios =>
          '不支持静默安装：Apple 限制，将跳转 App Store 完成升级',
        OtaPlatform.harmonyos =>
          '不支持静默安装：鸿蒙限制，将跳转华为应用市场完成升级',
      };
}
