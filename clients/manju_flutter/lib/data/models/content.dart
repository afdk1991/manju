/// 内容数据模型。
///
/// 字段严格对齐 `spec/openapi.yaml`，与后端、Tauri 端、RN 端保持一致。
/// 这里手写 fromJson / toJson，不引入代码生成，降低构建链复杂度。
library;

/// 清晰度。
enum VideoQuality {
  auto('auto'),
  q240('240p'),
  q360('360p'),
  q480('480p'),
  q720('720p'),
  q1080('1080p'),
  q2k('2k'),
  q4k('4k');

  const VideoQuality(this.value);
  final String value;

  static VideoQuality parse(String v) => VideoQuality.values.firstWhere(
        (e) => e.value == v,
        orElse: () => VideoQuality.auto,
      );
}

/// 视频源（多清晰度）。
class VideoSource {
  const VideoSource({
    required this.quality,
    required this.url,
    required this.container,
    this.codec,
    this.bitrateKbps,
    this.sizeBytes,
  });

  final VideoQuality quality;
  final String url;

  /// 封装格式：hls / dash / mp4 / webm
  final String container;
  final String? codec;
  final int? bitrateKbps;
  final int? sizeBytes;

  factory VideoSource.fromJson(Map<String, dynamic> j) => VideoSource(
        quality: VideoQuality.parse(j['quality'] as String? ?? 'auto'),
        url: j['url'] as String? ?? '',
        container: j['container'] as String? ?? 'mp4',
        codec: j['codec'] as String?,
        bitrateKbps: (j['bitrate_kbps'] as num?)?.toInt(),
        sizeBytes: (j['size_bytes'] as num?)?.toInt(),
      );

  Map<String, dynamic> toJson() => {
        'quality': quality.value,
        'url': url,
        'container': container,
        if (codec != null) 'codec': codec,
        if (bitrateKbps != null) 'bitrate_kbps': bitrateKbps,
        if (sizeBytes != null) 'size_bytes': sizeBytes,
      };
}

/// 字幕轨。
class SubtitleTrack {
  const SubtitleTrack({
    required this.lang,
    required this.label,
    required this.url,
    this.format = 'vtt',
    this.isDefault = false,
  });

  final String lang;
  final String label;
  final String url;
  final String format;
  final bool isDefault;

  factory SubtitleTrack.fromJson(Map<String, dynamic> j) => SubtitleTrack(
        lang: j['lang'] as String? ?? 'zh-CN',
        label: j['label'] as String? ?? '字幕',
        url: j['url'] as String? ?? '',
        format: j['format'] as String? ?? 'vtt',
        isDefault: j['is_default'] as bool? ?? false,
      );
}

/// 分集。
class Episode {
  const Episode({
    required this.id,
    required this.seriesId,
    required this.index,
    required this.title,
    this.thumbnail,
    this.durationSec = 0,
    this.isFree = true,
    this.sources = const [],
    this.subtitles = const [],
  });

  final String id;
  final String seriesId;
  final int index;
  final String title;
  final String? thumbnail;
  final int durationSec;
  final bool isFree;
  final List<VideoSource> sources;
  final List<SubtitleTrack> subtitles;

  /// 选一个可播放的地址：优先 HLS，其次第一个非空源。
  String? get playableUrl {
    if (sources.isEmpty) return null;
    for (final s in sources) {
      if (s.container == 'hls' || s.container == 'dash') return s.url;
    }
    for (final s in sources) {
      if (s.url.isNotEmpty) return s.url;
    }
    return null;
  }

  /// 格式化时长为 mm:ss 或 hh:mm:ss。
  String get durationText {
    if (durationSec <= 0) return '--:--';
    final d = Duration(seconds: durationSec);
    final h = d.inHours;
    final m = d.inMinutes.remainder(60).toString().padLeft(2, '0');
    final s = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    return h > 0 ? '$h:$m:$s' : '$m:$s';
  }

  factory Episode.fromJson(Map<String, dynamic> j) => Episode(
        id: j['id'] as String? ?? '',
        seriesId: j['series_id'] as String? ?? '',
        index: (j['index'] as num?)?.toInt() ?? 0,
        title: j['title'] as String? ?? '',
        thumbnail: j['thumbnail'] as String?,
        durationSec: (j['duration_sec'] as num?)?.toInt() ?? 0,
        isFree: j['is_free'] as bool? ?? true,
        sources: (j['sources'] as List<dynamic>?)
                ?.map((e) => VideoSource.fromJson(e as Map<String, dynamic>))
                .toList() ??
            const [],
        subtitles: (j['subtitles'] as List<dynamic>?)
                ?.map((e) => SubtitleTrack.fromJson(e as Map<String, dynamic>))
                .toList() ??
            const [],
      );
}

/// 剧集状态。
enum SeriesStatus {
  ongoing('ongoing'),
  completed('completed'),
  upcoming('upcoming');

  const SeriesStatus(this.value);
  final String value;

