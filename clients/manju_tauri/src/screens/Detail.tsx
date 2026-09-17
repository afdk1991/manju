import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { Episode, Series } from "../api/types";

export function Detail() {
  const { id } = useParams<{ id: string }>();
  const [series, setSeries] = useState<Series | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!id) return;
    Promise.all([api.getSeriesDetail(id), api.getEpisodes(id)])
      .then(([s, e]) => {
        setSeries(s);
        setEpisodes(e.items);
      })
      .catch(() => setSeries(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="empty">加载中…</div>;
  if (!series) return <div className="empty">未找到该剧集</div>;

  return (
    <div className="detail">
      <div className="detail-head">
        <img className="detail-cover" src={series.cover} alt={series.title} />
        <div>
          <h2>{series.title}</h2>
          <p className="detail-synopsis">{series.synopsis}</p>
          <div className="tags">
            {series.tags.map((t) => (
              <span key={t} className="tag">
                {t}
              </span>
            ))}
          </div>
          <div className="score">评分 {series.score.toFixed(1)} · 播放 {series.views}</div>
        </div>
      </div>

      <h3>选集</h3>
      <div className="episode-list">
        {episodes.map((ep) => (
          <button
            key={ep.id}
            className="episode-item"
            onClick={() => navigate(`/play/${ep.id}`)}
          >
            第 {ep.index} 集 · {ep.title}
            {!ep.is_free ? "（VIP）" : ""}
          </button>
        ))}
      </div>
    </div>
  );
}
