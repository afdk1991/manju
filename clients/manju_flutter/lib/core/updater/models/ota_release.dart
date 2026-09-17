/// OTA 更新协议 v1 的 Dart 数据模型。
///
/// 字段严格对齐 `spec/ota-protocol.v1.md`，**不得随意改名或增删**。
/// 服务端与全部客户端（Flutter / Tauri / RN / ArkTS）共用这份契约。
library;

/// 目标平台。与协议中的 `platform` 字段一一对应。
enum OtaPlatform {
  android('android'),
  ios('ios'),
  harmonyos('harmonyos'),
  windows('windows'),
  macos('macos'),
  linux('linux');

  const OtaPlatform(this.value);
  final String value;

  static OtaPlatform parse(String v) => OtaPlatform.values.firstWhere(
        (e) => e.value == v,
        orElse: () => throw ArgumentError('未知的 platform: $v'),
      );

  /// 该平台是否具备"下载后静默自安装"的能力。
  ///
  /// 这是**操作系统级别**的限制，不是实现问题：
  /// - iOS：Apple 禁止侧载静默安装，只能跳转 App Store
  /// - HarmonyOS：无公开的静默安装 API，只能跳转华为应用市场
  bool get canSelfInstall => switch (this) {
        OtaPlatform.windows || OtaPlatform.macos || OtaPlatform.linux => true,
        // Android 需要用户先授予"允许来自此来源的应用"，属于"有条件支持"
        OtaPlatform.android => true,
        // 这两个平台严禁声称支持自动安装
        OtaPlatform.ios || OtaPlatform.harmonyos => false,
      };

  /// 该平台自安装是否需要用户事先授权（Android 的未知来源开关）。
  bool get requiresInstallPermission => this == OtaPlatform.android;
}

/// CPU 架构。
enum OtaArch {
  x8664('x86_64'),
  arm64('arm64'),
  armv7('armv7'),
  x86('x86');

  const OtaArch(this.value);
  final String value;
}

/// 发布通道。
enum OtaChannel {
  stable('stable'),
  beta('beta'),
  nightly('nightly');

  const OtaChannel(this.value);
  final String value;
}

/// 更新安装策略。
enum UpdatePolicy {
  /// 仅提示，用户可忽略。
  suggest('suggest'),

  /// 强制更新：版本低于 min_supported_version，不可跳过。
  forced('forced'),

  /// 后台静默下载并安装（仅桌面端具备能力）。
  silent('silent');

  const UpdatePolicy(this.value);
  final String value;

  static UpdatePolicy parse(String v, {UpdatePolicy fallback = UpdatePolicy.suggest}) =>
      UpdatePolicy.values.firstWhere((e) => e.value == v, orElse: () => fallback);
}

/// 安装包产物。
class OtaArtifact {
  const OtaArtifact({
    required this.type,
    required this.url,
    required this.size,
    required this.sha256,
    this.signature,
    this.installArgs = const [],
  });

  /// 产物类型：apk / ipa / hap / msix / exe / dmg / pkg / appimage / deb / rpm / tar_gz
  final String type;
  final String url;
  final int size;

  /// 十六进制小写 SHA256。客户端**必须**校验，不匹配立即中止安装。
  final String sha256;

  /// Ed25519 签名，格式 `ed25519:<base64>`。生产环境必填。
  final String? signature;

  /// 安装参数（服务端有白名单，防参数注入）。
  final List<String> installArgs;

  factory OtaArtifact.fromJson(Map<String, dynamic> json) => OtaArtifact(
        type: json['type'] as String,
        url: json['url'] as String,
        size: (json['size'] as num).toInt(),
        sha256: (json['sha256'] as String).toLowerCase(),
        signature: json['signature'] as String?,
        installArgs: (json['install_args'] as List<dynamic>?)
                ?.map((e) => e.toString())
                .toList() ??
            const [],
      );

  Map<String, dynamic> toJson() => {
        'type': type,
        'url': url,
        'size': size,
        'sha256': sha256,
        if (signature != null) 'signature': signature,
        if (installArgs.isNotEmpty) 'install_args': installArgs,
      };
}

