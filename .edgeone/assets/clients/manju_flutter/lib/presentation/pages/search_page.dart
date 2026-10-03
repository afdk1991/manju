/// 搜索结果页。
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/config/app_config.dart';
import '../../data/models/content.dart';
import '../widgets/series_card.dart';

/// 搜索结果页。
class SearchPage extends ConsumerStatefulWidget {
  const SearchPage({super.key, required this.keyword});

  final String keyword;

  @override
  ConsumerState<SearchPage> createState() => _SearchPageState();
}

class _SearchPageState extends ConsumerState<SearchPage> {
  late Future<List<Series>> _future;

  @override
  void initState() {
    super.initState();
    _search();
  }

  void _search() {
    _future = ref
        .read(contentApiProvider)
        .search(widget.keyword)
        .then((paged) => paged.items);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('搜索：${widget.keyword}'),
      ),
      body: FutureBuilder<List<Series>>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) {
            return Center(child: Text('搜索失败：${snap.error}'));
          }
          final items = snap.data ?? const [];
          if (items.isEmpty) {
            return const Center(child: Text('没有找到相关内容'));
          }
          return GridView.builder(
            padding: const EdgeInsets.all(16),
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
          );
        },
      ),
    );
  }
}
