/// 剧集卡片。
///
/// 漫剧以竖屏为主，因此封面统一使用 **3:4 竖向比例**，
/// 与横版影视的 16:9 区分开。
library;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../data/models/content.dart';

/// 竖向剧集卡片。
class SeriesCard extends StatelessWidget {
  const SeriesCard({
    super.key,
    required this.series,
    this.width,
    required this.onTap,
  });

  final Series series;

  /// 横滑场景下需要固定宽度，网格场景下传 null 自适应。
  final double? width;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final card = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // 封面
        Expanded(
          child: Stack(
            fit: StackFit.expand,
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: series.cover.isEmpty
                    ? _placeholder()
                    : CachedNetworkImage(
                        imageUrl: series.cover,
                        fit: BoxFit.cover,
                        placeholder: (_, __) => _placeholder(),
                        errorWidget: (_, __, ___) => _placeholder(),
                      ),
              ),
              // 右上角状态角标
              Positioned(
                top: 6,
                right: 6,
                child: _StatusBadge(status: series.status),
              ),
              // 左下角集数
              Positioned(
                left: 6,
                bottom: 6,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.6),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    '${series.totalEpisodes} 集',
                    style: const TextStyle(color: Colors.white, fontSize: 11),
                  ),
                ),
              ),
              // VIP 角标
              if (series.isVip)
                Positioned(
                  top: 6,
                  left: 6,
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                    decoration: BoxDecoration(
                      color: Colors.amber.shade700,
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: const Text(
                      'VIP',
                      style: TextStyle(
                          color: Colors.white,
                          fontSize: 10,
                          fontWeight: FontWeight.bold),
                    ),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 6),
        // 标题
        Text(
          series.title,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
        ),
        const SizedBox(height: 2),
        // 副标题：标签
        Text(
          series.tags.isEmpty ? series.status.labelZh : series.tags.take(2).join(' · '),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
        ),
      ],
    );

    return GestureDetector(
      onTap: onTap,
      child: width == null ? card : SizedBox(width: width, child: card),
    );
  }

  Widget _placeholder() => Container(
        color: Colors.grey.shade300,
        child: const Center(child: Icon(Icons.movie_outlined, color: Colors.grey)),
      );
}

/// 状态角标。
class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status});

  final SeriesStatus status;

  @override
  Widget build(BuildContext context) {
    final (text, color) = switch (status) {
      SeriesStatus.ongoing => ('连载', Colors.green.shade600),
      SeriesStatus.completed => ('完结', Colors.blueGrey),
      SeriesStatus.upcoming => ('待播', Colors.orange.shade700),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        text,
        style: const TextStyle(color: Colors.white, fontSize: 10),
      ),
    );
  }
}
