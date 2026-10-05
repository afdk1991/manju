import { useEffect, useState } from 'react';
import { api, seenSet } from '../api';
import type { Home as HomeData } from '../types';
import { SeriesCover } from '../components/common';

export default function Home({ go }: { go: (h: string) => void }) {
  const [data, setData] = useState<HomeData | null>(null);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setSeen(seenSet());
    const ac = new AbortController();
    api.home(ac.signal).then(setData).catch((e: Error) => setErr(e.message));
    return () => ac.abort();
  }, []);

  if (err) return <div className="center err">加载失败：{err}</div>;
  if (!data) return <div className="center">加载中…</div>;

  return (
    <>
      <div className="hero">
        <h1>漫剧 Manju</h1>
        <p>在线观影 · 站内自有内容</p>
      </div>

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
        漫剧 Manju · 站内自有内容可直接播放。
      </div>
    </>
  );
}
