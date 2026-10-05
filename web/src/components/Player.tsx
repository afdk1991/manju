import { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import type { Episode } from '../types';
import { loadProgress, markSeen, saveProgress } from '../api';

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

function fmt(t: number): string {
  if (!Number.isFinite(t) || t < 0) t = 0;
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
}

interface Level { i: number; label: string }

interface Props {
  ep: Episode;
  onNext?: () => void;
}

/**
 * 专用站内播放器。
 *
 * 选源顺序：hls.js（本地打包，覆盖 Chrome/Edge/Firefox）→ Safari 原生 HLS → 渐进式直链。
 * hls.js 致命错误分级处理：网络错误重试加载、媒体错误尝试恢复、其余降级到直链。
 */
export default function Player({ ep, onNext }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hideTimer = useRef<number | null>(null);
  const marked = useRef(false);
  const lastSave = useRef(0);

  const [playing, setPlaying] = useState(false);
  const [dur, setDur] = useState(0);
  const [cur, setCur] = useState(0);
  const [bufEnd, setBufEnd] = useState(0);
  const [vol, setVol] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [levels, setLevels] = useState<Level[]>([]);
  const [level, setLevel] = useState(-1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const [showCtl, setShowCtl] = useState(true);
  const [menu, setMenu] = useState<null | 'rate' | 'quality'>(null);
  const [srcline, setSrcline] = useState('正在选择可用片源…');

  /* ---------- 选源 ---------- */
  const attach = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const sources = (ep.sources || []).filter((s) => s.url);

    const useDirect = (): boolean => {
      const TYPE: Record<string, string> = { mp4: 'video/mp4', webm: 'video/webm', ogg: 'video/ogg' };
      for (const c of ['mp4', 'webm', 'ogg']) {
        const s = sources.find((x) => (x.container || '').toLowerCase() === c);
        if (!s) continue;
        // canPlayType 返回空串表示明确不支持，跳过换下一个
        if (TYPE[c] && v.canPlayType(TYPE[c]) === '') continue;
        v.src = s.url;
        setSrcline(`${c.toUpperCase()} 直链（渐进式）`);
        return true;
      }
      const first = sources[0];
      if (first) {
        v.src = first.url;
        setSrcline(first.container || 'auto');
        return true;
      }
      return false;
    };

    const hlsSrc = sources.find((s) => (s.container || '').toLowerCase() === 'hls');

    if (hlsSrc && Hls.isSupported()) {
      const h = new Hls({ enableWorker: true });
      hlsRef.current = h;
      h.loadSource(hlsSrc.url);
      h.attachMedia(v);
      h.on(Hls.Events.MANIFEST_PARSED, () => {
        setLevels(
          h.levels.map((l, i) => ({
            i,
            label: l.height ? `${l.height}p` : l.bitrate ? `${Math.round(l.bitrate / 1000)}kbps` : `L${i + 1}`,
          })),
        );
        setSrcline(`HLS · ${hlsSrc.quality || 'auto'}（hls.js）`);
        // 拆集时优先从 start_sec 开始；否则续播进度
        const start = ep.start_sec || 0;
        const saved = loadProgress(ep.id);
        const target = start > 0 ? start : (saved > 1 ? saved : 0);
        if (target > 1 && target < (v.duration || Infinity) - 2) v.currentTime = target;
        void v.play().catch(() => { /* 自动播放被拦截，等用户点大播放键 */ });
      });
      h.on(Hls.Events.ERROR, (_e, data) => {
        if (!data || !data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) { h.startLoad(); return; }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) { h.recoverMediaError(); return; }
        h.destroy();
        hlsRef.current = null;
        if (!useDirect()) setError('没有可用的播放片源');
      });
      return;
    }

    if (hlsSrc && v.canPlayType('application/x-mpegURL')) {
      v.src = hlsSrc.url;
      setSrcline(`HLS · ${hlsSrc.quality || 'auto'}（原生）`);
      return;
    }

    if (!useDirect()) setError('该剧集没有可播放的片源');
  }, [ep]);

  useEffect(() => {
    attach();
    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [attach]);

  /* ---------- 媒体事件 ---------- */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => { setPlaying(true); setLoading(false); };
    const onPause = () => setPlaying(false);
    const onMeta = () => {
      setDur(v.duration || 0);
      // 直链/HLS 原生场景：元数据加载完后，优先跳到拆集起始点；否则续播进度
      const start = ep.start_sec || 0;
      if (start > 1 && start < (v.duration || Infinity) - 2) {
        v.currentTime = start;
        return;
      }
      const saved = loadProgress(ep.id);
      if (saved > 1 && saved < (v.duration || Infinity) - 2) v.currentTime = saved;
    };
    const onTime = () => {
      setCur(v.currentTime);
      const now = Date.now();
      if (now - lastSave.current > 3000) {
        lastSave.current = now;
        saveProgress(ep.id, v.currentTime);
      }
      if (!marked.current && v.duration && v.currentTime / v.duration > 0.8) {
        marked.current = true;
        markSeen(ep.id);
      }
    };
    const onProg = () => {
      if (v.buffered.length) setBufEnd(v.buffered.end(v.buffered.length - 1));
    };
    const onWaiting = () => setLoading(true);
    const onPlaying = () => { setLoading(false); setError(null); };
    const onEnd = () => { setPlaying(false); onNext?.(); };
    const onErr = () => setError('播放失败，可尝试重试或更换片源');

    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('loadedmetadata', onMeta);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('progress', onProg);
    v.addEventListener('waiting', onWaiting);
    v.addEventListener('playing', onPlaying);
    v.addEventListener('ended', onEnd);
    v.addEventListener('error', onErr);
    return () => {
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('loadedmetadata', onMeta);
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('progress', onProg);
      v.removeEventListener('waiting', onWaiting);
      v.removeEventListener('playing', onPlaying);
      v.removeEventListener('ended', onEnd);
      v.removeEventListener('error', onErr);
    };
  }, [ep, onNext]);

  /* ---------- 控制条自动隐藏 ---------- */
  const poke = useCallback(() => {
    setShowCtl(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (playing) setShowCtl(false);
    }, 2600);
  }, [playing]);

  useEffect(() => () => { if (hideTimer.current) window.clearTimeout(hideTimer.current); }, []);

  /* ---------- 操作 ---------- */
  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => setError('浏览器拦截了自动播放，请再次点击'));
    else v.pause();
  }, []);

  const seek = (e: React.PointerEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (!v || !dur) return;
    const r = e.currentTarget.getBoundingClientRect();
    v.currentTime = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1) * dur;
    setCur(v.currentTime);
  };

  const setVolAt = (e: React.PointerEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (!v) return;
    const r = e.currentTarget.getBoundingClientRect();
    const nv = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1);
    v.volume = nv;
    v.muted = nv === 0;
    setVol(nv);
    setMuted(nv === 0);
  };

  const applyRate = (r: number) => {
    const v = videoRef.current;
    if (v) v.playbackRate = r;
    setRate(r);
    setMenu(null);
  };

  const applyLevel = (i: number) => {
    if (hlsRef.current) hlsRef.current.currentLevel = i;
    setLevel(i);
    setMenu(null);
  };

  const toggleFull = useCallback(() => {
    const el = shellRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.().catch(() => setFull((f) => !f));
  }, []);

  const togglePip = async () => {
    const v = videoRef.current as (HTMLVideoElement & { requestPictureInPicture?: () => Promise<unknown> }) | null;
    if (!v?.requestPictureInPicture) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await v.requestPictureInPicture();
    } catch { /* 不支持则忽略 */ }
  };

  useEffect(() => {
    const onFs = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  /* ---------- 键盘快捷键 ---------- */
  const onKey = (e: React.KeyboardEvent) => {
    const v = videoRef.current;
    if (!v) return;
    switch (e.key) {
      case ' ': case 'k': e.preventDefault(); toggle(); break;
      case 'ArrowRight': case 'l': v.currentTime = Math.min(v.currentTime + 5, dur || v.currentTime + 5); break;
      case 'ArrowLeft': case 'j': v.currentTime = Math.max(v.currentTime - 5, 0); break;
      case 'ArrowUp': v.volume = Math.min(v.volume + 0.1, 1); setVol(v.volume); break;
      case 'ArrowDown': v.volume = Math.max(v.volume - 0.1, 0); setVol(v.volume); break;
      case 'm': v.muted = !v.muted; setMuted(v.muted); break;
      case 'f': toggleFull(); break;
      case 'Escape': setMenu(null); break;
      default: break;
    }
  };

  const pct = dur ? (cur / dur) * 100 : 0;
  const bpct = dur ? (bufEnd / dur) * 100 : 0;

  return (
    <div
      className={`player-shell${full ? ' full' : ''}`}
      ref={shellRef}
      tabIndex={0}
      onKeyDown={onKey}
      onMouseMove={poke}
      onMouseLeave={() => playing && setShowCtl(false)}
    >
      <video
        className="player-video"
        ref={videoRef}
        playsInline
        preload="metadata"
        poster={ep.thumbnail || undefined}
        onClick={toggle}
      >
        {(ep.subtitles || []).map((s) => (
          <track key={s.url} kind="subtitles" src={s.url} srcLang={s.lang || 'zh'} label={s.label || '字幕'} default />
        ))}
      </video>

      <div className="p-center">
        {!playing && !error && (
          <button className="p-bigplay" onClick={toggle} aria-label="播放">&#9654;</button>
        )}
      </div>

      <div className={`p-loading${loading && !error ? ' on' : ''}`}>
        <div className="spin" />
      </div>

      <div className={`p-error${error ? ' on' : ''}`}>
        <div>{error}</div>
        <button onClick={() => { setError(null); setLoading(true); attach(); }}>重试</button>
      </div>

      <div className={`p-controls${showCtl || !playing ? '' : ' hide'}`}>
        <div className="pseek" onPointerDown={seek}>
          <div className="track">
            <div className="buf" style={{ width: `${bpct}%` }} />
            <div className="cur" style={{ width: `${pct}%` }} />
          </div>
          <div className="knob" style={{ left: `${pct}%` }} />
        </div>

        <div className="prow">
          <button className="pbtn" onClick={toggle}>{playing ? '❚❚' : '▶'}</button>
          <span className="ptime">{fmt(cur)} / {fmt(dur)}</span>
          <button className="pbtn" onClick={() => { const v = videoRef.current; if (v) { v.muted = !v.muted; setMuted(v.muted); } }}>
            {muted ? '🔇' : '🔊'}
          </button>
          <div className="pvol" onPointerDown={setVolAt}>
            <div className="v" style={{ width: `${(muted ? 0 : vol) * 100}%` }} />
          </div>

          <span className="sp" />

          <button className="pbtn" onClick={() => setMenu(menu === 'rate' ? null : 'rate')}>{rate}×</button>
          {levels.length > 1 && (
            <button className="pbtn" onClick={() => setMenu(menu === 'quality' ? null : 'quality')}>
              {level < 0 ? '自动' : (levels.find((l) => l.i === level)?.label ?? '自动')}
            </button>
          )}
          <button className="pbtn" onClick={togglePip} title="画中画">⧉</button>
          <button className="pbtn" onClick={toggleFull} title="全屏">{full ? '⤡' : '⛶'}</button>
        </div>
      </div>

      <div className={`pmenu${menu === 'rate' ? ' on' : ''}`}>
        {RATES.map((r) => (
          <button key={r} className={r === rate ? 'on' : ''} onClick={() => applyRate(r)}>{r}×</button>
        ))}
      </div>
      <div className={`pmenu${menu === 'quality' ? ' on' : ''}`}>
        <button className={level < 0 ? 'on' : ''} onClick={() => applyLevel(-1)}>自动</button>
        {levels.map((l) => (
          <button key={l.i} className={l.i === level ? 'on' : ''} onClick={() => applyLevel(l.i)}>{l.label}</button>
        ))}
      </div>
      <span hidden>{srcline}</span>
    </div>
  );
}
