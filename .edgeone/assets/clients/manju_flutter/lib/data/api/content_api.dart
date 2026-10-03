/// 内容中台 API 客户端。
///
/// 接口契约见 `spec/openapi.yaml`。
library;

import 'package:dio/dio.dart';

import '../models/content.dart';

/// 内容 API。
class ContentApi {
  ContentApi({required this.baseUrl, Dio? dio})
      : _dio = dio ??
            Dio(BaseOptions(
              baseUrl: baseUrl,
              connectTimeout: const Duration(seconds: 10),
              receiveTimeout: const Duration(seconds: 20),
            ));

  final String baseUrl;
  final Dio _dio;

  /// 首页推荐分区。
  Future<List<HomeSection>> home({String? locale}) async {
    final r = await _dio.get<Map<String, dynamic>>(
      '/api/v1/home',
      queryParameters: {if (locale != null) 'locale': locale},
    );
    final list = (r.data?['sections'] as List<dynamic>?) ?? const [];
    return list
        .map((e) => HomeSection.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// 分类列表。
  Future<List<Category>> categories() async {
    final r = await _dio.get<Map<String, dynamic>>('/api/v1/categories');
    final list = (r.data?['items'] as List<dynamic>?) ?? const [];
    return list.map((e) => Category.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// 剧集列表。
  Future<Paged<Series>> series({
    String? categoryId,
    String? tag,
    String? status,
    String sort = 'hot',
    int page = 1,
    int size = 20,
  }) async {
    final r = await _dio.get<Map<String, dynamic>>(
      '/api/v1/series',
      queryParameters: {
        if (categoryId != null) 'category_id': categoryId,
        if (tag != null) 'tag': tag,
        if (status != null) 'status': status,
        'sort': sort,
        'page': page,
        'size': size,
      },
    );
    final list = (r.data?['items'] as List<dynamic>?) ?? const [];
    return Paged(
      items: list.map((e) => Series.fromJson(e as Map<String, dynamic>)).toList(),
      page: PageInfo.fromJson(
          (r.data?['page'] as Map<String, dynamic>?) ?? const {}),
    );
  }

  /// 剧集详情（含分集）。
  Future<Series> seriesDetail(String id) async {
    final r = await _dio.get<Map<String, dynamic>>('/api/v1/series/$id');
    return Series.fromJson(r.data!);
  }

  /// 分集列表。
  Future<List<Episode>> episodes(String seriesId) async {
    final r =
        await _dio.get<Map<String, dynamic>>('/api/v1/series/$seriesId/episodes');
    final list = (r.data?['items'] as List<dynamic>?) ?? const [];
    return list.map((e) => Episode.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// 单个分集详情（含多清晰度源）。
  Future<Episode> episode(String id) async {
    final r = await _dio.get<Map<String, dynamic>>('/api/v1/episodes/$id');
    return Episode.fromJson(r.data!);
  }

  /// 搜索。
  Future<Paged<Series>> search(String q, {int page = 1}) async {
    final r = await _dio.get<Map<String, dynamic>>(
      '/api/v1/search',
      queryParameters: {'q': q, 'page': page},
    );
    final list = (r.data?['items'] as List<dynamic>?) ?? const [];
    return Paged(
      items: list.map((e) => Series.fromJson(e as Map<String, dynamic>)).toList(),
      page: PageInfo.fromJson(
          (r.data?['page'] as Map<String, dynamic>?) ?? const {}),
    );
  }
}
