/**
 * GET /api/v1/search —— 剧集搜索（无服务器版）
 *
 * 从构建打包的 data/series_index.json 全量索引中做内存过滤
 * （22 部量级，毫秒内完成），排序优先级：标题命中 > 标签命中 > 简介命中。
 *
 * query: q(必填) page(默认1) size(默认20)
 */
import { json, loadData } from '../../../_lib/data.js';

export function onRequestGet(context) {
  const url = new URL(context.request.url);
  const q = (url.searchParams.get('q') || '').trim().toLowerCase();
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const size = Math.min(50, Math.max(1, parseInt(url.searchParams.get('size') || '20', 10) || 20));

  if (!q) {
    return json({ items: [], page: { page, size, total: 0, has_more: false } });
  }

  const data = loadData('series_index.json') || { items: [] };
  const scored = [];
  for (const s of data.items) {
    const title = (s.title || '').toLowerCase();
    const synopsis = (s.synopsis || '').toLowerCase();
    const tags = (s.tags || []).join(' ').toLowerCase();
    let rank = 0;
    if (title.includes(q)) rank = 3;
    else if (tags.includes(q)) rank = 2;
    else if (synopsis.includes(q)) rank = 1;
    if (rank > 0) scored.push({ ...s, _rank: rank });
  }
  scored.sort((a, b) => b._rank - a._rank || (b.views || 0) - (a.views || 0));

  const start = (page - 1) * size;
  const items = scored.slice(start, start + size).map(({ _rank, ...rest }) => rest);
  return json({
    items,
    page: { page, size, total: scored.length, has_more: start + size < scored.length },
  });
}
