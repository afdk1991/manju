import { useEffect, useState } from 'react';
import Home from './pages/Home';
import SeriesPage from './pages/Series';
import Watch from './pages/Watch';


function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash || '#/');
  useEffect(() => {
    const on = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

export default function App() {
  const hash = useHash();
  const go = (h: string) => { window.location.hash = h; };

  useEffect(() => { window.scrollTo(0, 0); }, [hash]);

  const path = hash.replace(/^#/, '') || '/';
  const seg = path.split('/').filter(Boolean);

  let body: JSX.Element;
  if (seg.length === 0) body = <Home go={go} />;
  else if (seg[0] === 'series' && seg[1]) body = <SeriesPage id={decodeURIComponent(seg[1])} go={go} />;
  else if (seg[0] === 'watch' && seg[1]) body = <Watch epId={decodeURIComponent(seg[1])} go={go} />;
  else body = <Home go={go} />;

  return (
    <>
      <header className="top">
        <div className="brand" onClick={() => go('#/')} style={{ cursor: 'pointer' }}>
          漫剧 Manju<span>在线观影</span>
        </div>
        <nav>
          <a href="#/">首页</a>
        </nav>
      </header>
      <div className="wrap">{body}</div>
    </>
  );
}
