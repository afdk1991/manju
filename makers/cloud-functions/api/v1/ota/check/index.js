/**
 * GET /api/v1/ota/check —— OTA 更新检查（无服务器版）
 *
 * 实现 spec/ota-protocol.v1.md 全部语义：
 *   200 {has_update, policy, release, store_fallback}
 *   204 无更新 / 304 If-None-Match（ETag = build-version）/ 400 invalid_platform
 *   404 no_artifact / 409 rollback_attempt
 *   灰度：crc32(device_id) % 100 >= rollout_percent -> 204
 *   iOS / HarmonyOS：强制返回 store_fallback（platform_restricted）
 *
 * 数据来源：data/releases.json（构建时由 export_static.py 生成，随构建打包）
 *           + Blob 增量发布（admin POST /api/v1/admin/releases 写入）
 */
import { getStore } from '@edgeone/pages-blob';
import {
  json, cmpVer, crc32, loadData, loadExtraReleases,
} from '../../../../_lib/data.js';

const VALID_PLATFORMS = ['android', 'ios', 'harmonyos', 'windows', 'macos', 'linux'];
const DESKTOP = ['windows', 'macos', 'linux'];
const STORE_ONLY = ['ios', 'harmonyos'];

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const platform = (url.searchParams.get('platform') || '').toLowerCase();
  const arch = url.searchParams.get('arch') || '';
  const channel = url.searchParams.get('channel') || 'stable';
  const version = url.searchParams.get('version') || '';
  const build = parseInt(url.searchParams.get('build') || '0', 10);
  const deviceId = url.searchParams.get('device_id') || '';
  const abi = url.searchParams.get('abi') || '';

  if (!VALID_PLATFORMS.includes(platform)) {
    return json({ code: 'invalid_platform', message: `platform 必须是 ${VALID_PLATFORMS.join('/')}` }, 400);
  }

  // 数据源：静态初始发布 + Blob 增量发布（admin 发布写入）；Blob 不可用时降级为静态
  const data = loadData('releases.json') || { releases: [] };
  let extra = null;
  try {
    extra = await loadExtraReleases(getStore('manju-ota'));
  } catch {
    extra = null;
  }
  const all = [...(extra || []), ...data.releases];

  const candidates = all.filter((r) => (
    (r.platform || '') === platform
    && (r.channel || 'stable') === channel
    && (!r.arch || !arch || r.arch === arch)
    && (!r.abi || !abi || r.abi === abi)
  ));
  if (!candidates.length) {
    return json({ code: 'no_artifact', message: `该平台/架构/通道无可用发布：${platform}/${arch || '*'}/${channel}` }, 404);
  }

  // 取版本最高的发布（build 优先，version 兜底）
  const latest = candidates.reduce((a, b) => (
    b.build > a.build || (b.build === a.build && cmpVer(b.version, a.version) > 0) ? b : a
  ));

  const etag = `"${latest.build}-${latest.version}"`;
  if (context.request.headers.get('If-None-Match') === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  // 客户端已是最新 -> 无更新
  if (build >= latest.build) {
    return new Response(null, { status: 204 });
  }
  // 客户端版本高于最新（异常/降级尝试，channel 切换由客户端负责）-> 409
  if (build > latest.build) {
    return json({ code: 'rollback_attempt', message: '客户端构建号高于服务器已知版本' }, 409);
  }

  // 灰度分桶
  if (typeof latest.rollout_percent === 'number' && latest.rollout_percent < 100) {
    const bucket = crc32(deviceId) % 100;
    if (bucket >= latest.rollout_percent) {
      return new Response(null, { status: 204 });
    }
  }

  // 策略矩阵（spec §4）
  const belowMin = latest.min_supported_version && cmpVer(version, latest.min_supported_version) < 0;
  let policy = 'suggest';
  if (belowMin) policy = 'forced';
  else if (DESKTOP.includes(platform)) policy = 'silent';

  const storeOnly = STORE_ONLY.includes(platform);
  // iOS / HarmonyOS 一律跳商店（不允许静默安装；forced 也降级为 suggest 由客户端引导跳转）
  if (storeOnly && policy === 'forced') policy = 'suggest';

  const release = {
    version: latest.version,
    build: latest.build,
    channel: latest.channel || 'stable',
    released_at: latest.released_at || '',
    min_supported_version: latest.min_supported_version || '',
    notes_i18n: latest.notes_i18n || {},
    artifact: latest.artifact || null,
  };
  if (latest.delta) release.delta = latest.delta;

  const store_fallback = storeOnly
    ? { enabled: true, url: latest.store_url || '', reason: 'platform_restricted' }
    : { enabled: false, url: '', reason: '' };

  return json({ has_update: true, policy, release, store_fallback }, 200, { ETag: etag });
}
