import { useEffect, useState } from 'react';
import { api, seenSet } from '../api';
import type { ExternalIndex, Home as HomeData } from '../types';
import { SeriesCover } from '../components/common';

export default function Home({ go }: { go: (h: string) => void }) {
  const [data, setData] = useState<HomeData | null>(null);
  const [ext, setExt] = useState<ExternalIndex | null>(null);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setSeen(seenSet());
    const ac = new AbortController();
    api.home(ac.signal).then(setData).catch((e: Error) => setErr(e.message));
    api.extIndex(ac.signal).then(setExt).catch(() => { /* 外部片单可选 */ });
    return () => ac.abort();
  }, []);

  if (err) return <div className="center err">加载失败：{err}</div>;
  if (!data) return <div className="center">加载中…</div>;

  return (
    <>
      <div className="hero">
        <h1>漫剧 Manju</h1>
        <p>在线观影 · 站内自有内容与外部片单索引</p>
      </div>

      {ext && ext.catalogs.length > 0 && (
        <div className="section">
          <h2>外部片单索引<span className="more">共 {ext.total ?? 0} 条</span></h2>
          <div className="grid">
            {ext.catalogs.map((c) => (
              <div className="card" key={c.category} onClick={() => go(`#/external/${c.category}`)}
                   role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && go(`#/external/${c.category}`)}>
                <div className="meta" style={{ padding: 16 }}>
                  <div className="t">{c.category_label}</div>
                  <div className="info"><span>{c.total ?? 0} 条</span><span>跳转观看</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.sections.map((s) => (
        <div className="section" key={s.id}>
          <h2>{s.title}</h2>
          <div className="grid">
            {s.items.map((it) => (
              <SeriesCover key={it.id} item={it} seen={seen.has(it.id)} onClick={() => go(`#/series/${it.id}`)} />
            ))}
          </div>
        </div>
      ))}

      <div className="foot">
        漫剧 Manju · 站内自有内容可直接播放；外部片单仅提供发现与跳转，版权归原平台所有。
      </div>
    </>
  );
}
