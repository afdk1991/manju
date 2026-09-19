// ============================================================================
// 内容中台 HTTP 客户端（严格按 spec/openapi.yaml 封装）
// 所有请求走 Tauri http plugin（@tauri-apps/plugin-http），
// 以保证桌面端不受浏览器 CORS 限制，且全程 HTTPS。
// ============================================================================

import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import type {
  Category,
  Episode,
  HomeSection,
  OtaCheckResponse,
  OtaReportPayload,
  Page,
  Series,
  SeriesBase,
} from "./types";

/**
 * 服务端地址。默认指向线上内容中台（可直接调试）。
 * 本地联调时可改回 "http://localhost:8000"（见 spec/openapi.yaml servers）。
 */
export const API_BASE = "https://manju-drama-hub-tkwcxlaw.edgeone.cool";

class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
  const url = new URL(API_BASE + path);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }
  }
  const resp = await tauriFetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!resp.ok) {
    let code: string | undefined;
    try {
      const body = await resp.json();
      code = body?.code;
    } catch {
      /* 忽略解析失败 */
    }
    throw new ApiError(resp.status, `GET ${path} 失败: ${resp.status}`, code);
  }
  return (await resp.json()) as T;
}

export const api = {
  /** 首页推荐分区。 */
  async getHome(locale?: string): Promise<{ sections: HomeSection[] }> {
    return get("/api/v1/home", locale ? { locale } : undefined);
  },

  /** 分类列表。 */
  async getCategories(): Promise<{ items: Category[] }> {
    return get("/api/v1/categories");
  },

  /** 剧集列表（分页 + 筛选）。 */
  async getSeries(opts: {
    category_id?: string;
    tag?: string;
    status?: string;
    sort?: "hot" | "new" | "score" | "views";
    page?: number;
    size?: number;
  } = {}): Promise<{ items: SeriesBase[]; page: Page }> {
    const params: Record<string, string | number> = {};
    if (opts.category_id) params.category_id = opts.category_id;
    if (opts.tag) params.tag = opts.tag;
    if (opts.status) params.status = opts.status;
    if (opts.sort) params.sort = opts.sort;
    if (opts.page) params.page = opts.page;
    if (opts.size) params.size = opts.size;
    return get("/api/v1/series", params);
  },

  /** 剧集详情（含分集）。 */
  async getSeriesDetail(id: string): Promise<Series> {
    return get(`/api/v1/series/${id}`);
  },

  /** 分集列表。 */
  async getEpisodes(seriesId: string): Promise<{ items: Episode[] }> {
    return get(`/api/v1/series/${seriesId}/episodes`);
  },

  /** 单集详情。 */
  async getEpisode(id: string): Promise<Episode> {
    return get(`/api/v1/episodes/${id}`);
  },

  /** 搜索。 */
  async search(q: string, page = 1): Promise<{ items: SeriesBase[]; page: Page }> {
    return get("/api/v1/search", { q, page });
  },
};

// ----------------------------------------------------------------------------
// OTA 检查 / 上报（严格按 spec/ota-protocol.v1.md）
// ----------------------------------------------------------------------------

export const otaApi = {
  /**
   * 检查更新。
   * @param lastEtag 上次响应的 ETag（release.build），用于 304 协商。传 null 表示首次。
   * @returns 有更新返回 body；无更新（204/304）返回 null。
   */
  async check(params: {
    platform: string;
    arch: string;
    channel: string;
    version: string;
    build: number;
    device_id: string;
    locale?: string;
    abi?: string;
    lastEtag?: string | null;
  }): Promise<{ body: OtaCheckResponse; etag: string | null } | null> {
    const url = new URL(API_BASE + "/api/v1/ota/check");
    url.searchParams.set("platform", params.platform);
    url.searchParams.set("arch", params.arch);
    url.searchParams.set("channel", params.channel);
    url.searchParams.set("version", params.version);
    url.searchParams.set("build", String(params.build));
    url.searchParams.set("device_id", params.device_id);
    if (params.locale) url.searchParams.set("locale", params.locale);
    if (params.abi) url.searchParams.set("abi", params.abi);

    const headers: Record<string, string> = { Accept: "application/json" };
    if (params.lastEtag) headers["If-None-Match"] = params.lastEtag;

    const resp = await tauriFetch(url.toString(), { method: "GET", headers });
    // 204 No Content / 304 Not Modified：无更新
    if (resp.status === 204 || resp.status === 304) return null;
    if (!resp.ok) {
      let code: string | undefined;
      try {
        const b = await resp.json();
        code = b?.code;
      } catch {
        /* ignore */
      }
      throw new ApiError(resp.status, `OTA check 失败: ${resp.status}`, code);
    }
    const etag = resp.headers.get("etag") ?? null;
    const body = (await resp.json()) as OtaCheckResponse;
    return { body, etag };
  },

  /** 上报更新事件。失败不影响主流程，吞掉异常。 */
  async report(payload: OtaReportPayload): Promise<void> {
    try {
      await tauriFetch(API_BASE + "/api/v1/ota/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      /* 上报失败不应影响用户体验 */
    }
  },
};

export { ApiError };
