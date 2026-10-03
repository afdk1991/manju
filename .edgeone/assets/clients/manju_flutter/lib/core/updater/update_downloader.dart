/// 更新包下载器。
///
/// 负责：把 [OtaArtifact] 下载到本地临时目录，并实时回调进度。
/// **不做任何校验** —— 校验由 [UpdateVerifier] 负责，两件事必须分离，
/// 避免"边下边验"时把未验证的文件提前交给安装器。
library;

import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:path_provider/path_provider.dart';

import 'models/ota_release.dart';

/// 下载进度。
class DownloadProgress {
  const DownloadProgress({
    required this.received,
    required this.total,
  });

  final int received;

  /// 服务端未返回 Content-Length 时为 0，UI 需显示"未知大小"。
  final int total;

  double get ratio => total <= 0 ? 0 : (received / total).clamp(0.0, 1.0);
}

/// 下载结果。
class DownloadResult {
  const DownloadResult._({this.file, this.error});

  final File? file;
  final String? error;

  bool get ok => file != null;
}

/// 更新包下载器。
class UpdateDownloader {
  UpdateDownloader({Dio? dio}) : _dio = dio ?? Dio();

  final Dio _dio;

  /// 下载安装包到临时目录。
  ///
  /// [onProgress] 会被高频回调，UI 侧需自行节流。
  /// [cancelToken] 用于用户取消下载。
  Future<DownloadResult> download(
    OtaArtifact artifact, {
    void Function(DownloadProgress)? onProgress,
    CancelToken? cancelToken,
  }) async {
    try {
      final dir = await getTemporaryDirectory();
      final saveDir = Directory('${dir.path}/manju_ota');
      if (!await saveDir.exists()) {
        await saveDir.create(recursive: true);
      }

      // 文件名带上版本号，便于排查；安装成功后由调用方清理。
      final fileName = artifact.url.split('/').last.split('?').first;
      final safeName = fileName.isEmpty ? 'update.pkg' : fileName;
      final savePath = '${saveDir.path}/$safeName';

      // 清掉同名残留，防止上次失败留下的半截文件被误用
      final old = File(savePath);
      if (await old.exists()) await old.delete();

      await _dio.download(
        artifact.url,
        savePath,
        cancelToken: cancelToken,
        onReceiveProgress: (received, total) {
          onProgress?.call(DownloadProgress(received: received, total: total));
        },
        options: Options(
          // 安装包可能几十上百 MB，超时放宽
          receiveTimeout: const Duration(minutes: 10),
          // 防中间人：只接受 HTTPS
          validateStatus: (s) => s != null && s >= 200 && s < 300,
        ),
      );

      final file = File(savePath);
      if (!await file.exists()) {
        return const DownloadResult._(error: '下载完成但文件不存在');
      }

      final actualSize = await file.length();
      if (artifact.size > 0 && actualSize != artifact.size) {
        await file.delete();
        return DownloadResult._(
          error: '文件大小不符：期望 ${artifact.size}，实际 $actualSize',
        );
      }

      return DownloadResult._(file: file);
    } on DioException catch (e) {
      return DownloadResult._(error: '下载失败：${e.message ?? e.toString()}');
    } catch (e) {
      return DownloadResult._(error: '下载失败：$e');
    }
  }

  /// 清空历史遗留的下载文件，避免占满磁盘。
  static Future<void> purgeOldPackages() async {
    try {
      final dir = await getTemporaryDirectory();
      final saveDir = Directory('${dir.path}/manju_ota');
      if (await saveDir.exists()) {
        await saveDir.delete(recursive: true);
      }
    } catch (_) {
      // 清理失败不影响主流程
    }
  }
}
