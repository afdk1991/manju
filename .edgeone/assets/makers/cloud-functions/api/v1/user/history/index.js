/**
 * /api/v1/user/history —— 用户播放历史（无服务器版）
 *
 * 鉴权与存储同 favorites（X-User-Id + Blob users/<uid>/history）。
 *
 * GET    -> 200 {items: [{series_id, episode_id, position_ms, completed, updated_at}]}
 * POST   -> body {series_id, episode_id, position_ms?, completed?} -> 201（按 episode_id upsert）
 */
import { getStore } from '@edgeone/pages-blob';
import { json } from '../../../../_lib/data.js';

function uidOf(context) {
  return (context.request.headers.get('X-User-Id') || '').trim().slice(0, 64);
}

export async function onRequestGet(context) {
  const uid = uidOf(context);
  if (!uid) return json({ code: 'unauthorized', message: '缺少 X-User-Id 请求头' }, 401);
  const store = getStore('manju-user-data');
  const list = (await store.get(`users/${uid}/history`, { type: 'json' })) || [];
  return json({ items: list });
}

export async function onRequestPost(context) {
  const uid = uidOf(context);
  if (!uid) return json({ code: 'unauthorized', message: '缺少 X-User-Id 请求头' }, 401);
  const body = await context.request.json().catch(() => null);
  if (!body || !body.series_id || !body.episode_id) {
    return json({ code: 'invalid_body', message: 'body 需包含 series_id 与 episode_id' }, 400);
  }

  const store = getStore('manju-user-data');
  const key = `users/${uid}/history`;
  const list = (await store.get(key, { type: 'json', consistency: 'strong' })) || [];
  const existing = list.find((x) => x.episode_id === body.episode_id);
  const entry = {
    series_id: body.series_id,
    episode_id: body.episode_id,
    position_ms: Number(body.position_ms) || 0,
    completed: Boolean(body.completed),
    updated_at: new Date().toISOString(),
  };
  if (existing) Object.assign(existing, entry);
  else list.unshift(entry);
  await store.setJSON(key, list);
  return json({ items: list }, 201);
}
