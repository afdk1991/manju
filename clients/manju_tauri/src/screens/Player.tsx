import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import Hls from "hls.js";
import { api } from "../api/client";
import type { Episode, VideoSource } from "../api/types";

export function Player() {
  const { episodeId } = useParams<{ episodeId: string }>();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [sources, setSources] = useState<VideoSource[]>([]);
  const [current, setCurrent] = useState<VideoSource | null>(null);

  useEffect(() => {
    if (!episodeId) return;
    api.getEpisode(episodeId).then((ep) => {
      setEpisode(ep);
      const hls = ep.sources.find((s) => s.container === "hls");
      setSources(ep.sources);
      setCurrent(hls ?? ep.sources[0] ?? null);
    });
  }, [episodeId]);

  // 使用 hls.js 播放 HLS 流（m3u8）。
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !current) return;
    if (current.container !== "hls") {
      video.src = current.url;
      return;
    }
    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true });
      hls.loadSource(current.url);
      hls.attachMedia(video);
      return () => hls.destroy();
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari 原生支持 HLS。
      video.src = current.url;
    }
  }, [current]);

  if (!episode) return <div className="empty">加载中…</div>;

  return (
    <div className="player">
      <video ref={videoRef} className="video" controls autoPlay />
      <div className="quality-bar">
        清晰度：
        {sources.map((s) => (
          <button
            key={s.quality}
            className={s === current ? "q active" : "q"}
            onClick={() => setCurrent(s)}
          >
            {s.quality}
          </button>
        ))}
      </div>
      <div className="player-title">
        第 {episode.index} 集 · {episode.title}
      </div>
    </div>
  );
}
