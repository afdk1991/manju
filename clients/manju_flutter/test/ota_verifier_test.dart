import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:cryptography/cryptography.dart';
import 'package:manju/core/updater/models/ota_release.dart';
import 'package:test/test.dart';
import 'package:manju/core/updater/ota_public_key.dart';
import 'package:manju/core/updater/verifier.dart';

void main() {
  group('OTA 协议模型解析', () {
    test('解析完整响应', () {
      final json = {
        'has_update': true,
        'policy': 'forced',
        'release': {
          'version': '1.3.0',
          'build': 130,
          'channel': 'stable',
          'released_at': '2026-09-16T10:00:00Z',
          'min_supported_version': '1.1.0',
          'notes_i18n': {'zh-CN': '修复卡顿', 'en': 'Fix stutter'},
          'artifact': {
            'type': 'msix',
            'url': 'https://cdn.example.com/app.msix',
            'size': 1024,
            'sha256': 'ABCDEF',
            'signature': 'ed25519:MEUCIQ==',
          },
        },
      };
      final r = OtaCheckResult.fromJson(json);
      expect(r.hasUpdate, isTrue);
      expect(r.policy, UpdatePolicy.forced);
      expect(r.release!.version, '1.3.0');
      expect(r.release!.build, 130);
      // sha256 应被规范化为小写
      expect(r.release!.artifact.sha256, 'abcdef');
      expect(r.release!.notesFor('zh-CN'), '修复卡顿');
      expect(r.release!.notesFor('en'), 'Fix stutter');
    });

    test('iOS 响应必须带 store_fallback', () {
      final json = {
        'has_update': true,
        'policy': 'suggest',
        'release': {
          'version': '1.3.0',
          'build': 130,
          'artifact': {
            'type': 'ipa',
            'url': 'https://x/y.ipa',
            'size': 1,
            'sha256': 'aa',
          },
        },
        'store_fallback': {
          'enabled': true,
          'url': 'https://apps.apple.com/app/id123',
          'reason': 'platform_restricted',
        },
      };
      final r = OtaCheckResult.fromJson(json);
      expect(r.mustGoToStore, isTrue);
      expect(r.storeFallback!.url, 'https://apps.apple.com/app/id123');
    });

    test('平台自安装能力矩阵', () {
      expect(OtaPlatform.windows.canSelfInstall, isTrue);
      expect(OtaPlatform.macos.canSelfInstall, isTrue);
      expect(OtaPlatform.linux.canSelfInstall, isTrue);
      expect(OtaPlatform.android.canSelfInstall, isTrue);
      // 红线：这两个平台绝不能自安装
      expect(OtaPlatform.ios.canSelfInstall, isFalse);
      expect(OtaPlatform.harmonyos.canSelfInstall, isFalse);
      // Android 需要用户授权
      expect(OtaPlatform.android.requiresInstallPermission, isTrue);
    });
  });

  group('更新包校验', () {
    test('SHA256 计算正确且能识别篡改', () async {
      final dir = await Directory.systemTemp.createTemp('manju_verify_test');
      final file = File('${dir.path}/pkg.bin');
      await file.writeAsBytes([1, 2, 3, 4, 5]);

      const verifier = UpdateVerifier();
      final digest = await verifier.sha256Of(file);
      expect(digest, sha256.convert([1, 2, 3, 4, 5]).toString());

      // 构造一个 sha256 不匹配的 artifact，应当校验失败
      final artifact = OtaArtifact(
        type: 'msix',
        url: 'x',
        size: 5,
        sha256: '0' * 64,
      );
      final result = await verifier.verify(
        file,
        artifact,
        version: '1.0.0',
        build: 1,
      );
      expect(result.ok, isFalse);
      expect(result.reason, VerifyFailureReason.sha256Mismatch);

      await dir.delete(recursive: true);
    });

    test('缺少签名且要求签名时必须拒绝', () async {
      final dir = await Directory.systemTemp.createTemp('manju_verify_test2');
      final file = File('${dir.path}/pkg.bin');
      await file.writeAsBytes([9, 9, 9]);

      const verifier = UpdateVerifier();
      final sha = await verifier.sha256Of(file);
      final artifact = OtaArtifact(
        type: 'msix',
        url: 'x',
        size: 3,
        sha256: sha,
        // 故意不带 signature
      );
      final result = await verifier.verify(
        file,
        artifact,
        version: '1.0.0',
        build: 1,
        requireSignature: true,
      );
      expect(result.ok, isFalse);
      expect(result.reason, VerifyFailureReason.signatureMissing);

      await dir.delete(recursive: true);
    });

    test('签名规范化消息与服务端 sign_release 一致', () {
      expect(
        otaSignatureMessage(
            '9.9.9', 999, 'ABCDEF', 'https://cdn.example.com/a.exe'),
        '9.9.9|999|abcdef|https://cdn.example.com/a.exe',
      );
      expect(
        otaSignatureMessage('1.3.0', 130, 'aa', 'x'),
        '1.3.0|130|aa|x',
      );
    });

    test('Ed25519 签名校验：正确签名通过、错误签名拒绝', () async {
      // 生成一对临时密钥
      final algorithm = Ed25519();
      final keyPair = await algorithm.newKeyPair();
      final shaHex = 'a' * 64;
      final message = utf8.encode(shaHex);
      final signature = await algorithm.sign(message, keyPair: keyPair);

      // 用该私钥对应的公钥验签，应当通过
      final pub = await keyPair.extractPublicKey();
      final ok = await algorithm.verify(message, signature: signature);
      expect(ok, isTrue);
      expect(pub.bytes.length, 32);

      // 篡改消息后验签应当失败
      final tampered = utf8.encode('b' * 64);
      final bad = await algorithm.verify(tampered, signature: signature);
      expect(bad, isFalse);
    });

    test('内置的 OTA 公钥格式正确', () async {
      // 内置公钥必须能被解析为合法的 Ed25519 公钥
      final pub = SimplePublicKey(kOtaPublicKeyBytes, type: KeyPairType.ed25519);
      expect(pub.bytes.length, 32);

      // Base64 常量与字节数组必须一致
      expect(base64Decode(kOtaPublicKeyBase64), kOtaPublicKeyBytes);
    });
  });
}
