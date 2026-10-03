/// 更新弹窗。
///
/// 根据平台能力展示不同形态，**这一点很关键**：
///
/// | 平台 | 按钮形态 |
/// |---|---|
/// | Windows / macOS / Linux | 「立即更新」→ 下载进度 → 自动安装并重启 |
/// | Android | 「立即更新」→ 未授权时先跳设置页授权 |
/// | iOS | 「前往 App Store」 |
/// | HarmonyOS | 「前往应用市场」 |
///
/// iOS / HarmonyOS 上**绝不能**出现"更新中/下载中"这类暗示自动安装的文案。
library;

import 'package:flutter/material.dart';

import '../../core/device/device_info.dart';
import '../../core/updater/models/ota_release.dart';
import '../../core/updater/updater.dart';

/// 展示更新弹窗。
Future<void> showUpdateDialog(
  BuildContext context, {
  required OtaCheckResult result,
  required Updater updater,
  required bool forced,
}) {
  return showDialog<void>(
    context: context,
    // forced 时禁止点击遮罩关闭
    barrierDismissible: !forced,
    builder: (_) => UpdateDialog(
      result: result,
      updater: updater,
      forced: forced,
    ),
  );
}

/// 更新弹窗。
class UpdateDialog extends StatefulWidget {
  const UpdateDialog({
    super.key,
    required this.result,
    required this.updater,
    required this.forced,
  });

  final OtaCheckResult result;
  final Updater updater;
  final bool forced;

  @override
  State<UpdateDialog> createState() => _UpdateDialogState();
}

class _UpdateDialogState extends State<UpdateDialog> {
  UpdateProgress _progress = const UpdateProgress(phase: UpdatePhase.available);
  bool _busy = false;

  OtaPlatform get _platform => currentOtaPlatform;
  OtaRelease? get _release => widget.result.release;

  String get _notes {
    final r = _release;
    if (r == null) return '';
    return r.notesFor(currentLocaleName());
  }

  Future<void> _start() async {
    if (_busy) return;
    setState(() => _busy = true);

    await widget.updater.downloadAndInstall(
      widget.result,
      onProgress: (p) {
        if (!mounted) return;
        setState(() => _progress = p);
      },
    );
  }

  void _skip() {
    if (widget.forced) return; // 强制更新不允许跳过
    widget.updater.skip(widget.result);
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final phase = _progress.phase;
    final inProgress = phase == UpdatePhase.downloading ||
        phase == UpdatePhase.verifying ||
        phase == UpdatePhase.installing;

    return PopScope(
      // 下载/安装中不允许返回键取消，避免半途中断留下损坏文件
      canPop: !inProgress && !widget.forced,
      child: AlertDialog(
        title: _buildTitle(phase),
        content: _buildContent(phase),
        actions: _buildActions(phase),
      ),
    );
  }

  Widget _buildTitle(UpdatePhase phase) {
    final text = switch (phase) {
      UpdatePhase.failed => '更新失败',
      UpdatePhase.waitingStore => '请在商店完成更新',
      UpdatePhase.storeOnly => '发现新版本',
      _ => '发现新版本 ${_release?.version ?? ''}',
    };
    return Text(text);
  }

  Widget _buildContent(UpdatePhase phase) {
    // 失败态
    if (phase == UpdatePhase.failed) {
      return Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.error_outline, color: Colors.red, size: 40),
          const SizedBox(height: 12),
          Text(_progress.error ?? '未知错误'),
        ],
      );
    }

    // 跳转商店后的等待态
    if (phase == UpdatePhase.waitingStore) {
      return const Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.open_in_new, size: 40),
          SizedBox(height: 12),
          Text('已打开应用商店，请在商店中完成更新后重新打开本应用。'),
        ],
      );
    }

    // 下载中：进度条
    if (phase == UpdatePhase.downloading) {
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          LinearProgressIndicator(value: _progress.ratio),
          const SizedBox(height: 12),
          Text('下载中 ${(_progress.ratio * 100).toStringAsFixed(0)}%'),
        ],
      );
    }

    if (phase == UpdatePhase.verifying) {
      return const Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          LinearProgressIndicator(),
          SizedBox(height: 12),
          Text('正在校验安装包…'),
        ],
      );
    }

    if (phase == UpdatePhase.installing) {
      return const Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          LinearProgressIndicator(),
          SizedBox(height: 12),
          Text('正在安装…'),
        ],
      );
    }

    // 默认：更新说明
    return SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '当前版本 → ${_release?.version ?? ''}',
            style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
          ),
          const SizedBox(height: 8),
          if (_notes.isNotEmpty)
            Text(_notes, style: const TextStyle(height: 1.5))
          else
            const Text('本次更新包含问题修复与体验优化。'),
          // iOS / 鸿蒙明确告知用户将跳转商店
          if (!_platform.canSelfInstall) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: Colors.orange.shade50,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  Icon(Icons.info_outline,
                      size: 18, color: Colors.orange.shade800),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      _platform == OtaPlatform.ios
                          ? '受 iOS 平台限制，应用无法自行安装更新，需前往 App Store。'
                          : '受鸿蒙平台限制，应用无法自行安装更新，需前往华为应用市场。',
                      style: TextStyle(
                          fontSize: 12, color: Colors.orange.shade900),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  List<Widget> _buildActions(UpdatePhase phase) {
    // 进行中：不提供任何按钮
    if (phase == UpdatePhase.downloading ||
        phase == UpdatePhase.verifying ||
        phase == UpdatePhase.installing) {
      return const [];
    }

    // 失败态：重试 + 关闭
    if (phase == UpdatePhase.failed) {
      return [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('关闭'),
        ),
        FilledButton(
          onPressed: _start,
          child: const Text('重试'),
        ),
      ];
    }

    // 已跳转商店
    if (phase == UpdatePhase.waitingStore) {
      return [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('我知道了'),
        ),
      ];
    }

    final isStoreOnly = !_platform.canSelfInstall;

    return [
      // 强制更新时不给"稍后"
      if (!widget.forced)
        TextButton(
          onPressed: _skip,
          child: const Text('稍后再说'),
        ),
      FilledButton(
        onPressed: _start,
        child: Text(isStoreOnly
            ? (_platform == OtaPlatform.ios ? '前往 App Store' : '前往应用市场')
            : '立即更新'),
      ),
    ];
  }
}
