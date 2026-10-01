import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Episode } from '../types';
import Player from '../components/Player';
import { Attribution } from '../components/common';

export default function Watch({ epId, go }: { epId: string; go: (h: string) => void }) {
  const [ep, setEp] = useState<Episode | null>(null);
  const [next, setNext] = useState<Episode | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    setEp(null); setNext(null); setErr(null);
    api.episode(epId, ac.signal)
      .then(async (e) => {
        setEp(e);
        try {
          const r = await api.episodes(e.series_id, ac.signal);
          const list = (r.items || []).slice().sort((a, b) => a.index - b.index);
          const i = list.findIndex((x) => x.id === e.id);
          if (i >= 0 && i + 1 < list.length) setNext(list[i + 1]);
        } catch { /* 拿不到列表就不显示下一集 */ }
      })
      .catch((ex: Error) => setErr(ex.message));
    return () => ac.abort();
  }, [epId]);

  if (err) return <div className="center err">加载失败：{err}</div>;
  if (!ep) return <div className="center">加载中…</div>;

  return (
    <>
      <Player ep={ep} onNext={next ? () => go(`#/watch/${next.id}`) : undefined} />
      <div className="now">
        <h1>{ep.title || '正片'} · 第 {ep.index} 集</h1>
        <p>
          {ep.duration_sec ? `${Math.round(ep.duration_sec / 60)} 分钟 · ` : ''}
          {(ep.sources || []).map((s) => s.container.toUpperCase()).join(' / ')}
          {' · 片源均来自本站'}
        </p>
        <p style={{ marginTop: 8 }}>
          <a href={`#/series/${ep.series_id}`}>← 返回剧集详情</a>
          {next && (
            <>
              {'　'}
              <button className="btn" onClick={() => go(`#/watch/${next.id}`)}>下一集 →</button>
            </>
          )}
        </p>
      </div>
      <div style={{ marginTop: 14 }}>
        <Attribution text="本集为本站自有 AI 生成内容，纯原创，全程站内播放，不依赖任何第三方 CDN。" />
      </div>
    </>
  );
}
