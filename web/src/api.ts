import type {
  Category, Episode, ExternalIndex, ExternalList, Home, Series,
} from './types';

/**
 * 数据层：所有请求都走带 .json 后缀的静态路径。
 *
 * 红线：不要在 edgeone.json 里新增 "source 以 :param 结尾、destination 再拼后缀"
 * 的 rewrite —— 那会把 /api/v1/series/x.json 重写成 x.json.json 导致全站 404。
 */
async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  // 必须显式 same-origin：EdgeOne 预览域名在路由前有 SSO 鉴权，
  // 靠 eo_token Cookie 放行。若用 credentials:'omit' 丢弃 Cookie，
  // XHR 会被拦成 401（本地无 SSO 测不出，只有线上浏览器实测才暴露）。
  const res = await fetch(path, { signal, credentials: 'same-origin' });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return (await res.json()) as T;
}

const enc = encodeURIComponent;

export const api = {
  home: (s?: AbortSignal) => getJson<Home>('api/v1/home', s),
  categories: (s?: AbortSignal) => getJson<{ items: Category[] }>('api/v1/categories', s),
  seriesList: (s?: AbortSignal) => getJson<{ items: Series['id'] extends string ? Series[] : never }>('api/v1/series', s),
  series: (id: string, s?: AbortSignal) => getJson<Series>(`api/v1/series/${enc(id)}`, s),
  episodes: (seriesId: string, s?: AbortSignal) =>
    getJson<{ items: Episode[] }>(`api/v1/series/${enc(seriesId)}/episodes`, s),
  episode: (epId: string, s?: AbortSignal) => getJson<Episode>(`api/v1/episodes/${enc(epId)}`, s),
  extIndex: (s?: AbortSignal) => getJson<ExternalIndex>('external/index', s),
  extList: (cat: string, s?: AbortSignal) => getJson<ExternalList>(`external/${enc(cat)}`, s),
};

/* ---------- 本地状态：已看过 / 续播进度 ---------- */

const SEEN_KEY = 'manju:seen';
const progKey = (epId: string) => `manju:progress:${epId}`;

export function seenSet(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]') as string[]);
  } catch {
    return new Set();
  }
}

export function markSeen(id: string): void {
  const set = seenSet();
  if (set.has(id)) return;
  set.add(id);
  localStorage.setItem(SEEN_KEY, JSON.stringify([...set]));
}

export function saveProgress(epId: string, t: number): void {
  try {
    localStorage.setItem(progKey(epId), String(Math.floor(t)));
  } catch { /* 隐私模式下忽略 */ }
}

export function loadProgress(epId: string): number {
  try {
    return Number(localStorage.getItem(progKey(epId)) || 0);
  } catch {
    return 0;
  }
}
