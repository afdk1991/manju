/**
 * 漫剧 Manju —— Makers Cloud Functions 共享辅助模块
 *
 * 本模块不导出 Function Handler（onRequest*），构建器会将其作为辅助模块
 * 复制到构建产物，供各入口文件 import 使用。
 *
 * 职责：读取随构建打包的 data/** 只读数据（edgeone.json includeFiles）、
 * 统一 JSON 响应、semver 比较、CRC32（灰度分桶，与 Python zlib.crc32 一致）。
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const LIB_DIR = dirname(fileURLToPath(import.meta.url));

/** 在多种候选路径中定位 data 文件（构建产物目录结构差异兜底）。 */
export function resolveDataFile(name) {
  const candidates = [
    join(process.cwd(), 'included_files', 'data', name), // Maker 产物：/var/user/included_files/data
    join(LIB_DIR, 'included_files', 'data', name),
    join(LIB_DIR, '../../data', name),        // 本地源码布局：cloud-functions/_lib -> 项目根/data
    join(LIB_DIR, '../../../data', name),
    join(process.cwd(), 'data', name),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

/** 读取 data 目录下的 JSON 数据文件；文件缺失返回 null。 */
export function loadData(name) {
  const p = resolveDataFile(name);
  if (!p) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

/** 统一 JSON 响应。 */
export function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=UTF-8', ...extraHeaders },
  });
}

/** semver 字符串比较：a > b 返回 1，a < b 返回 -1，相等返回 0。忽略预发布后缀。 */
export function cmpVer(a, b) {
  const pa = String(a).split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

/** CRC32（IEEE 802.3，与 Python zlib.crc32 一致），用于灰度分桶。 */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[i] = c >>> 0;
  }
  return t;
})();

export function crc32(str) {
  let c = 0xffffffff;
  for (let i = 0; i < str.length; i += 1) {
    c = CRC_TABLE[(c ^ str.charCodeAt(i)) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** 读取 Blob 存储中 ota/releases 增量发布记录；无则返回 null。 */
export async function loadExtraReleases(store) {
  const list = await store.get('ota/releases', { type: 'json', consistency: 'strong' }).catch(() => null);
  return Array.isArray(list) ? list : null;
}

/** 签名负载（与 Python sign_release 完全一致）。 */
export function signaturePayload(version, build, sha256, url) {
  return `${version}|${build}|${sha256}|${url}`;
}
