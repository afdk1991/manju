/// 桌面端安装器：Windows / macOS / Linux。
///
/// 这三个平台是**唯一能真正做到"下载后自动安装"**的：
/// 应用自身拥有文件系统写权限，可以拉起系统安装器并重启。
///
/// 各端差异：
/// - Windows：MSIX 走 PowerShell `Add-AppxPackage`；EXE/安装包走 `/VERYSILENT`
/// - macOS：`.dmg` 需挂载后拷贝替换；`.pkg` 走 `installer`（可能需要管理员密码）
/// - Linux：AppImage 自替换；`.deb`/`.rpm` 走 pkexec 包管理器；tar.gz 解压覆盖
library;

import 'dart:io';

import '../../../core/updater/models/ota_release.dart';

/// 安装结果。
class InstallResult {
  const InstallResult._({required this.ok, this.message, this.needRestart = false});

  final bool ok;
  final String? message;

  /// true 表示安装器已拉起，应用应立即退出以便完成替换。
  final bool needRestart;

  static const InstallResult success = InstallResult._(ok: true);
}

/// 桌面端安装器。
class DesktopUpdater {
  DesktopUpdater(this.platform);

  final OtaPlatform platform;

  /// 执行安装。
  Future<InstallResult> install(OtaArtifact artifact, File file) async {
    return switch (platform) {
      OtaPlatform.windows => _installWindows(artifact, file),
      OtaPlatform.macos => _installMacOS(artifact, file),
      OtaPlatform.linux => _installLinux(artifact, file),
      _ => Future.value(const InstallResult._(
          ok: false,
          message: '当前平台不是桌面端，不应走自动安装流程',
        )),
    };
  }

  // ------------------------------------------------------------------
  // Windows
  // ------------------------------------------------------------------
  Future<InstallResult> _installWindows(OtaArtifact artifact, File file) async {
    final type = artifact.type.toLowerCase();

    if (type == 'msix' || type == 'appx') {
      // MSIX：由 Windows 应用包管理器接管，无需管理员权限，
      // 且不会残留卸载项，是 Windows 端最干净的自更新方式。
      final args = [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Add-AppxPackage -Path "${file.path}" -ForceApplicationShutdown',
      ];
      final r = await Process.run('powershell', args, runInShell: false);
      if (r.exitCode == 0) {
        return const InstallResult._(ok: true, needRestart: true);
      }
      return InstallResult._(
        ok: false,
        message: 'MSIX 安装失败(${r.exitCode})：${r.stderr}',
      );
    }

    if (type == 'exe' || type == 'msi') {
      // 传统安装包：依赖 Inno Setup / NSIS 的静默参数。
      // 生产环境需确保打包脚本开启了静默安装支持。
      final args = <String>[
        ...artifact.installArgs,
        if (artifact.installArgs.isEmpty) ...[
          if (type == 'msi') '/qn' else '/VERYSILENT',
          '/NORESTART',
          '/SUPPRESSMSGBOXES',
        ],
      ];
      // detach 模式启动，让安装器在本进程退出后继续跑完
      final started = await Process.start(
        file.path,
        args,
        mode: ProcessStartMode.detached,
      );
      return InstallResult._(ok: true, needRestart: true, message: 'pid:${started.pid}');
    }

    if (type == 'zip' || type == 'tar_gz') {
      // 免安装包：解压后覆盖自身目录。
      // 注意 Windows 上正在运行的文件被占用，需要用"启动器 + 版本号目录"策略：
      // 解压到 <安装目录>/app-<version>/，再由启动器指向新目录。
      return const InstallResult._(
        ok: false,
        message: '绿色版自更新需配合启动器实现，请参考 docs/ota-integration.md',
      );
    }

    return InstallResult._(ok: false, message: 'Windows 不支持的产物类型：$type');
  }

