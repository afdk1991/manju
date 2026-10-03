/// 更新包安全校验。
///
/// **这是自动更新链路上的生命线**：客户端从网络下载可执行文件并运行，
/// 一旦校验缺失，中间人可以把安装包换成木马。因此这里做两道校验：
///
/// 1. **SHA256** —— 确保文件在传输过程中没有损坏或被替换（防意外）。
/// 2. **Ed25519 签名** —— 确保这个文件确实是官方用私钥签发的（防伪造）。
///
/// 两道校验任意一个失败，**必须立即中止安装并删除临时文件**。
library;

import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:cryptography/cryptography.dart';

import 'models/ota_release.dart';
import 'ota_public_key.dart';

/// 校验失败的原因，用于上报 `event=failed`。
enum VerifyFailureReason {
  sha256Mismatch('sha256_mismatch'),
  signatureInvalid('signature_invalid'),
  signatureMissing('signature_missing'),
  fileMissing('file_missing'),

  /// 本机平台不支持自安装（iOS / HarmonyOS），不应走下载流程。
  platformUnsupported('platform_unsupported');

  const VerifyFailureReason(this.value);
  final String value;
}

/// 校验结果。
class VerifyResult {
  const VerifyResult._({required this.ok, this.reason, this.detail});

  final bool ok;
  final VerifyFailureReason? reason;
  final String? detail;

  static const VerifyResult success = VerifyResult._(ok: true);

  factory VerifyResult.failure(VerifyFailureReason reason, [String? detail]) =>
      VerifyResult._(ok: false, reason: reason, detail: detail);
}

/// 规范化签名消息。
///
/// 必须与服务端 `app/security.py::sign_release` 的
/// `{version}|{build}|{sha256_lower}|{url}` 逐字节一致，否则验签会失败。
String otaSignatureMessage(String version, int build, String sha256Hex, String url) =>
    '$version|$build|${sha256Hex.toLowerCase()}|$url';

/// 更新包校验器。
class UpdateVerifier {
  const UpdateVerifier();

  /// 计算文件的 SHA256（十六进制小写，与协议一致）。
  ///
  /// 流式读取，避免把大安装包整个读进内存。
  Future<String> sha256Of(File file) async {
    if (!await file.exists()) return '';
    final sink = _DigestSink();
    final input = sha256.startChunkedConversion(sink);
    await for (final chunk in file.openRead()) {
      input.add(chunk);
    }
    input.close();
    return sink.value?.toString() ?? '';
  }

  /// 校验下载到的安装包。
  ///
  /// [file] 下载到本地的临时文件；
  /// [artifact] 服务端下发的产物描述；
  /// [requireSignature] 是否强制要求签名（生产环境应为 true）。
  Future<VerifyResult> verify(
    File file,
    OtaArtifact artifact, {
    required String version,
    required int build,
    bool requireSignature = kOtaVerifySignature,
  }) async {
    if (!await file.exists()) {
      return VerifyResult.failure(VerifyFailureReason.fileMissing, file.path);
    }

    // ---- 第一道：SHA256 ----
    final actual = await sha256Of(file);
    final expected = artifact.sha256.toLowerCase();
    if (actual != expected) {
      return VerifyResult.failure(
        VerifyFailureReason.sha256Mismatch,
        '期望 $expected，实际 $actual',
      );
    }

    // ---- 第二道：Ed25519 签名 ----
    final sig = artifact.signature;
    if (sig == null || sig.isEmpty) {
      if (requireSignature) {
        return VerifyResult.failure(VerifyFailureReason.signatureMissing);
      }
      // 调试期允许仅凭 SHA256 放行，但必须显式关闭 requireSignature。
      return VerifyResult.success;
    }

    final ok = await verifySignature(
      version,
      build,
      artifact.sha256,
      artifact.url,
      sig,
    );
    if (!ok) {
      return VerifyResult.failure(
        VerifyFailureReason.signatureInvalid,
        '签名与内置公钥不匹配，该安装包可能不是官方发布',
      );
    }

    return VerifyResult.success;
  }

  /// 用内置公钥校验 Ed25519 签名。
  ///
  /// 签名对象为规范化消息（见 [otaSignatureMessage]），
  /// 与服务端 `sign_release` 的 `{version}|{build}|{sha256_lower}|{url}` 完全一致。
  Future<bool> verifySignature(
    String version,
    int build,
    String sha256Hex,
    String url,
    String signaturePrefixed,
  ) async {
    try {
      final raw = signaturePrefixed.trim();
      const prefix = 'ed25519:';
      final b64 = raw.startsWith(prefix) ? raw.substring(prefix.length) : raw;
      final sigBytes = base64Decode(b64);

      final publicKey = SimplePublicKey(
        kOtaPublicKeyBytes,
        type: KeyPairType.ed25519,
      );
      final signature = Signature(sigBytes, publicKey: publicKey);

      final message = utf8.encode(otaSignatureMessage(version, build, sha256Hex, url));
      return await Ed25519().verify(message, signature: signature);
    } catch (_) {
      // 解析失败一律视为验签失败，不放行。
      return false;
    }
  }
}

/// 收集中间哈希结果的 Sink。
///
/// 用自定义实现而非 `AccumulatorSink`，避免额外依赖，
/// 同时保证流式校验时内存占用恒定。
class _DigestSink implements Sink<Digest> {
  Digest? _value;

  Digest? get value => _value;

  @override
  void add(Digest data) => _value = data;

  @override
  void close() {}
}
