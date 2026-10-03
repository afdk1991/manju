/// 设备标识与平台探测。
///
/// OTA 服务需要 `device_id`、`platform`、`arch` 三个参数来做灰度放量、
/// 产物匹配和版本对比。这里统一封装，避免各端散落重复逻辑。
library;

import 'dart:io';

import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../updater/models/ota_release.dart';

/// 当前运行平台（映射到 OTA 协议的 `platform` 字段）。
OtaPlatform get currentOtaPlatform {
  if (kIsWeb) {
    // Web 不在 6 端范围内，这里仅用于防止 kIsWeb 时 Platform 访问崩溃。
    return OtaPlatform.windows;
  }
  if (Platform.isAndroid) return OtaPlatform.android;
  if (Platform.isIOS) return OtaPlatform.ios;
  if (Platform.isWindows) return OtaPlatform.windows;
  if (Platform.isMacOS) return OtaPlatform.macos;
  if (Platform.isLinux) return OtaPlatform.linux;
  // HarmonyOS 由 Flutter OHOS 分支构建，dart:io 的 Platform.isAndroid 可能为 true。
  // 鸿蒙端需要在编译期通过 --dart-define=MANJU_PLATFORM=harmonyos 显式指定。
  const forced = String.fromEnvironment('MANJU_PLATFORM');
  return switch (forced) {
    'harmonyos' => OtaPlatform.harmonyos,
    'android' => OtaPlatform.android,
    'ios' => OtaPlatform.ios,
    'windows' => OtaPlatform.windows,
    'macos' => OtaPlatform.macos,
    'linux' => OtaPlatform.linux,
    _ => OtaPlatform.linux,
  };
}

/// 当前 CPU 架构（映射到 OTA 协议的 `arch` 字段）。
Future<OtaArch> currentOtaArch() async {
  final info = DeviceInfoPlugin();
  if (kIsWeb) return OtaArch.x8664;

  if (Platform.isAndroid) {
    final android = await info.androidInfo;
    // supportedAbis 形如 [arm64-v8a, armeabi-v7a, x86_64]
    final abis = android.supportedAbis;
    if (abis.any((a) => a.contains('arm64'))) return OtaArch.arm64;
    if (abis.any((a) => a.contains('x86_64'))) return OtaArch.x8664;
    if (abis.any((a) => a.contains('armeabi'))) return OtaArch.armv7;
    return OtaArch.arm64;
  }
  if (Platform.isIOS || Platform.isMacOS) return OtaArch.arm64;
  if (Platform.isWindows || Platform.isLinux) {
    // 桌面端以进程字长判断即可，绝大多数为 x86_64。
    final host = await _hostArch();
    return host;
  }
  return OtaArch.x8664;
}

Future<OtaArch> _hostArch() async {
  final info = DeviceInfoPlugin();
  if (Platform.isWindows) {
    // windowsInfo 未直接暴露 arch，用环境变量兜底
    final arch = Platform.environment['PROCESSOR_ARCHITECTURE'] ?? '';
    if (arch.contains('ARM')) return OtaArch.arm64;
    return OtaArch.x8664;
  }
  if (Platform.isLinux) {
    final l = await info.linuxInfo;
    final machine = l.machineId ?? '';
    if (machine.contains('aarch64') || machine.contains('arm64')) {
      return OtaArch.arm64;
    }
    return OtaArch.x8664;
  }
  return OtaArch.x8664;
}

/// 获取（或首次生成并持久化）匿名设备标识。
///
/// 仅用于灰度分桶与统计，**不得包含任何个人身份信息**。
Future<String> getOrCreateDeviceId() async {
  final prefs = await SharedPreferences.getInstance();
  const key = 'manju.device_id';
  final existing = prefs.getString(key);
  if (existing != null && existing.isNotEmpty) return existing;

  final id = _generateId();
  await prefs.setString(key, id);
  return id;
}

String _generateId() {
  final now = DateTime.now().microsecondsSinceEpoch;
  // 不引入 uuid 依赖，用时间戳 + 随机数构造足够长的标识。
  final rnd = (now ^ (now >> 32)) & 0xFFFFFFFF;
  return '${now.toRadixString(36)}-${rnd.toRadixString(36)}';
}

/// 当前系统语言，形如 `zh-CN`。
String currentLocaleName() {
  final name = Platform.localeName; // 形如 zh_CN
  return name.replaceAll('_', '-');
}