  // ------------------------------------------------------------------
  // macOS
  // ------------------------------------------------------------------
  Future<InstallResult> _installMacOS(OtaArtifact artifact, File file) async {
    final type = artifact.type.toLowerCase();

    if (type == 'pkg') {
      // .pkg 安装通常需要管理员权限，pkexec 在 macOS 上不存在，
      // 这里直接用 installer；若权限不足会失败，UI 应提示用户手动安装。
      final r = await Process.run('installer', ['-pkg', file.path, '-target', '/']);
      if (r.exitCode == 0) {
        return const InstallResult._(ok: true, needRestart: true);
      }
      return InstallResult._(
        ok: false,
        message: 'pkg 安装失败(${r.exitCode})：${r.stderr}',
      );
    }

    if (type == 'dmg') {
      // .dmg 需要：挂载 → 把 .app 拷到 /Applications → 卸载 → 重启
      final mount = await Process.run('hdiutil', ['attach', '-nobrowse', file.path]);
      if (mount.exitCode != 0) {
        return InstallResult._(ok: false, message: '挂载 dmg 失败：${mount.stderr}');
      }
      final out = mount.stdout.toString();
      final mountPoint = _parseMountPoint(out);
      if (mountPoint == null) {
        return const InstallResult._(ok: false, message: '未能解析 dmg 挂载点');
      }

      // 找到挂载卷里的 .app
      final vol = Directory(mountPoint);
      final appDir = await vol
          .list()
          .where((e) => e.path.endsWith('.app'))
          .cast<Directory>()
          .firstWhere((_) => true, orElse: () => Directory(''));

      if (appDir.path.isEmpty) {
        await Process.run('hdiutil', ['detach', mountPoint]);
        return const InstallResult._(ok: false, message: 'dmg 中未找到 .app');
      }

      final appName = appDir.path.split('/').last;
      final target = '/Applications/$appName';
      // 先删旧版再拷贝，避免 CodeReplace 失败
      final old = Directory(target);
      if (await old.exists()) await old.delete(recursive: true);
      final cp = await Process.run('cp', ['-R', appDir.path, target]);
      await Process.run('hdiutil', ['detach', mountPoint]);

      if (cp.exitCode != 0) {
        return InstallResult._(ok: false, message: '拷贝 .app 失败：${cp.stderr}');
      }
      return const InstallResult._(ok: true, needRestart: true);
    }

    if (type == 'zip') {
      // 解压后替换 /Applications 下的 .app
      final r = await Process.run('ditto', ['-xk', file.path, '/Applications/']);
      if (r.exitCode == 0) {
        return const InstallResult._(ok: true, needRestart: true);
      }
      return InstallResult._(ok: false, message: '解压失败：${r.stderr}');
    }

    return InstallResult._(ok: false, message: 'macOS 不支持的产物类型：$type');
  }

  /// 从 hdiutil attach 的输出里解析挂载点（最后一行以 /Volumes/ 开头）。
  String? _parseMountPoint(String out) {
    for (final line in out.split('\n').reversed) {
      final trimmed = line.trim();
      final idx = trimmed.indexOf('/Volumes/');
      if (idx >= 0) {
        return trimmed.substring(idx).trim();
      }
    }
    return null;
  }

  // ------------------------------------------------------------------
  // Linux
  // ------------------------------------------------------------------
  Future<InstallResult> _installLinux(OtaArtifact artifact, File file) async {
    final type = artifact.type.toLowerCase();

    if (type == 'appimage') {
      // AppImage 自更新策略：
      // 1. 给新包加可执行权限
      // 2. 用它覆盖当前 AppImage 路径
      // 3. 拉起新进程，旧进程退出
      // 前提：安装目录（通常在用户目录）可写。若装到 /opt 则需提权。
      await Process.run('chmod', ['+x', file.path]);

      final currentPath = Platform.resolvedExecutable;
      final target = File(currentPath);
      final backup = File('$currentPath.bak');

      try {
        if (await backup.exists()) await backup.delete();
        await target.copy(backup.path);
        await file.copy(currentPath);
      } catch (e) {
        return InstallResult._(ok: false, message: '替换 AppImage 失败：$e');
      }

      await Process.start(currentPath, [], mode: ProcessStartMode.detached);
      return const InstallResult._(ok: true, needRestart: true);
    }

    if (type == 'deb') {
      // 需要 root：优先用 pkexec 弹系统授权框；
      // 环境里没有 pkexec 时退回 dpkg（会失败，UI 需提示）
      final hasPkexec = await _commandExists('pkexec');
      final cmd = hasPkexec ? 'pkexec' : 'dpkg';
      final args = hasPkexec ? ['dpkg', '-i', file.path] : ['-i', file.path];
      final r = await Process.run(cmd, args);
      if (r.exitCode == 0) {
        return const InstallResult._(ok: true, needRestart: true);
      }
      return InstallResult._(
        ok: false,
        message: 'deb 安装失败(${r.exitCode})：${r.stderr}',
      );
    }

    if (type == 'rpm') {
      final r = await Process.run('pkexec', ['rpm', '-U', file.path]);
      if (r.exitCode == 0) {
        return const InstallResult._(ok: true, needRestart: true);
      }
      return InstallResult._(ok: false, message: 'rpm 安装失败：${r.stderr}');
    }

    if (type == 'tar_gz' || type == 'zip') {
      // 解压到安装目录并覆盖。与 Windows 绿色版同理，
      // 建议配合"版本号目录 + 启动器"避免占用冲突。
      return const InstallResult._(
        ok: false,
        message: 'tar.gz 自更新需配合启动器实现，请参考 docs/ota-integration.md',
      );
    }

    return InstallResult._(ok: false, message: 'Linux 不支持的产物类型：$type');
  }

  Future<bool> _commandExists(String cmd) async {
    try {
      final r = await Process.run('which', [cmd]);
      return r.exitCode == 0;
    } catch (_) {
      return false;
    }
  }
}
