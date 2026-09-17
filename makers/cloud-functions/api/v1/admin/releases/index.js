/**
 * /api/v1/admin/releases —— OTA 发布管理（无服务器版）
 *
 * GET  -> 200 {items:[...]}：Blob 增量发布 + 静态初始发布（data/releases.json）合并
 * POST -> 201：发布新版本（管理员密钥校验 + 本地 Ed25519 签名，持久化到 Blob）
 *
 * 环境变量（Makers 控制台配置，勿写入代码仓库）：
 *   MANJU_ADMIN_KEY          管理员密钥（与 admin/index.html 输入框一致）
 *   MANJU_OTA_PRIVATE_KEY    Ed25519 私钥 PKCS8 PEM（对应 keys/ota_private.pem）
 *
 * 签名规范（与本地 Python 版一致）：ed25519:<base64(sign(version|build|sha256|url))>
 */
import { createPrivateKey, sign } from 'node:crypto';
import { getStore } from '@edgeone/pages-blob';
import { json, loadData, loadExtraReleases, signaturePayload } from '../../../../_lib/data.js';

const VALID_PLATFORMS = ['android', 'ios', 'harmonyos', 'windows', 'macos', 'linux'];
const VALID_CHANNELS = ['stable', 'beta', 'nightly'];

export async function onRequestGet(context) {
  const store = getStore('manju-ota');
  const extra = await loadExtraReleases(store);
  const data = loadData('releases.json') || { releases: [] };
  const merged = [...(extra || []), ...data.releases];
  return json({ items: merged });
}

export async function onRequestPost(context) {
  const adminKey = context.env.MANJU_ADMIN_KEY || '';
  const given = context.request.headers.get('X-Admin-Key') || '';
  if (!adminKey || given !== adminKey) {
    return json({ code: 'forbidden', message: '管理员密钥错误或未配置 MANJU_ADMIN_KEY' }, 401);
  }

  const body = await context.request.json().catch(() => null);
  if (!body) return json({ code: 'invalid_body', message: 'body 需为 JSON' }, 400);
  if (!VALID_PLATFORMS.includes(body.platform)) {
    return json({ code: 'invalid_platform', message: `platform 必须是 ${VALID_PLATFORMS.join('/')}` }, 400);
  }
  if (!VALID_CHANNELS.includes(body.channel || 'stable')) {
    return json({ code: 'invalid_channel', message: `channel 必须是 ${VALID_CHANNELS.join('/')}` }, 400);
  }
  if (!body.version || !Number.isInteger(Number(body.build))) {
    return json({ code: 'invalid_body', message: 'version 与 build 必填' }, 400);
  }
  const artifact = body.artifact || null;
  if (artifact && !artifact.url) {
    return json({ code: 'invalid_body', message: 'artifact.url 必填' }, 400);
  }

  // 签名（仅当具备私钥且 artifact 提供 url/sha256）
  let signature = '';
  const privPem = context.env.MANJU_OTA_PRIVATE_KEY || '';
  if (artifact && privPem && artifact.sha256) {
    try {
      const key = createPrivateKey(privPem);
      const payload = signaturePayload(body.version, Number(body.build), artifact.sha256, artifact.url);
      const sig = sign(null, Buffer.from(payload, 'utf8'), key);
      signature = `ed25519:${sig.toString('base64')}`;
    } catch {
      return json({ code: 'sign_error', message: '私钥格式错误，无法签名' }, 500);
    }
  }

  const release = {
    platform: body.platform,
    arch: body.arch || '',
    channel: body.channel || 'stable',
    version: body.version,
    build: Number(body.build),
    released_at: body.released_at || new Date().toISOString(),
    min_supported_version: body.min_supported_version || '',
    notes_i18n: body.notes_i18n || {},
    rollout_percent: body.rollout_percent === undefined ? 100 : Number(body.rollout_percent),
    store_url: body.store_url || '',
  };
  if (artifact) {
    release.artifact = {
      type: artifact.type || 'exe',
      url: artifact.url,
      size: Number(artifact.size) || 0,
      sha256: artifact.sha256 || '',
      signature: signature || artifact.signature || '',
      install_args: Array.isArray(artifact.install_args) ? artifact.install_args : [],
    };
  }

  const store = getStore('manju-ota');
  const existing = (await loadExtraReleases(store)) || [];
  existing.unshift(release);
  await store.setJSON('ota/releases', existing);

  return json({ item: release }, 201);
}
