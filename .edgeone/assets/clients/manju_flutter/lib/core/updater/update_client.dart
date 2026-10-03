/// OTA 更新服务的 HTTP 客户端。
///
/// 严格实现 `spec/ota-protocol.v1.md`：
/// - `GET  /api/v1/ota/check`  检查更新（含 ETag / 304）
/// - `POST /api/v1/ota/report` 上报更新事件
library;

import 'package:dio/dio.dart';

import 'models/ota_release.dart';

/// 检查更新的结果状态。
enum OtaCheckStatus {
  /// 有可用更新。
  available,

  /// 已是最新（HTTP 204 或 304）。
  upToDate,

  /// 服务端返回了业务错误（400 / 404 / 409 / 429 等）。
  error,
}

/// 检查更新结果。
class OtaCheckOutcome {
  const OtaCheckOutcome({
    required this.status,
    this.result,
    this.errorCode,
    this.message,
  });

  final OtaCheckStatus status;

  /// 仅当 status == available 时非空。
  final OtaCheckResult? result;

  /// 服务端返回的错误码，如 `rollback_attempt`。
  final String? errorCode;
  final String? message;
}

/// OTA 上报事件，对应协议中的 `event` 字段。
enum OtaReportEvent {
  downloaded('downloaded'),
  installed('installed'),
  failed('failed'),
  skipped('skipped'),

  /// iOS / HarmonyOS 走商店跳转时使用，用于统计真实转化率。
  unsupported('unsupported');

  const OtaReportEvent(this.value);
  final String value;
}

/// OTA 服务客户端。
class UpdateClient {
  UpdateClient({
    required this.baseUrl,
    Dio? dio,
  }) : _dio = dio ??
            Dio(BaseOptions(
              baseUrl: baseUrl,
              connectTimeout: const Duration(seconds: 15),
              receiveTimeout: const Duration(seconds: 15),
            ));

  final String baseUrl;
  final Dio _dio;

  /// 上次响应的 ETag，用于下次请求的 `If-None-Match`。
  String? _lastEtag;

  /// 检查是否有新版本。
  ///
  /// [platform] [arch] [channel] [version] [build] [deviceId] 为协议必填项。
  Future<OtaCheckOutcome> check({
    required OtaPlatform platform,
    required OtaArch arch,
    required OtaChannel channel,
    required String version,
    required int build,
    required String deviceId,
    String? locale,
    String? abi,
  }) async {
    try {
      final resp = await _dio.get<Map<String, dynamic>>(
        '/api/v1/ota/check',
        queryParameters: <String, dynamic>{
          'platform': platform.value,
          'arch': arch.value,
          'channel': channel.value,
          'version': version,
          'build': build,
          'device_id': deviceId,
          if (locale != null) 'locale': locale,
          if (abi != null) 'abi': abi,
        },
        options: Options(
          // 304 Not Modified 不算错误
          validateStatus: (s) => s != null && s < 500,
          headers: {
            if (_lastEtag != null) 'If-None-Match': _lastEtag,
          },
        ),
      );

      final status = resp.statusCode ?? 0;

      // 无更新
      if (status == 204 || status == 304) {
        return const OtaCheckOutcome(status: OtaCheckStatus.upToDate);
      }

      if (status != 200) {
        final data = resp.data ?? const <String, dynamic>{};
        return OtaCheckOutcome(
          status: OtaCheckStatus.error,
          errorCode: data['code']?.toString(),
          message: data['message']?.toString() ?? 'HTTP $status',
        );
      }

      final etag = resp.headers.value('etag');
      if (etag != null) _lastEtag = etag;

      final result = OtaCheckResult.fromJson(resp.data!);
      if (!result.hasUpdate || result.release == null) {
        return const OtaCheckOutcome(status: OtaCheckStatus.upToDate);
      }

      // --- 客户端侧兜底校验：防止服务端配置错误导致降级 ---
      if (!_isNewer(result.release!.version, result.release!.build, version, build)) {
        return OtaCheckOutcome(
          status: OtaCheckStatus.error,
          errorCode: 'rollback_attempt',
          message: '服务端返回了比当前更旧的版本，已拒绝',
        );
      }

      return OtaCheckOutcome(status: OtaCheckStatus.available, result: result);
    } on DioException catch (e) {
      return OtaCheckOutcome(
        status: OtaCheckStatus.error,
        errorCode: 'network_error',
        message: e.message ?? e.toString(),
      );
    }
  }

  /// 上报更新事件。失败不影响主流程，所以吞掉异常。
  Future<void> report({
    required String deviceId,
    required OtaPlatform platform,
    required String version,
    required int build,
    required OtaReportEvent event,
    String? reason,
    int? elapsedMs,
  }) async {
    try {
      await _dio.post<void>(
        '/api/v1/ota/report',
        data: <String, dynamic>{
          'device_id': deviceId,
          'platform': platform.value,
          'version': version,
          'build': build,
          'event': event.value,
          if (reason != null) 'reason': reason,
          if (elapsedMs != null) 'elapsed_ms': elapsedMs,
        },
        options: Options(validateStatus: (s) => s != null && s < 500),
      );
    } catch (_) {
      // 上报失败不应影响用户体验
    }
  }

  /// 比较版本号，判断 [newVersion]/[newBuild] 是否比 [curVersion]/[curBuild] 更新。
  ///
  /// 优先比较 build（单调递增，最可靠）；build 相同时再比较语义化版本。
  static bool _isNewer(String newVersion, int newBuild, String curVersion, int curBuild) {
    if (newBuild > curBuild) return true;
    if (newBuild < curBuild) return false;
    return _compareSemver(newVersion, curVersion) > 0;
  }

  /// 语义化版本比较：a > b 返回 1，相等 0，小于 -1。
  static int _compareSemver(String a, String b) {
    final pa = _parse(a);
    final pb = _parse(b);
    for (var i = 0; i < 3; i++) {
      if (pa[i] != pb[i]) return pa[i] > pb[i] ? 1 : -1;
    }
    return 0;
  }

  static List<int> _parse(String v) {
    final parts = v.split(RegExp(r'[.+]'));
    return List<int>.generate(
      3,
      (i) => i < parts.length ? int.tryParse(parts[i]) ?? 0 : 0,
    );
  }
}
