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
import { PUBLIC_KEY_BASE64, REQUIRE_SIGNATURE } from "./publicKey";

/** Base64 解码为字节数组。
 *  @noble/hashes 的 utils 不导出 base64，这里用 WebView（浏览器环境）内置的
 *  atob 实现，无需额外依赖。Tauri 前端运行在 WebView 中，atob 始终可用。 */
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// 公钥与"是否强制签名校验"已由 publicKey.ts 统一定义，本模块直接复用，
// 避免多份拷贝导致轮换时遗漏。
export { PUBLIC_KEY_BASE64, REQUIRE_SIGNATURE };

/** 计算字节数组的 SHA256（十六进制小写，与协议一致）。 */
export function sha256Hex(bytes: Uint8Array): string {
  const digest = nobleSha256(bytes);
  return Array.from(digest)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * 规范化签名消息。
 * 必须与服务端 `sign_release`、Flutter 端 `otaSignatureMessage` 的
 * `{version}|{build}|{sha256 小写}|{url}` 逐字节一致，否则验签会失败。
 */
export function otaSignatureMessage(
  version: string,
  build: number,
  sha256HexValue: string,
  url: string,
): string {
  return `${version}|${build}|${sha256HexValue.toLowerCase()}|${url}`;
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: string; detail?: string };

/**
 * 校验下载到的安装包。
 * @param fileBytes 本地临时文件内容
 * @param expectedSha256 服务端下发的 sha256（小写）
 * @param version  发布版本号（参与签名消息）
 * @param build    构建号（参与签名消息）
 * @param url      产物下载地址（参与签名消息，须与服务端签名时一致）
 * @param signature  服务端下发的签名（ed25519:<base64>），可能为空
 */
export function verifyArtifact(
  fileBytes: Uint8Array,
  expectedSha256: string,
  version: string,
  build: number,
  url: string,
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
    const sigBytes = base64ToBytes(b64);
    const pubKey = base64ToBytes(PUBLIC_KEY_BASE64);

    // 与服务端 sign_release 一致：签名对象为规范化消息
    // {version}|{build}|{sha256 小写}|{url}，逐字节一致才能验签通过。
    const message = new TextEncoder().encode(
      otaSignatureMessage(version, build, actual, url),
    );
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
