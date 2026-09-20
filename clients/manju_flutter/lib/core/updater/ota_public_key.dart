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
  0x7f, 0x6a, 0x1b, 0x65, 0xd2, 0xc5, 0xc2, 0x15, //
  0x89, 0xb6, 0xe0, 0x3f, 0xbb, 0xf5, 0x56, 0xfc, //
  0x40, 0x75, 0x8c, 0x06, 0x7f, 0x52, 0x26, 0x45, //
  0xfd, 0xe1, 0x1b, 0xc4, 0x52, 0x74, 0x6b, 0x77, //
];

/// 是否启用签名校验。
///
/// 调试期可临时关闭（此时仅校验 SHA256），**发版前必须置为 true**。
const bool kOtaVerifySignature = true;
