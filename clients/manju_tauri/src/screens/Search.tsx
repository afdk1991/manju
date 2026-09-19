import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { SeriesBase } from "../api/types";

export function Search() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SeriesBase[]>([]);
  const [searched, setSearched] = useState(false);
  const navigate = useNavigate();

  async function doSearch() {
    if (!q.trim()) return;
    setSearched(true);
    try {
      const r = await api.search(q.trim(), 1);
      setResults(r.items);
    } catch {
      setResults([]);
    }
  }

  return (
    <div className="search">
      <div className="search-bar">
        <input
          value={q}
          placeholder="搜索漫剧名称 / 标签"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && doSearch()}
        />
        <button onClick={doSearch}>搜索</button>
      </div>
      {searched && results.length === 0 && <div className="empty">未找到相关结果</div>}
      <div className="grid layout-grid">
        {results.map((s) => (
          <div key={s.id} className="card" onClick={() => navigate(`/series/${s.id}`)}>
            <img className="card-cover" src={s.cover} alt={s.title} loading="lazy" />
            <div className="card-title">{s.title}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
