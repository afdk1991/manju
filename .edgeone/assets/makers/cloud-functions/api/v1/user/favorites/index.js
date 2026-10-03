/**
 * /api/v1/user/favorites —— 用户收藏（无服务器版）
 *
 * 鉴权简化：以 X-User-Id 请求头区分用户（原 FastAPI 版为 JWT bearer，
 * Makers 演示版用请求头标识；生产环境应接入 Makers Agents 或自建鉴权）。
 * 数据持久化到 Blob 命名空间 manju-user-data，key = users/<uid>/favorites。
 *
 * GET    -> 200 {items: [{series_id, created_at}]}
 * POST   -> body {series_id} -> 201
 * DELETE -> body {series_id} -> 204
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
  const list = (await store.get(`users/${uid}/favorites`, { type: 'json' })) || [];
  return json({ items: list });
}

export async function onRequestPost(context) {
  const uid = uidOf(context);
  if (!uid) return json({ code: 'unauthorized', message: '缺少 X-User-Id 请求头' }, 401);
  const body = await context.request.json().catch(() => null);
  if (!body || !body.series_id) return json({ code: 'invalid_body', message: 'body 需包含 series_id' }, 400);

  const store = getStore('manju-user-data');
  const key = `users/${uid}/favorites`;
  const list = (await store.get(key, { type: 'json', consistency: 'strong' })) || [];
  if (!list.some((x) => x.series_id === body.series_id)) {
    list.push({ series_id: body.series_id, created_at: new Date().toISOString() });
    await store.setJSON(key, list);
  }
  return json({ items: list }, 201);
}

export async function onRequestDelete(context) {
  const uid = uidOf(context);
  if (!uid) return json({ code: 'unauthorized', message: '缺少 X-User-Id 请求头' }, 401);
  const body = await context.request.json().catch(() => null);
  if (!body || !body.series_id) return json({ code: 'invalid_body', message: 'body 需包含 series_id' }, 400);

  const store = getStore('manju-user-data');
  const key = `users/${uid}/favorites`;
  const list = (await store.get(key, { type: 'json', consistency: 'strong' })) || [];
  const next = list.filter((x) => x.series_id !== body.series_id);
  await store.setJSON(key, next);
  return new Response(null, { status: 204 });
}
