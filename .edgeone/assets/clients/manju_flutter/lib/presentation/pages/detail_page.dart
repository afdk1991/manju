/// 剧集详情页：封面、简介、分集选集。
library;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/config/app_config.dart';
import '../../data/models/content.dart';

/// 详情页。
class DetailPage extends ConsumerStatefulWidget {
  const DetailPage({super.key, required this.seriesId});

  final String seriesId;

  @override
  ConsumerState<DetailPage> createState() => _DetailPageState();
}

class _DetailPageState extends ConsumerState<DetailPage> {
  late Future<Series> _future;

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    _future = ref.read(contentApiProvider).seriesDetail(widget.seriesId);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: FutureBuilder<Series>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('加载失败：${snap.error}'),
                  const SizedBox(height: 12),
                  FilledButton(
                    onPressed: () => setState(_load),
                    child: const Text('重试'),
                  ),
                ],
              ),
            );
          }
          final s = snap.data!;
          return CustomScrollView(
            slivers: [
              SliverAppBar(
                expandedHeight: 220,
                pinned: true,
                flexibleSpace: FlexibleSpaceBar(
                  background: Stack(
                    fit: StackFit.expand,
                    children: [
                      if (s.banner != null && s.banner!.isNotEmpty)
                        CachedNetworkImage(
                          imageUrl: s.banner!,
                          fit: BoxFit.cover,
                          errorWidget: (_, __, ___) => _cover(s),
                        )
                      else
                        _cover(s),
                      const DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: [Colors.transparent, Colors.black54],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              SliverToBoxAdapter(child: _InfoSection(series: s)),
              if (s.episodes.isNotEmpty)
                SliverToBoxAdapter(child: _EpisodeGrid(episodes: s.episodes)),
              const SliverToBoxAdapter(child: SizedBox(height: 32)),
            ],
          );
        },
      ),
    );
  }

  Widget _cover(Series s) => s.cover.isEmpty
      ? Container(color: Colors.grey.shade300)
      : CachedNetworkImage(
          imageUrl: s.cover,
          fit: BoxFit.cover,
          errorWidget: (_, __, ___) => Container(color: Colors.grey.shade300),
        );
}

/// 基本信息区。
class _InfoSection extends StatelessWidget {
  const _InfoSection({required this.series});

  final Series series;

  @override
  Widget build(BuildContext context) {
    final s = series;
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 竖版封面
              ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: SizedBox(
                  width: 100,
                  height: 133,
                  child: s.cover.isEmpty
                      ? Container(color: Colors.grey.shade300)
                      : CachedNetworkImage(
                          imageUrl: s.cover,
                          fit: BoxFit.cover,
                          errorWidget: (_, __, ___) =>
                              Container(color: Colors.grey.shade300),
                        ),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      s.title,
                      style: const TextStyle(
                          fontSize: 19, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 6),
                    _metaRow(s),
                    const SizedBox(height: 8),
                    if (s.score > 0)
                      Row(
                        children: [
                          Icon(Icons.star, size: 16, color: Colors.amber.shade700),
                          const SizedBox(width: 4),
                          Text(s.score.toStringAsFixed(1),
                              style:
                                  const TextStyle(fontWeight: FontWeight.w600)),
                        ],
                      ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          // 标签
          if (s.tags.isNotEmpty)
            Wrap(
              spacing: 8,
              runSpacing: 6,
              children: s.tags
                  .map((t) => Chip(
                        label: Text(t, style: const TextStyle(fontSize: 12)),
                        visualDensity: VisualDensity.compact,
                        padding: EdgeInsets.zero,
                        materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ))
                  .toList(),
            ),
          const SizedBox(height: 12),
          const Text('简介',
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
          const SizedBox(height: 6),
          Text(
            s.synopsis.isEmpty ? '暂无简介' : s.synopsis,
            style: const TextStyle(height: 1.6, color: Colors.black87),
          ),
        ],
      ),
    );
  }

  Widget _metaRow(Series s) => Wrap(
        spacing: 10,
        runSpacing: 4,
        children: [
          _MetaChip(text: s.status.labelZh),
          _MetaChip(text: '${s.totalEpisodes} 集'),
          if (s.releaseYear > 0) _MetaChip(text: '${s.releaseYear}'),
          _MetaChip(text: s.region),
          if (s.isVip) const _MetaChip(text: 'VIP'),
        ],
      );
}

class _MetaChip extends StatelessWidget {
  const _MetaChip({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: Colors.grey.shade200,
          borderRadius: BorderRadius.circular(4),
        ),
        child: Text(text, style: const TextStyle(fontSize: 12)),
      );
}

/// 分集网格。
class _EpisodeGrid extends StatelessWidget {
  const _EpisodeGrid({required this.episodes});

  final List<Episode> episodes;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.only(bottom: 10),
            child: Text('选集',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
          ),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 4,
              childAspectRatio: 1.9,
              crossAxisSpacing: 8,
              mainAxisSpacing: 8,
            ),
            itemCount: episodes.length,
            itemBuilder: (context, i) {
              final ep = episodes[i];
              return OutlinedButton(
                onPressed: () => context.push('/player/${ep.id}'),
                style: OutlinedButton.styleFrom(
                  padding: EdgeInsets.zero,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8)),
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text('第${ep.index}集',
                        style: const TextStyle(fontSize: 13)),
                    if (ep.durationSec > 0)
                      Text(ep.durationText,
                          style: const TextStyle(
                              fontSize: 10, color: Colors.grey)),
                    if (!ep.isFree)
                      Icon(Icons.lock, size: 12, color: Colors.amber.shade700),
                  ],
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}
