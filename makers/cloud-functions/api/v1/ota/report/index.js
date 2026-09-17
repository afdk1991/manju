/**
 * POST /api/v1/ota/report —— OTA 事件上报（无服务器版）
 *
 * 持久化到 EdgeOne Makers Blob（命名空间 manju-ota-reports），
 * 供 /api/v1/admin/reports/stats 聚合展示。
 *
 * body: { device_id, platform, version, build, event, reason?, elapsed_ms? }
 * 返回 202（协议定义：接受但不保证持久化时序）。
 */
import { getStore } from '@edgeone/pages-blob';
import { json } from '../../../../_lib/data.js';

const EVENTS = ['downloaded', 'installed', 'failed', 'skipped', 'unsupported'];

export async function onRequestPost(context) {
  const body = await context.request.json().catch(() => null);
  if (!body || !body.device_id || !EVENTS.includes(body.event)) {
    return json({ code: 'invalid_body', message: `body 需包含 device_id 与 event(${EVENTS.join('/')})` }, 400);
  }
  const store = getStore('manju-ota-reports');
  const key = `events/${body.device_id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await store.setJSON(key, {
    device_id: String(body.device_id).slice(0, 64),
    platform: body.platform || '',
    version: body.version || '',
    build: Number(body.build) || 0,
    event: body.event,
    reason: body.reason || '',
    elapsed_ms: Number(body.elapsed_ms) || 0,
    received_at: new Date().toISOString(),
  });
  return new Response(null, { status: 202 });
}
