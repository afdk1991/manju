// ============================================================================
// 更新包安全校验（自动更新链路的生命线）
//
// 与服务端 / Flutter 端保持完全一致的两道校验：
//  1. SHA256 —— 确保传输无损、未被替换（防意外）。
//  2. Ed25519 签名 —— 确保安装包确实由官方私钥签发（防伪造）。
//
// 任一校验失败 → 立即中止并删除临时文件，绝不留未验证的可执行文件。
// 公钥编译期内置（见 PUBLIC_KEY_BASE64），与 Flutter 端 kOtaPublicKeyBytes 同源。
// ============================================================================

import { ed25519 } from "@noble/curves/ed25519";
import { sha256 as nobleSha256 } from "@noble/hashes/sha256";
import { base64 } from "@noble/hashes/utils";

/** 内置 Ed25519 公钥（32 字节，Base64）。不得提交私钥。 */
export const PUBLIC_KEY_BASE64 = "DuW8zxjUYPNEnNY8RMIe4G670V5ZzX39rl1v9CEVQRU=";

/** 是否强制校验签名。调试期可临时关闭，发版前必须置 true。 */
export const REQUIRE_SIGNATURE = true;

/** 计算字节数组的 SHA256（十六进制小写，与协议一致）。 */
export function sha256Hex(bytes: Uint8Array): string {
  const digest = nobleSha256(bytes);
  return Array.from(digest)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: string; detail?: string };

/**
 * 校验下载到的安装包。
 * @param fileBytes 本地临时文件内容
 * @param expectedSha256 服务端下发的 sha256（小写）
 * @param signature   服务端下发的签名（ed25519:<base64>），可能为空
 */
export function verifyArtifact(
  fileBytes: Uint8Array,
  expectedSha256: string,
  signature?: string,
): VerifyResult {
  // ---- 第一道：SHA256 ----
  const actual = sha256Hex(fileBytes);
  if (actual.toLowerCase() !== expectedSha256.toLowerCase()) {
    return {
      ok: false,
      reason: "sha256_mismatch",
      detail: `期望 ${expectedSha256.toLowerCase()}，实际 ${actual}`,
    };
  }

  // ---- 第二道：Ed25519 签名 ----
  if (!signature || signature.trim() === "") {
    if (REQUIRE_SIGNATURE) {
      return { ok: false, reason: "signature_missing", detail: "未携带签名，禁止放行" };
    }
    return { ok: true }; // 调试期允许仅凭 SHA256 放行
  }

  try {
    const prefixed = signature.trim();
    const prefix = "ed25519:";
    const b64 = prefixed.startsWith(prefix)
      ? prefixed.slice(prefix.length)
      : prefixed;
    const sigBytes = base64.decode(b64);
    const pubKey = base64.decode(PUBLIC_KEY_BASE64);

    // 与服务端一致：签名对象为 sha256 的十六进制字符串本身。
    const message = new TextEncoder().encode(actual.toLowerCase());
    const valid = ed25519.verify(sigBytes, message, pubKey);
    if (!valid) {
      return {
        ok: false,
        reason: "signature_invalid",
        detail: "签名与内置公钥不匹配，该安装包可能不是官方发布",
      };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: "signature_invalid", detail: String(e) };
  }
}
