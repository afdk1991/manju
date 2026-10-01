import type { ExternalItem, SeriesCard } from '../types';

export function SeriesCover({ item, seen, onClick }: {
  item: SeriesCard; seen?: boolean; onClick: () => void;
}) {
  return (
    <div className="card" onClick={onClick} role="button" tabIndex={0}
         onKeyDown={(e) => e.key === 'Enter' && onClick()}>
      <img className="cover" loading="lazy" src={item.cover} alt={item.title}
           onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />
      {seen && <span className="badge">已看过</span>}
      <div className="meta">
        <div className="t">{item.title}</div>
        <div className="info">
          <span>{item.total_episodes ? `${item.total_episodes} 集` : ''}</span>
          {item.score ? <span>{item.score.toFixed(1)}</span> : null}
        </div>
      </div>
    </div>
  );
}

export function ExtCover({ item, onClick }: { item: ExternalItem; onClick: () => void }) {
  return (
    <div className="card" onClick={onClick} role="button" tabIndex={0}
         onKeyDown={(e) => e.key === 'Enter' && onClick()}>
      <img className="cover" loading="lazy" src={item.cover_url} alt={item.title}
           onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />
      <div className="meta">
        <div className="t">{item.title}</div>
        <div className="info">
          <span>{item.episodes_text || ''}</span>
          <span>{item.source_label || ''}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * 版权与来源标注。
 * 外部片单只做发现与跳转，本站不存储、不转码、不代理任何视频；
 * 这一点必须在列表页、提示页等可见位置明示，不能只放页脚小字。
 */
export function Attribution({ text, provider }: { text?: string; provider?: string }) {
  const body = text || '本页仅含公开元数据与来源链接，不含视频与图片二进制内容。';
  return (
    <div className="notice">
      <b>来源与版权</b>
      {provider ? ` · ${provider}` : ''}
      <br />{body}
      <br />本站不存储、不转码、不代理任何视频；点击后前往原站观看。
    </div>
  );
}
