# -*- coding: utf-8 -*-
"""漫剧成片合成器：把 AI 生成的分镜静帧合成为可在站内播放的 HLS 片段。

用途：自有内容（AI 生成帧 + 自制字幕）在站内播放的唯一合规片源来源。
      不使用任何第三方视频，仅依赖 ffmpeg。

管线：
  1. 每张静帧 → Ken Burns（缓慢推轨 + 淡入淡出）短视频片段
  2. 所有片段 concat → 单条连续视频
  3. 加静音音轨 + HLS 切片（另输出一份渐进式 mp4 作为降级源）

用法：
  python scripts/build_episode_video.py \
      --frames content/generated/demo_ai_rebirth/ep01/frames \
      --out   server/data/artifacts/manju/demo_ai_rebirth/ep01/hls \
      --dur 5 --size 1280x720

  # 一并导出封面图与渐进式 mp4 降级源
  python scripts/build_episode_video.py --frames ... --out ... --thumb ../thumb.jpg --mp4 ../ep01.mp4
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

FFMPEG = shutil.which("ffmpeg") or "ffmpeg"
FFPROBE = shutil.which("ffprobe") or "ffprobe"

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp"}


def run(cmd: list[str]) -> None:
    p = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if p.returncode != 0:
        raise RuntimeError(
            f"ffmpeg 失败 (exit {p.returncode})\n"
            f"  命令: {' '.join(cmd[:6])} ...\n"
            f"  stderr: {p.stderr.strip()[-1200:]}"
        )


def collect_frames(frames_dir: Path) -> list[Path]:
    items = [p for p in sorted(frames_dir.iterdir()) if p.suffix.lower() in IMAGE_EXTS]
    if not items:
        raise SystemExit(f"[错误] {frames_dir} 下没有可用静帧")
    return items


def build_clip(src: Path, dst: Path, dur: float, fps: int, w: int, h: int,
               zoom_speed: float, max_zoom: float) -> None:
    """单帧 → Ken Burns 片段。先 2x 超采样再 zoompan，避免推轨边缘抖动。"""
    n_frames = int(round(dur * fps))
    fade_out_start = max(0.0, dur - 0.8)
    vf = (
        f"scale={w*2}:{h*2}:force_original_aspect_ratio=increase,"
        f"crop={w*2}:{h*2},"
        f"zoompan=z='min(1+{zoom_speed}*on,{max_zoom})'"
        f":x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
        f":d={n_frames}:s={w}x{h}:fps={fps},"
        f"fade=t=in:st=0:d=0.7,"
        f"fade=t=out:st={fade_out_start:.2f}:d=0.7,"
        "setsar=1,format=yuv420p"
    )
    run([
        FFMPEG, "-y", "-loop", "1", "-i", str(src),
        "-filter_complex", vf,
        "-frames:v", str(n_frames),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "24",
        "-an", str(dst),
    ])


def main() -> int:
    ap = argparse.ArgumentParser(description="静帧 -> HLS 成片")
    ap.add_argument("--frames", required=True, help="静帧目录（按文件名顺序）")
    ap.add_argument("--out", required=True, help="HLS 输出目录（index.m3u8 会写在这里）")
    ap.add_argument("--dur", type=float, default=5.0, help="每帧停留秒数，默认 5")
    ap.add_argument("--fps", type=int, default=30, help="帧率，默认 30")
    ap.add_argument("--size", default="1280x720", help="输出分辨率，默认 1280x720")
    ap.add_argument("--zoom-speed", type=float, default=0.0012, help="每帧推进步长")
    ap.add_argument("--max-zoom", type=float, default=1.30, help="最大放大倍数")
    ap.add_argument("--mp4", default=None, help="额外输出渐进式 mp4 的路径")
    ap.add_argument("--thumb", default=None, help="额外输出缩略图 jpg 的路径")
    args = ap.parse_args()

    w, h = (int(x) for x in args.size.split("x"))
    frames = collect_frames(Path(args.frames))
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"静帧 {len(frames)} 张 · 每张 {args.dur}s · 目标 {args.size}@{args.fps}fps")
    print(f"预计成片时长 ≈ {len(frames) * args.dur:.0f}s")

    tmp = Path(tempfile.mkdtemp(prefix="manju_frames_"))
    try:
        clips: list[Path] = []
        for i, f in enumerate(frames, 1):
            clip = tmp / f"clip_{i:04d}.mp4"
            build_clip(f, clip, args.dur, args.fps, w, h, args.zoom_speed, args.max_zoom)
            clips.append(clip)
            print(f"  ✓ 片段 {i}/{len(frames)}  {f.name}")

        list_file = tmp / "concat.txt"
        list_file.write_text(
            "".join(f"file '{c.as_posix()}'\n" for c in clips), encoding="utf-8")

        # concat + 静音音轨 + HLS 一步到位
        print("合成并切片…")
        run([
            FFMPEG, "-y",
            "-f", "concat", "-safe", "0", "-i", str(list_file),
            "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
            "-shortest",
            "-c:v", "libx264", "-preset", "medium", "-crf", "25", "-pix_fmt", "yuv420p",
            "-g", str(args.fps * 6), "-keyint_min", str(args.fps * 6), "-sc_threshold", "0",
            "-c:a", "aac", "-b:a", "96k", "-ar", "44100",
            "-f", "hls", "-hls_time", "6", "-hls_playlist_type", "vod",
            "-hls_segment_filename", str(out_dir / "%03d.ts"),
            str(out_dir / "index.m3u8"),
        ])

        if args.mp4:
            mp4 = Path(args.mp4)
            mp4.parent.mkdir(parents=True, exist_ok=True)
            run([
                FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", str(list_file),
                "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
                "-shortest", "-c:v", "libx264", "-preset", "medium", "-crf", "26",
                "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                "-c:a", "aac", "-b:a", "96k", str(mp4),
            ])
            print(f"  ✓ 降级源 mp4: {mp4}")

        if args.thumb:
            thumb = Path(args.thumb)
            thumb.parent.mkdir(parents=True, exist_ok=True)
            run([FFMPEG, "-y", "-i", str(frames[0]),
                 "-vf", f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}",
                 "-q:v", "3", str(thumb)])
            print(f"  ✓ 缩略图: {thumb}")

        total = sum(p.stat().st_size for p in out_dir.iterdir())
        segs = len(list(out_dir.glob("*.ts")))
        print(f"\n完成：{out_dir}")
        print(f"  切片 {segs} 个 · 总计 {total / 1024 / 1024:.2f} MB")
        return 0
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as e:
        print(f"[失败] {e}", file=sys.stderr)
        raise SystemExit(1)
