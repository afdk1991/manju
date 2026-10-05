import { useEffect, useState } from 'react';
import { api } from '../api';
import type { ExternalIndex, ExternalList } from '../types';
import { Attribution, ExtCover } from '../components/common';

const STEP = 60;

/** #/external —— 外部片单分类页 */
export function ExternalIndex({ go }: { go: (h: string) => void }) {
  const [idx, setIdx] = useState<ExternalIndex | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    api.extIndex(ac.signal).then(setIdx).catch((e: Error) => setErr(e.message));
    return () => ac.abort();
  }, []);

  if (err) return <div className="center err">加载失败：{err}</div>;
  if (!idx) return <div className="center">加载中…</div>;

  return (
    <>
      <div className="hero">
        <h1>外部片单索引</h1>
        <p>{idx.provider_label || '第三方平台'} · 共 {idx.total ?? 0} 条 · 仅含公开元数据</p>
      </div>
      <div style={{ margin: '14px 0' }}>
        <Attribution text={idx.attribution} provider={idx.provider_label} />
      </div>
      <div className="grid">
        {idx.catalogs.map((c) => (
          <div className="card" key={c.category} onClick={() => go(`#/external/${c.category}`)}
               role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && go(`#/external/${c.category}`)}>
            <div className="meta" style={{ padding: 16 }}>
              <div className="t">{c.category_label}</div>
              <div className="info"><span>{c.total ?? 0} 条</span><span>站内播放</span></div>
            </div>
          </div>
        ))}
      </div>
      <p style={{ marginTop: 16 }}><a href="#/">← 返回首页</a></p>
    </>
  );
}

/** #/external/:cat —— 外部片单列表（分批加载） */
export function ExternalList({ cat, go }: { cat: string; go: (h: string) => void }) {
  const [data, setData] = useState<ExternalList | null>(null);
  const [shown, setShown] = useState(STEP);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    setData(null); setShown(STEP); setErr(null);
    api.extList(cat, ac.signal).then(setData).catch((e: Error) => setErr(e.message));
    return () => ac.abort();
  }, [cat]);

  if (err) return <div className="center err">加载失败：{err}</div>;
  if (!data) return <div className="center">加载中…</div>;

  const items = data.items || [];
  const slice = items.slice(0, shown);

  return (
    <>
      <div className="hero">
        <h1>{data.category_label || cat}</h1>
        <p>共 {data.total ?? items.length} 条 · 点击卡片站内播放</p>
        <p style={{ marginTop: 6 }}><a href="#/external">← 返回分类</a></p>
      </div>
      <div style={{ margin: '14px 0' }}>
        <Attribution text={data.attribution} provider={data.category_label} />
      </div>
      <div className="grid">
        {slice.map((it) => (
          <ExtCover key={it.id} item={it} onClick={() => go(`#/ext/${cat}/${it.id}`)} />
        ))}
      </div>
      {shown < items.length && (
        <div style={{ textAlign: 'center', marginTop: 18 }}>
          <button className="btn" onClick={() => setShown((n) => n + STEP)}>
            加载更多（{shown} / {items.length}）
          </button>
        </div>
      )}
    </>
  );
}

/**
 * #/ext/:cat/:id —— 站内播放页（iframe 嵌入原站播放器）。
 */
export function ExtGate({ cat, id }: { cat: string; id: string; go: (h: string) => void }) {
  const [data, setData] = useState<ExternalList | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    api.extList(cat, ac.signal).then(setData).catch((e: Error) => setErr(e.message));
    return () => ac.abort();
  }, [cat]);

  if (err) return <div className="center err">加载失败：{err}</div>;
  if (!data) return <div className="center">加载中…</div>;

  const it = (data.items || []).find((x) => String(x.id) === String(id));
  if (!it) return <div className="center">未找到该条目　<a href={`#/external/${cat}`}>返回列表</a></div>;

  // 从 detail_url 提取 series_id，构造播放器 URL
  const m = it.detail_url && it.detail_url.match(/series_id=(\d+)/);
  const playerUrl = m ? `https://hongguoduanju.com/player/${m[1]}` : it.detail_url;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '12px 16px' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
        <img src={it.cover_url} alt={it.title} style={{ width: 80, borderRadius: 8 }} />
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: '0 0 4px' }}>{it.title}</h2>
          <div style={{ fontSize: 13, opacity: 0.7 }}>
            {it.source_label || '第三方平台'} · {it.category_label || cat} · {it.episodes_text || '—'}
          </div>
        </div>
        <a href={it.detail_url} target="_blank" rel="noopener" style={{ fontSize: 13 }}>原站打开 ↗</a>
      </div>

      <div style={{
        position: 'relative', width: '100%', aspectRatio: '16/9',
        background: '#000', borderRadius: 12, overflow: 'hidden'
      }}>
        <iframe
          src={playerUrl}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      </div>

      <Attribution text={data.attribution} provider={it.source_label} />
      <p style={{ marginTop: 12 }}><a href={`#/external/${cat}`}>← 返回列表</a></p>
    </div>
  );
}
