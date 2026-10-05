import { useEffect, useMemo, useState } from 'react';
import { api, seenSet } from '../api';
import type { Home as HomeData, Series } from '../types';

export default function Home({ go }: { go: (h: string) => void }) {
  const [data, setData] = useState<HomeData | null>(null);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeCat, setActiveCat] = useState('all');

  useEffect(() => {
    setSeen(seenSet());
    const ac = new AbortController();
    api.home(ac.signal).then(setData).catch((e: Error) => setErr(e.message));
    return () => ac.abort();
  }, []);

  // 汇总所有卡片
  const allItems: Series[] = useMemo(() => {
    if (!data) return [];
    return data.sections.reduce((acc, s) => [...acc, ...s.items], [] as Series[]);
  }, [data]);

  // 提取所有分类标签
  const cats = useMemo(() => {
    const set = new Set<string>();
    allItems.forEach(it => (it.tags || []).forEach(t => set.add(t)));
    return ['all', ...Array.from(set)];
  }, [allItems]);

  // 搜索 + 分类过滤
  const filtered = useMemo(() => {
    return allItems.filter(it => {
      if (activeCat !== 'all' && !(it.tags || []).includes(activeCat)) return false;
      if (search && !it.title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [allItems, search, activeCat]);

  if (err) return <div className="center err">加载失败：{err}</div>;
  if (!data) return <div className="center">加载中…</div>;

  return (
    <>
      <div className="hero">
        <h1>漫剧 Manju</h1>
        <p>免费在线观看 · {allItems.length} 部漫剧短剧</p>
      </div>

      <div className="search-bar">
        <input
          type="text"
          placeholder="搜索漫剧短剧..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="cat-tabs">
        {cats.map(c => (
          <button
            key={c}
            className={`cat-tab ${activeCat === c ? 'active' : ''}`}
            onClick={() => setActiveCat(c)}
          >
            {c === 'all' ? '全部' : c}
          </button>
        ))}
      </div>

      <div className="section">
        <div className="section-head">
          <h2>{search || activeCat !== 'all' ? '搜索结果' : '全部漫剧'}</h2>
          <span className="count">{filtered.length} 部</span>
          <div className="line" />
        </div>
        <div className="grid">
          {filtered.map((it) => (
            <div
              key={it.id}
              className="card"
              onClick={() => go(`#/series/${it.id}`)}
            >
              <div className="cover-wrap">
                <img className="cover" src={it.cover} alt={it.title}
                     onError={(e) => { (e.currentTarget as HTMLImageElement).style.background = '#222'; }} />
                <div className="cover-grad" />
                <span className="ep-badge">{it.total_episodes || 1} 集</span>
              </div>
              <div className="meta">
                <div className="t">{it.title}</div>
                <div className="info">
                  <span>{it.release_year}</span>
                  <span>{it.score?.toFixed(1) || '8.0'}</span>
                </div>
                {(it.tags || []).slice(0, 1).map(t => <span key={t} className="tag">{t}</span>)}
              </div>
            </div>
          ))}
        </div>
        {filtered.length === 0 && <div className="center">没有找到相关内容</div>}
      </div>

      <div className="foot">
        漫剧 Manju · 免费在线观影 · 资源来自互联网公开接口
      </div>
    </>
  );
}
