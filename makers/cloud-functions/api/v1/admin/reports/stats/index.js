/**
 * GET /api/v1/admin/reports/stats —— OTA 上报统计（无服务器版）
 *
 * 从 Blob（manju-ota-reports）聚合事件上报：
 *   by_event / by_platform / by_result(成功|失败) / total / latest
 */
import { getStore } from '@edgeone/pages-blob';
import { json } from '../../../../_lib/data.js';

export async function onRequestGet(context) {
  const adminKey = context.env.MANJU_ADMIN_KEY || '';
  const given = context.request.headers.get('X-Admin-Key') || '';
  if (!adminKey || given !== adminKey) {
    return json({ code: 'forbidden', message: '管理员密钥错误或未配置 MANJU_ADMIN_KEY' }, 401);
  }

  const store = getStore('manju-ota-reports');
  const { blobs } = await store.list({ prefix: 'events/' });
  const byEvent = {};
  const byPlatform = {};
  const byResult = { success: 0, failed: 0 };
  const samples = [];
  let total = 0;

  // 演示规模下逐个读取聚合；数据量大时可改为定时任务预聚合
  for (const b of blobs) {
    const rec = await store.get(b.key, { type: 'json' }).catch(() => null);
    if (!rec) continue;
    total += 1;
    byEvent[rec.event] = (byEvent[rec.event] || 0) + 1;
    const pf = rec.platform || 'unknown';
    byPlatform[pf] = (byPlatform[pf] || 0) + 1;
    if (rec.event === 'installed' || rec.event === 'downloaded') byResult.success += 1;
    if (rec.event === 'failed') byResult.failed += 1;
    if (samples.length < 20) samples.push(rec);
  }

  return json({
    total,
    by_event: byEvent,
    by_platform: byPlatform,
    by_result: byResult,
    latest: samples,
  });
}
