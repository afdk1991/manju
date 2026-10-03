/// 播放页。
///
/// 使用官方 `video_player`。注意：该插件在桌面端（Windows / Linux）支持有限，
/// 生产环境如需完整桌面播放能力，请替换为 media_kit 并只改本文件即可
/// —— 其它层通过 Episode.playableUrl 解耦，不直接依赖具体播放器实现。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:video_player/video_player.dart';

import '../../core/config/app_config.dart';
import '../../data/models/content.dart';

/// 播放页。
class PlayerPage extends ConsumerStatefulWidget {
  const PlayerPage({super.key, required this.episodeId});

  final String episodeId;

  @override
  ConsumerState<PlayerPage> createState() => _PlayerPageState();
}

class _PlayerPageState extends ConsumerState<PlayerPage> {
  VideoPlayerController? _controller;
  String? _error;
  Episode? _episode;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final ep = await ref.read(contentApiProvider).episode(widget.episodeId);
      final url = ep.playableUrl;
      if (url == null || url.isEmpty) {
        setState(() => _error = '该分集没有可播放的视频源');
        return;
      }
      final c = VideoPlayerController.networkUrl(Uri.parse(url));
      await c.initialize();
      if (!mounted) return;
      setState(() {
        _episode = ep;
        _controller = c;
      });
      await c.play();
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = '加载失败：$e');
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = _controller;

    return Scaffold(
      appBar: AppBar(
        title: Text(_episode?.title ?? '播放'),
      ),
      body: Column(
        children: [
          // 播放器区域
          AspectRatio(
            aspectRatio: 9 / 16, // 漫剧以竖屏为主
            child: _error != null
                ? Center(child: Text(_error!))
                : c == null || !c.value.isInitialized
                    ? const Center(child: CircularProgressIndicator())
                    : Stack(
                        alignment: Alignment.bottomCenter,
                        children: [
                          VideoPlayer(c),
                          _Controls(controller: c),
                          VideoProgressIndicator(c, allowScrubbing: true),
                        ],
                      ),
          ),
          // 分集信息
          if (_episode != null)
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _episode!.title,
                    style: const TextStyle(
                        fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    children: _episode!.sources
                        .map((s) => Chip(
                              label: Text(s.quality.value,
                                  style: const TextStyle(fontSize: 11)),
                              visualDensity: VisualDensity.compact,
                              padding: EdgeInsets.zero,
                              materialTapTargetSize:
                                  MaterialTapTargetSize.shrinkWrap,
                            ))
                        .toList(),
                  ),
                  if (_episode!.subtitles.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(
                      '字幕：${_episode!.subtitles.map((s) => s.label).join(' / ')}',
                      style:
                          TextStyle(fontSize: 12, color: Colors.grey.shade600),
                    ),
                  ],
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// 播放控制条。
class _Controls extends StatelessWidget {
  const _Controls({required this.controller});

  final VideoPlayerController controller;

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<VideoPlayerValue>(
      valueListenable: controller,
      builder: (context, value, _) {
        return IconButton(
          iconSize: 48,
          color: Colors.white.withValues(alpha: 0.9),
          icon: Icon(
            value.isPlaying ? Icons.pause_circle_filled : Icons.play_circle_filled,
          ),
          onPressed: () {
            value.isPlaying ? controller.pause() : controller.play();
          },
        );
      },
    );
  }
}
