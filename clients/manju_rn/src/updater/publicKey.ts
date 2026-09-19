/**
 * OTA 更新包的 Ed25519 公钥。
 *
 * 由 `scripts/gen_keypair.py`（及项目根 `keys/ota_private.pem`）生成，
 * 客户端在编译期内置，用于校验下载到的安装包确实来自官方发布，防止中间人替换成恶意包。
 *
 * 安全要求：
 * - 公钥可以公开；私钥绝不能进客户端、绝不能提交仓库（见 `keys/` 目录，已被 gitignore）。
 * - 一旦更换密钥对，所有旧版本客户端都会验签失败，只能通过商店强制升级。
 */

/** Base64 形式的 Ed25519 原始公钥（32 字节），与服务端下发签名所用私钥配对。 */
export const OTA_PUBLIC_KEY_BASE64 =
  'f2obZdLFwhWJtuA/u/VW/EB1jAZ/UiZF/eEbxFJ0a3c=';

/** 是否启用签名校验。调试期可临时关闭（此时仅校验 SHA256），发版前必须置为 true。 */
export const OTA_VERIFY_SIGNATURE = true;

/** 把 Base64 公钥解码为 Uint8Array，供 @noble/ed25519 使用。 */
export function getPublicKeyBytes(): Uint8Array {
  const binary = atob(OTA_PUBLIC_KEY_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
