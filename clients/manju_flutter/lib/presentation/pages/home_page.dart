/// 首页：分区推荐 + 搜索入口 + 更新提示挂载点。
library;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/config/app_config.dart';
import '../../data/models/content.dart';
import '../widgets/series_card.dart';

/// 首页。
class HomePage extends ConsumerStatefulWidget {
  const HomePage({super.key});

  @override
  ConsumerState<HomePage> createState() => _HomePageState();
}

class _HomePageState extends ConsumerState<HomePage> {
  late Future<List<HomeSection>> _future;
  final _searchCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _future = ref.read(contentApiProvider).home();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _reload() async {
    setState(() {
      _future = ref.read(contentApiProvider).home();
    });
  }

  void _goSearch() {
    final q = _searchCtrl.text.trim();
    if (q.isEmpty) return;
    context.push('/search?q=${Uri.encodeComponent(q)}');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('漫剧'),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings_outlined),
            tooltip: '设置',
            onPressed: () => context.push('/settings'),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _reload,
        child: CustomScrollView(
          slivers: [
            // 搜索框
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                child: TextField(
                  controller: _searchCtrl,
                  textInputAction: TextInputAction.search,
                  onSubmitted: (_) => _goSearch(),
                  decoration: InputDecoration(
                    hintText: '搜索漫剧名称',
                    prefixIcon: const Icon(Icons.search),
                    suffixIcon: IconButton(
                      icon: const Icon(Icons.arrow_forward),
                      onPressed: _goSearch,
                    ),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    isDense: true,
                    filled: true,
                  ),
                ),
              ),
            ),

            // 分区列表
            FutureBuilder<List<HomeSection>>(
              future: _future,
              builder: (context, snap) {
                if (snap.connectionState == ConnectionState.waiting) {
                  return const SliverFillRemaining(
                    child: Center(child: CircularProgressIndicator()),
                  );
                }
                if (snap.hasError) {
                  return SliverFillRemaining(
                    child: _ErrorView(
                      message: '加载失败：${snap.error}',
                      onRetry: _reload,
                    ),
                  );
                }
                final sections = snap.data ?? const [];
                if (sections.isEmpty) {
                  return const SliverFillRemaining(
                    child: Center(child: Text('暂无内容')),
                  );
                }
                return SliverList(
                  delegate: SliverChildBuilderDelegate(
                    (context, i) => _SectionBlock(section: sections[i]),
                    childCount: sections.length,
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

/// 一个分区。
class _SectionBlock extends StatelessWidget {
  const _SectionBlock({required this.section});

  final HomeSection section;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Row(
            children: [
              Container(
                width: 4,
                height: 18,
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.primary,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(width: 8),
              Text(
                section.title,
                style: Theme.of(context)
                    .textTheme
                    .titleMedium
                    ?.copyWith(fontWeight: FontWeight.bold),
              ),
            ],
          ),
        ),
        switch (section.layout) {
          // 横滑：适合 banner / 热门推荐
          SectionLayout.swipe => _SwipeRow(items: section.items),
          // 榜单：左侧序号
          SectionLayout.rank => _RankList(items: section.items),
          // 网格 / 列表
          _ => _GridBlock(items: section.items),
        },
      ],
    );
  }
}

/// 横滑卡片行。
class _SwipeRow extends StatelessWidget {
  const _SwipeRow({required this.items});

  final List<Series> items;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 190,
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        scrollDirection: Axis.horizontal,
        itemCount: items.length,
        separatorBuilder: (_, __) => const SizedBox(width: 12),
        itemBuilder: (context, i) => SeriesCard(
          series: items[i],
          width: 120,
          onTap: () => context.push('/series/${items[i].id}'),
        ),
      ),
    );
  }
}

/// 网格区块。
class _GridBlock extends StatelessWidget {
  const _GridBlock({required this.items});

  final List<Series> items;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: GridView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 3,
          childAspectRatio: 0.62,
          crossAxisSpacing: 10,
          mainAxisSpacing: 14,
        ),
        itemCount: items.length,
        itemBuilder: (context, i) => SeriesCard(
          series: items[i],
          onTap: () => context.push('/series/${items[i].id}'),
        ),
      ),
    );
  }
}

/// 榜单（带序号）。
class _RankList extends StatelessWidget {
  const _RankList({required this.items});

  final List<Series> items;

  @override
  Widget build(BuildContext context) {
    final top = items.take(10).toList();
    return Column(
      children: List.generate(top.length, (i) {
        final s = top[i];
        return ListTile(
          leading: SizedBox(
            width: 28,
            child: Text(
              '${i + 1}',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: i < 3 ? Colors.red.shade400 : Colors.grey,
              ),
            ),
          ),
          title: Text(s.title, maxLines: 1, overflow: TextOverflow.ellipsis),
          subtitle: Text('${s.status.labelZh} · ${s.totalEpisodes} 集'),
          trailing: s.cover.isEmpty
              ? null
              : ClipRRect(
                  borderRadius: BorderRadius.circular(6),
                  child: CachedNetworkImage(
                    imageUrl: s.cover,
                    width: 52,
                    height: 70,
                    fit: BoxFit.cover,
                    placeholder: (_, __) => Container(color: Colors.grey.shade200),
                    errorWidget: (_, __, ___) =>
                        const Icon(Icons.broken_image_outlined),
                  ),
                ),
          onTap: () => context.push('/series/${s.id}'),
        );
      }),
    );
  }
}

/// 错误视图。
class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.error_outline, size: 48, color: Colors.grey.shade400),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('重试'),
            ),
          ],
        ),
      ),
    );
  }
}
