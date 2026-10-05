import type { Category, Episode, Home, Series } from './types';

let homeCache: Home | null = null;
let allSeriesCache: Series[] = [];

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${path}${sep}_t=${Date.now()}`, { signal, credentials: 'same-origin' });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function loadHome(): Promise<Home> {
  if (homeCache) return homeCache;
  homeCache = await getJson<Home>('api/v1/home.json');
  allSeriesCache = homeCache.sections.reduce((acc, s) => [...acc, ...s.items], [] as Series[]);
  return homeCache;
}

export const api = {
  home: (s?: AbortSignal) => loadHome(),
  categories: async () => ({ items: [] as Category[] }),
  seriesList: async () => ({ total: allSeriesCache.length, items: allSeriesCache }),
  series: async (id: string, _s?: AbortSignal) => {
    await loadHome();
    const found = allSeriesCache.find(x => x.id === id);
    if (!found) throw new Error(`Series ${id} not found`);
    return found;
  },
  episodes: async (seriesId: string, _s?: AbortSignal) => {
    await loadHome();
    const found = allSeriesCache.find(x => x.id === seriesId);
    if (!found) return { items: [] };
    const eps = ((found as any).episodes || []) as Episode[];
    return { items: eps.map((e: any) => ({ id: e.id, title: e.title })) };
  },
  episode: async (epId: string, _s?: AbortSignal) => {
    await loadHome();
    for (const s of allSeriesCache) {
      const eps = ((s as any).episodes || []) as any[];
      const found = eps.find(e => e.id === epId);
      if (found) {
        return {
          id: epId,
          title: found.title,
          duration: 0,
          sources: [{ url: found.url, container: 'hls', quality: 'auto' }],
          subtitles: [],
        } as Episode;
      }
    }
    throw new Error(`Episode ${epId} not found`);
  },
};

const SEEN_KEY = 'manju:seen';
const progKey = (epId: string) => `manju:progress:${epId}`;

export function seenSet(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]') as string[]);
  } catch { return new Set(); }
}

export function markSeen(id: string): void {
  const set = seenSet();
  if (set.has(id)) return;
  set.add(id);
  localStorage.setItem(SEEN_KEY, JSON.stringify([...set]));
}

export function saveProgress(epId: string, t: number): void {
  try { localStorage.setItem(progKey(epId), String(Math.floor(t))); } catch {}
}

export function loadProgress(epId: string): number {
  try { return Number(localStorage.getItem(progKey(epId)) || 0); } catch { return 0; }
}