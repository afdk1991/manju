/**
 * 漫剧内容中台 + OTA 服务的 HTTP 客户端。严格对齐 `spec/openapi.yaml` 与
 * `spec/ota-protocol.v1.md`，四端（Flutter / Tauri / RN / ArkTS）共用同一份契约。
 *
 * 线上服务地址（已部署，可直接调试）：
 *   https://manju-drama-hub-tkwcxlaw.edgeone.cool
 */
import {
  OtaArch,
  OtaChannel,
  OtaCheckResponse,
  OtaPlatform,
  OtaReportEvent,
  OtaReportPayload,
} from '../updater/types';

/** 默认线上地址，可在 App 启动时覆盖。 */
export const API_BASE_URL = 'https://manju-drama-hub-tkwcxlaw.edgeone.cool';

// ---------- 内容中台数据类型（对齐 openapi.yaml） ----------

export type Quality =
  | 'auto'
  | '240p'
  | '360p'
  | '480p'
  | '720p'
  | '1080p'
  | '2k'
  | '4k';

export interface VideoSource {
  quality: Quality;
  url: string;
  container: 'hls' | 'dash' | 'mp4' | 'webm';
  codec?: string;
  bitrate_kbps?: number;
  size_bytes?: number;
}

export interface SubtitleTrack {
  lang: string;
  label: string;
  url: string;
  format: 'vtt' | 'srt' | 'ass';
  is_default?: boolean;
}

export interface SeriesBase {
  id: string;
  title: string;
  original_title?: string | null;
  cover: string;
  poster?: string | null;
  banner?: string | null;
  synopsis: string;
  tags: string[];
  category_id: string;
  region: string;
  release_year: number;
  status: 'ongoing' | 'completed' | 'upcoming';
  total_episodes: number;
  score: number;
  views: number;
  is_vip: boolean;
  age_rating: 'all' | '13' | '16' | '18';
}

export interface Episode {
  id: string;
  series_id: string;
  index: number;
  title: string;
  thumbnail?: string | null;
  duration_sec: number;
  is_free: boolean;
  sources: VideoSource[];
  subtitles: SubtitleTrack[];
}

export interface Series extends SeriesBase {
  episodes: Episode[];
}

export interface HomeSection {
  id: string;
  title: string;
  layout: 'swipe' | 'grid' | 'list' | 'rank';
  items: SeriesBase[];
}

export interface Category {
  id: string;
  name: string;
  icon?: string | null;
}

export interface Page {
  page: number;
  size: number;
  total: number;
  has_more: boolean;
}

export interface SeriesListResponse {
  items: SeriesBase[];
  page: Page;
}

export interface SearchResponse {
  items: SeriesBase[];
  page: Page;
}

// ---------- 客户端 ----------

class ApiClient {
  baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const resp = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    if (!resp.ok) {
      throw new Error(`请求失败 ${resp.status}: ${path}`);
    }
    return (await resp.json()) as T;
  }

  // ---- 内容中台 ----

  /** 首页推荐分区。 */
  async home(locale?: string): Promise<{sections: HomeSection[]}> {
    const q = locale ? `?locale=${encodeURIComponent(locale)}` : '';
    return this.request(`/api/v1/home${q}`);
  }

  /** 分类列表。 */
  async categories(): Promise<{items: Category[]}> {
    return this.request('/api/v1/categories');
  }

  /** 漫剧列表（可按分类 / 标签 / 状态 / 排序分页）。 */
  async series(params: {
    category_id?: string;
    tag?: string;
    status?: string;
    sort?: 'hot' | 'new' | 'score' | 'views';
    page?: number;
    size?: number;
  } = {}): Promise<SeriesListResponse> {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.append(k, String(v));
    });
    const q = qs.toString();
    return this.request(`/api/v1/series${q ? `?${q}` : ''}`);
  }

  /** 漫剧详情（含分集）。 */
  async seriesDetail(id: string): Promise<Series> {
    return this.request(`/api/v1/series/${encodeURIComponent(id)}`);
  }

  /** 某漫剧的分集列表。 */
  async episodes(seriesId: string): Promise<{items: Episode[]}> {
    return this.request(`/api/v1/series/${encodeURIComponent(seriesId)}/episodes`);
  }

  /** 单集详情（取播放地址）。 */
  async episode(id: string): Promise<Episode> {
    return this.request(`/api/v1/episodes/${encodeURIComponent(id)}`);
  }

  /** 搜索。 */
  async search(q: string, page = 1): Promise<SearchResponse> {
    return this.request(
      `/api/v1/search?q=${encodeURIComponent(q)}&page=${page}`,
    );
  }

  // ---- OTA ----

  /**
   * 检查更新。严格实现 spec/ota-protocol.v1.md。
   * 传入 ETag 时服务端可能返回 304（无更新）。
   */
  async otaCheck(params: {
    platform: OtaPlatform;
    arch: OtaArch;
    channel: OtaChannel;
    version: string;
    build: number;
    device_id: string;
    locale?: string;
    abi?: string;
    etag?: string;
  }): Promise<{status: number; etag?: string; data?: OtaCheckResponse}> {
    const qs = new URLSearchParams();
    qs.append('platform', params.platform);
    qs.append('arch', params.arch);
    qs.append('channel', params.channel);
    qs.append('version', params.version);
    qs.append('build', String(params.build));
    qs.append('device_id', params.device_id);
    if (params.locale) qs.append('locale', params.locale);
    if (params.abi) qs.append('abi', params.abi);

    const headers: Record<string, string> = {};
    if (params.etag) headers['If-None-Match'] = params.etag;

    const resp = await fetch(`${this.baseUrl}/api/v1/ota/check?${qs.toString()}`, {
      headers,
    });
    const etag = resp.headers.get('etag') ?? undefined;
    if (resp.status === 204 || resp.status === 304) {
      return {status: resp.status, etag};
    }
    if (resp.status !== 200) {
      let code: string | undefined;
      try {
        const body = await resp.json();
        code = body?.code;
      } catch {
        /* noop */
      }
      throw new Error(`OTA 检查失败 ${resp.status}${code ? ` (${code})` : ''}`);
    }
    const data = (await resp.json()) as OtaCheckResponse;
    return {status: 200, etag, data};
  }

  /** 上报更新事件（失败不影响主流程）。 */
  async otaReport(payload: OtaReportPayload): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/api/v1/ota/report`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload),
      });
    } catch {
      /* 上报失败不应影响用户体验 */
    }
  }
}

/** 默认单例（指向线上服务）。 */
export const apiClient = new ApiClient();

/** 比较语义化版本：a>b 返回 1，相等 0，小于 -1。 */
export function compareSemver(a: string, b: string): number {
  const pa = a.split(/[.+/]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.split(/[.+/]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0) ? 1 : -1;
  }
  return 0;
}

/** 判断 newVersion/newBuild 是否比当前更新（优先比 build）。 */
export function isNewer(
  newVersion: string,
  newBuild: number,
  curVersion: string,
  curBuild: number,
): boolean {
  if (newBuild > curBuild) return true;
  if (newBuild < curBuild) return false;
  return compareSemver(newVersion, curVersion) > 0;
}

/** 上报事件枚举的便捷集合（供 UI 文案使用）。 */
export type {OtaReportEvent};