  static SeriesStatus parse(String v) => SeriesStatus.values.firstWhere(
        (e) => e.value == v,
        orElse: () => SeriesStatus.ongoing,
      );

  String get labelZh => switch (this) {
        SeriesStatus.ongoing => '连载中',
        SeriesStatus.completed => '已完结',
        SeriesStatus.upcoming => '即将上线',
      };
}

/// 剧集（漫剧）。
class Series {
  const Series({
    required this.id,
    required this.title,
    this.originalTitle,
    this.cover = '',
    this.poster,
    this.banner,
    this.synopsis = '',
    this.tags = const [],
    this.categoryId = '',
    this.region = 'CN',
    this.releaseYear = 0,
    this.status = SeriesStatus.ongoing,
    this.totalEpisodes = 0,
    this.score = 0,
    this.views = 0,
    this.isVip = false,
    this.ageRating = 'all',
    this.episodes = const [],
  });

  final String id;
  final String title;
  final String? originalTitle;
  final String cover;
  final String? poster;
  final String? banner;
  final String synopsis;
  final List<String> tags;
  final String categoryId;
  final String region;
  final int releaseYear;
  final SeriesStatus status;
  final int totalEpisodes;
  final double score;
  final int views;
  final bool isVip;
  final String ageRating;

  /// 仅详情接口会返回完整分集列表。
  final List<Episode> episodes;

  factory Series.fromJson(Map<String, dynamic> j) => Series(
        id: j['id'] as String? ?? '',
        title: j['title'] as String? ?? '',
        originalTitle: j['original_title'] as String?,
        cover: j['cover'] as String? ?? '',
        poster: j['poster'] as String?,
        banner: j['banner'] as String?,
        synopsis: j['synopsis'] as String? ?? '',
        tags: (j['tags'] as List<dynamic>?)?.map((e) => e.toString()).toList() ??
            const [],
        categoryId: j['category_id'] as String? ?? '',
        region: j['region'] as String? ?? 'CN',
        releaseYear: (j['release_year'] as num?)?.toInt() ?? 0,
        status: SeriesStatus.parse(j['status'] as String? ?? 'ongoing'),
        totalEpisodes: (j['total_episodes'] as num?)?.toInt() ?? 0,
        score: (j['score'] as num?)?.toDouble() ?? 0,
        views: (j['views'] as num?)?.toInt() ?? 0,
        isVip: j['is_vip'] as bool? ?? false,
        ageRating: j['age_rating'] as String? ?? 'all',
        episodes: (j['episodes'] as List<dynamic>?)
                ?.map((e) => Episode.fromJson(e as Map<String, dynamic>))
                .toList() ??
            const [],
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'cover': cover,
        'synopsis': synopsis,
        'tags': tags,
        'status': status.value,
        'total_episodes': totalEpisodes,
        'score': score,
        'views': views,
      };
}

/// 首页分区布局。
enum SectionLayout {
  swipe,
  grid,
  list,
  rank;

  static SectionLayout parse(String v) => SectionLayout.values.firstWhere(
        (e) => e.name == v,
        orElse: () => SectionLayout.grid,
      );
}

/// 首页分区。
class HomeSection {
  const HomeSection({
    required this.id,
    required this.title,
    required this.layout,
    required this.items,
  });

  final String id;
  final String title;
  final SectionLayout layout;
  final List<Series> items;

  factory HomeSection.fromJson(Map<String, dynamic> j) => HomeSection(
        id: j['id'] as String? ?? '',
        title: j['title'] as String? ?? '',
        layout: SectionLayout.parse(j['layout'] as String? ?? 'grid'),
        items: (j['items'] as List<dynamic>?)
                ?.map((e) => Series.fromJson(e as Map<String, dynamic>))
                .toList() ??
            const [],
      );
}

/// 分类。
class Category {
  const Category({required this.id, required this.name, this.icon});

  final String id;
  final String name;
  final String? icon;

  factory Category.fromJson(Map<String, dynamic> j) => Category(
        id: j['id'] as String? ?? '',
        name: j['name'] as String? ?? '',
        icon: j['icon'] as String?,
      );
}

/// 分页信息。
class PageInfo {
  const PageInfo({
    required this.page,
    required this.size,
    required this.total,
    required this.hasMore,
  });

  final int page;
  final int size;
  final int total;
  final bool hasMore;

  factory PageInfo.fromJson(Map<String, dynamic> j) => PageInfo(
        page: (j['page'] as num?)?.toInt() ?? 1,
        size: (j['size'] as num?)?.toInt() ?? 20,
        total: (j['total'] as num?)?.toInt() ?? 0,
        hasMore: j['has_more'] as bool? ?? false,
      );

  static const PageInfo empty = PageInfo(page: 1, size: 20, total: 0, hasMore: false);
}

/// 带分页的列表。
class Paged<T> {
  const Paged({required this.items, required this.page});

  final List<T> items;
  final PageInfo page;
}
