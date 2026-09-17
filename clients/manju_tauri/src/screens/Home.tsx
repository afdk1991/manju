import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { HomeSection, SeriesBase } from "../api/types";

export function Home() {
  const [sections, setSections] = useState<HomeSection[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api
      .getHome("zh-CN")
      .then((r) => setSections(r.sections))
      .catch(() => setSections([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="empty">加载中…</div>;

  return (
    <div className="home">
      {sections.length === 0 && <div className="empty">暂无推荐内容</div>}
      {sections.map((sec) => (
        <section key={sec.id} className="section">
          <h3 className="section-title">{sec.title}</h3>
          <div className={`grid layout-${sec.layout}`}>
            {sec.items.map((s: SeriesBase) => (
              <Card key={s.id} series={s} onClick={() => navigate(`/series/${s.id}`)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Card({ series, onClick }: { series: SeriesBase; onClick: () => void }) {
  return (
    <div className="card" onClick={onClick}>
      <img className="card-cover" src={series.cover} alt={series.title} loading="lazy" />
      <div className="card-title">{series.title}</div>
      <div className="card-sub">
        {series.status === "ongoing" ? "更新中" : "已完结"} · {series.total_episodes} 集
        {series.is_vip ? " · VIP" : ""}
      </div>
    </div>
  );
}
