/**
 * 更新包安全校验 —— 自动更新链路上的生命线。
 *
 * 下载到的文件是可执行安装包，一旦校验缺失，中间人即可把它换成木马。
 * 因此这里做两道校验：
 *   1) SHA256 —— 确保文件传输中未损坏或被替换（防意外）。
 *   2) Ed25519 签名 —— 确保文件确由官方私钥签发（防伪造）。
 * 两道校验任意失败，**必须立即中止安装并删除临时文件**。
 *
 * SHA256 使用 crypto-js 做流式计算（配合 react-native-fs 分块读取），
 * 避免把整包 APK 一次性读进内存。Ed25519 验签使用 @noble/ed25519。
 */
import CryptoJS from 'crypto-js';
import * as ed from '@noble/ed25519';
import RNFS from 'react-native-fs';

import {OtaArtifact} from './types';
import {OTA_PUBLIC_KEY_BASE64, OTA_VERIFY_SIGNATURE, getPublicKeyBytes} from './publicKey';

/** 规范化签名消息：与服务端 sign_release 的 `{version}|{build}|{sha256_lower}|{url}` 逐字节一致。 */
export function otaSignatureMessage(
  version: string,
  build: number,
  sha256Hex: string,
  url: string,
): string {
  return `${version}|${build}|${sha256Hex.toLowerCase()}|${url}`;
}

/** 把 crypto-js WordArray 转成 Uint8Array（用于喂给 @noble/ed25519）。 */
function wordArrayToUint8Array(word: CryptoJS.lib.WordArray): Uint8Array {
  const len = word.sigBytes;
  const bytes = new Uint8Array(len);
  const words = word.words;
  for (let i = 0; i < len; i++) {
    const byte = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
    bytes[i] = byte;
  }
  return bytes;
}

/** UTF-8 字符串 -> Uint8Array。 */
function utf8ToUint8Array(str: string): Uint8Array {
  return wordArrayToUint8Array(CryptoJS.enc.Utf8.parse(str));
}

/** 标准 Base64 -> Uint8Array（不依赖全局 atob，保证 RN 可用）。 */
function base64ToUint8Array(b64: string): Uint8Array {
  const clean = b64.replace(/-/g, '+').replace(/_/g, '/');
  const word = CryptoJS.enc.Base64.parse(clean);
  return wordArrayToUint8Array(word);
}

/**
 * 流式计算文件的 SHA256（十六进制小写，与协议一致）。
 * 分块从磁盘读取（先 stat 拿 size，再按 256KB 步长循环 read），内存占用恒定。
 */
export async function sha256OfFile(path: string): Promise<string> {
  const hasher = CryptoJS.algo.SHA256.create();
  const CHUNK = 256 * 1024; // 256KB/块

  const stat = await RNFS.stat(path);
  const total = stat.size;
  let pos = 0;
  while (pos < total) {
    const len = Math.min(CHUNK, total - pos);
    // read 返回 base64 字符串，直接并入哈希。
    const chunk = await RNFS.read(path, len, pos, 'base64');
    hasher.update(CryptoJS.enc.Base64.parse(chunk));
    pos += len;
  }
  return hasher.finalize().toString();
}

export type VerifyFailureReason =
  | 'sha256_mismatch'
  | 'signature_invalid'
  | 'signature_missing'
  | 'file_missing'
  | 'platform_unsupported';

export interface VerifyResult {
  ok: boolean;
  reason?: VerifyFailureReason;
  detail?: string;
}

/**
 * 校验下载到的安装包。
 * @param filePath 本地临时文件路径
 * @param artifact 服务端下发的产物描述
 * @param version / build 用于 Ed25519 验签的规范化消息
 */
export async function verifyArtifact(
  filePath: string,
  artifact: OtaArtifact,
  version: string,
  build: number,
): Promise<VerifyResult> {
  const exists = await RNFS.exists(filePath);
  if (!exists) {
    return {ok: false, reason: 'file_missing', detail: filePath};
  }

  // ---- 第一道：SHA256 ----
  const actual = await sha256OfFile(filePath);
  const expected = artifact.sha256.toLowerCase();
  if (actual !== expected) {
    return {
      ok: false,
      reason: 'sha256_mismatch',
      detail: `期望 ${expected}，实际 ${actual}`,
    };
  }

  // ---- 第二道：Ed25519 签名 ----
  const sig = artifact.signature;
  if (!sig || sig.length === 0) {
    if (OTA_VERIFY_SIGNATURE) {
      return {ok: false, reason: 'signature_missing'};
    }
    // 调试期允许仅凭 SHA256 放行（需显式关闭 OTA_VERIFY_SIGNATURE）。
    return {ok: true};
  }

  try {
    const prefix = 'ed25519:';
    const b64 = sig.trim().startsWith(prefix) ? sig.trim().slice(prefix.length) : sig.trim();
    const sigBytes = base64ToUint8Array(b64);
    const pubBytes = base64ToUint8Array(OTA_PUBLIC_KEY_BASE64);
    const msg = utf8ToUint8Array(
      otaSignatureMessage(version, build, artifact.sha256, artifact.url),
    );
    const ok = await ed.verify(sigBytes, msg, pubBytes);
    if (!ok) {
      return {ok: false, reason: 'signature_invalid', detail: '签名与内置公钥不匹配，安装包可能不是官方发布'};
    }
  } catch (e) {
    return {ok: false, reason: 'signature_invalid', detail: String(e)};
  }

  return {ok: true};
}

/** 供单测 / 调试：从 Base64 公钥字符串取字节。 */
export function publicKeyBytesForTest(): Uint8Array {
  return getPublicKeyBytes();
}
