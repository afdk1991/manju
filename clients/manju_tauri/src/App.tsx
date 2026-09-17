import React, { useEffect } from "react";
import { HashRouter, Routes, Route, NavLink } from "react-router-dom";
import { Home } from "./screens/Home";
import { Detail } from "./screens/Detail";
import { Player } from "./screens/Player";
import { Search } from "./screens/Search";
import { UpdaterModal } from "./updater/UpdaterModal";
import { useUpdater } from "./updater/useUpdater";

export function App() {
  const { check } = useUpdater();

  // 启动时检查更新（也可在设置页手动触发）。
  useEffect(() => {
    check();
  }, [check]);

  return (
    <HashRouter>
      <div className="app">
        <header className="topbar">
          <div className="brand">漫剧 · Manju</div>
          <nav className="nav">
            <NavLink to="/" end>
              首页
            </NavLink>
            <NavLink to="/search">搜索</NavLink>
          </nav>
        </header>
        <main className="content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/series/:id" element={<Detail />} />
            <Route path="/play/:episodeId" element={<Player />} />
            <Route path="/search" element={<Search />} />
          </Routes>
        </main>
      </div>
      <UpdaterModal />
    </HashRouter>
  );
}
