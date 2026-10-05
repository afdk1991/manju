import { useEffect, useState } from 'react';
import { api, seenSet } from '../api';
import type { Episode, Series } from '../types';

export default function SeriesPage({ id, go }: { id: string; go: (h: string) => void }) {
  const [s, setS] = useState<Series | null>(null);
  const [eps, setEps] = useState<Episode[]>([]);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setSeen(seenSet());
    const ac = new AbortController();
    setS(null); setEps([]); setErr(null);
    api.series(id, ac.signal)
      .then((d) => {
        setS(d);
        const loadEps = d.episodes?.length
          ? Promise.resolve(d.episodes)
          : api.episodes(id, ac.signal).then((r) => r.items || []);
        return loadEps.then((items) => {
          setEps(items);
          // 自动播放第一集
          if (items.length > 0) {
            go(`#/watch/${items[0].id}`);
          }
        });
      })
      .catch((e: Error) => setErr(e.message));
    return () => ac.abort();
  }, [id]);

  if (err) return <div className="center err">加载失败：{err}</div>;
  if (!s) return <div className="center">加载中…</div>;

  return (
    <>
      <div className="detail-hero">
        <div className="bg" style={{ backgroundImage: `url(${s.cover})` }} />
        <div className="inner">
          <img className="poster" src={s.cover} alt={s.title}
               onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />
          <div className="info">
            <h1>{s.title}</h1>
            <div className="meta-row">
              {[s.release_year, s.region, s.status, s.total_episodes ? `${s.total_episodes} 集` : '']
                .filter(Boolean).join(' · ')}
            </div>
            <div className="tags">{(s.tags || []).map((t) => <span key={t}>{t}</span>)}</div>
            <p className="synopsis">{s.synopsis}</p>
          </div>
        </div>
      </div>

      <div className="eplist-title">选集</div>
      <div className="eplist">
        {eps.map((e, i) => (
          <button
            key={e.id}
            className={`epbtn${seen.has(e.id) ? ' seen' : ''}`}
            onClick={() => go(`#/watch/${e.id}`)}
          >
            {e.title || `第 ${i + 1} 集`}
          </button>
        ))}
      </div>

      <span className="back-link" onClick={() => go('#/')}>← 返回首页</span>
    </>
  );
}