/// 增量更新包（可选）。
class OtaDelta {
  const OtaDelta({
    required this.available,
    required this.fromVersions,
    this.url,
    this.size,
    this.sha256,
  });

  final bool available;
  final List<String> fromVersions;
  final String? url;
  final int? size;
  final String? sha256;

  factory OtaDelta.fromJson(Map<String, dynamic> json) => OtaDelta(
        available: json['available'] as bool? ?? false,
        fromVersions: (json['from_versions'] as List<dynamic>?)
                ?.map((e) => e.toString())
                .toList() ??
            const [],
        url: json['url'] as String?,
        size: (json['size'] as num?)?.toInt(),
        sha256: json['sha256'] as String?,
      );
}

/// 一个已发布的版本。
class OtaRelease {
  const OtaRelease({
    required this.version,
    required this.build,
    required this.channel,
    required this.releasedAt,
    required this.minSupportedVersion,
    required this.notesI18n,
    required this.artifact,
    this.delta,
  });

  final String version;
  final int build;
  final String channel;
  final DateTime releasedAt;

  /// 低于此版本的客户端会被服务端标记为 `forced` 强制更新。
  final String minSupportedVersion;

  /// 多语言更新说明，key 形如 `zh-CN` / `en`。
  final Map<String, String> notesI18n;
  final OtaArtifact artifact;
  final OtaDelta? delta;

  /// 取指定 locale 的更新说明，找不到时降级到中文/英文/首条。
  String notesFor(String locale) =>
      notesI18n[locale] ??
      notesI18n['zh-CN'] ??
      notesI18n['en'] ??
      (notesI18n.values.isEmpty ? '' : notesI18n.values.first);

  factory OtaRelease.fromJson(Map<String, dynamic> json) => OtaRelease(
        version: json['version'] as String,
        build: (json['build'] as num).toInt(),
        channel: json['channel'] as String? ?? 'stable',
        releasedAt: DateTime.tryParse(json['released_at'] as String? ?? '') ??
            DateTime.fromMillisecondsSinceEpoch(0),
        minSupportedVersion:
            json['min_supported_version'] as String? ?? json['version'] as String,
        notesI18n: (json['notes_i18n'] as Map<String, dynamic>?)?.map(
              (k, v) => MapEntry(k, v.toString()),
            ) ??
            const {},
        artifact: OtaArtifact.fromJson(
            json['artifact'] as Map<String, dynamic>? ?? const {}),
        delta: json['delta'] == null
            ? null
            : OtaDelta.fromJson(json['delta'] as Map<String, dynamic>),
      );
}

/// 商店兜底信息。
///
/// iOS 与 HarmonyOS **必须**使用这个分支，不得尝试自行安装。
class StoreFallback {
  const StoreFallback({
    required this.enabled,
    required this.url,
    required this.reason,
  });

  final bool enabled;
  final String url;

  /// 通常为 `platform_restricted`。
  final String reason;

  factory StoreFallback.fromJson(Map<String, dynamic> json) => StoreFallback(
        enabled: json['enabled'] as bool? ?? false,
        url: json['url'] as String? ?? '',
        reason: json['reason'] as String? ?? '',
      );
}

/// `GET /api/v1/ota/check` 的响应。
class OtaCheckResult {
  const OtaCheckResult({
    required this.hasUpdate,
    required this.policy,
    this.release,
    this.storeFallback,
  });

  final bool hasUpdate;
  final UpdatePolicy policy;
  final OtaRelease? release;

  /// 仅 iOS / HarmonyOS 会携带。
  final StoreFallback? storeFallback;

  /// true 表示本次更新只能引导用户去商店，客户端不能走下载安装流程。
  bool get mustGoToStore => storeFallback?.enabled == true;

  factory OtaCheckResult.fromJson(Map<String, dynamic> json) => OtaCheckResult(
        hasUpdate: json['has_update'] as bool? ?? false,
        policy: UpdatePolicy.parse(json['policy'] as String? ?? 'suggest'),
        release: json['release'] == null
            ? null
            : OtaRelease.fromJson(json['release'] as Map<String, dynamic>),
        storeFallback: json['store_fallback'] == null
            ? null
            : StoreFallback.fromJson(
                json['store_fallback'] as Map<String, dynamic>),
      );
}
