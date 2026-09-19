/// OTA 更新包的 Ed25519 公钥。
///
/// 由 `scripts/gen_keypair.py` 生成，客户端在编译期内置，用于校验下载到的
/// 安装包确实来自官方发布，防止中间人替换成恶意包。
///
/// **安全要求**：
/// - 公钥可以公开，私钥绝不能进客户端、绝不能提交仓库。
/// - 一旦更换密钥对，所有旧版本客户端都会验签失败，只能通过商店强制升级。
library;

/// Base64 形式的 Ed25519 原始公钥（32 字节）。
const String kOtaPublicKeyBase64 = 'f2obZdLFwhWJtuA/u/VW/EB1jAZ/UiZF/eEbxFJ0a3c=';

/// 字节数组形式，与上面等价，供 `SimplePublicKey` 直接使用。
const List<int> kOtaPublicKeyBytes = <int>[
  0x0e, 0xe5, 0xbc, 0xcf, 0x18, 0xd4, 0x60, 0xf3, //
  0x44, 0x9c, 0xd6, 0x3c, 0x44, 0xc2, 0x1e, 0xe0, //
  0x6e, 0xbb, 0xd1, 0x5e, 0x59, 0xcd, 0x7d, 0xfd, //
  0xae, 0x5d, 0x6f, 0xf4, 0x21, 0x15, 0x41, 0x15, //
];

/// 是否启用签名校验。
///
/// 调试期可临时关闭（此时仅校验 SHA256），**发版前必须置为 true**。
const bool kOtaVerifySignature = true;
