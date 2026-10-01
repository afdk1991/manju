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
              <div className="info"><span>{c.total ?? 0} 条</span><span>跳转观看</span></div>
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
        <p>共 {data.total ?? items.length} 条 · 仅含公开元数据，点击卡片前往原站观看</p>
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
 * #/ext/:cat/:id —— 跳转中间提示页。
 *
 * 保留 referrerpolicy=strict-origin-when-cross-origin 且刻意不用 noreferrer：
 * 本站性质是导流，保留 Referer 才便于证明导流属性；跨源默认只发 origin，不泄露具体路径。
 */
export function ExtGate({ cat, id, go }: { cat: string; id: string; go: (h: string) => void }) {
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

  return (
    <div className="gate">
      <img className="g-cover" src={it.cover_url} alt={it.title} />
      <h1>{it.title}</h1>
      <div className="kv">
        <span>来源</span><b>{it.source_label || '第三方平台'}</b>
        <span>分类</span><b>{it.category_label || cat}</b>
        <span>集数</span><b>{it.episodes_text || '—'}</b>
      </div>

      <Attribution text={data.attribution} provider={it.source_label} />

      <a
        className="go"
        href={it.detail_url}
        target="_blank"
        rel="noopener external"
        referrerPolicy="strict-origin-when-cross-origin"
        style={{ textAlign: 'center' }}
      >
        前往原站观看 →
      </a>
      <div className="url">{it.detail_url}</div>
      <p style={{ marginTop: 14 }}><a href={`#/external/${cat}`}>← 返回列表</a></p>
      <p style={{ marginTop: 6 }}>
        <button className="btn" onClick={() => go('#/')}>回首页</button>
      </p>
    </div>
  );
}
