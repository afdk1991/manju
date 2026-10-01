/**
 * 数据契约类型 —— 由 spec/openapi.yaml 与现有静态 JSON 结构派生。
 * Web / Flutter / Tauri / RN 四端共用同一套字段语义，改契约先改这里。
 */

export interface Source {
  container: string;
  url: string;
  quality?: string;
  codec?: string;
}

export interface Subtitle {
  lang?: string;
  label?: string;
  url: string;
}

export interface Episode {
  id: string;
  series_id: string;
  index: number;
  title?: string;
  thumbnail?: string;
  duration_sec?: number;
  is_free?: boolean;
  sources: Source[];
  subtitles?: Subtitle[];
}

export interface SeriesCard {
  id: string;
  title: string;
  original_title?: string;
  cover?: string;
  poster?: string;
  banner?: string;
  synopsis?: string;
  tags?: string[];
  category_id?: string;
  region?: string;
  release_year?: number;
  status?: string;
  total_episodes?: number;
  score?: number;
  views?: number;
  is_vip?: boolean;
  age_rating?: string;
}

export interface Series extends SeriesCard {
  episodes?: Episode[];
}

export interface HomeSection {
  id: string;
  title: string;
  layout?: string;
  items: SeriesCard[];
}

export interface Home {
  sections: HomeSection[];
}

export interface Category {
  id: string;
  name: string;
  icon?: string;
}

/** 外部片单条目：只含公开元数据，无任何视频直链 */
export interface ExternalItem {
  id: string;
  title: string;
  cover_url?: string;
  episodes_text?: string;
  episodes?: number;
  source?: string;
  source_label?: string;
  category?: string;
  category_label?: string;
  detail_url?: string;
  media_type?: string;
}

export interface ExternalCatalog {
  category: string;
  category_label: string;
  url?: string;
  total?: number;
}

export interface ExternalIndex {
  provider?: string;
  provider_label?: string;
  attribution?: string;
  catalogs: ExternalCatalog[];
  total?: number;
}

export interface ExternalList {
  catalog: string;
  category: string;
  category_label?: string;
  attribution?: string;
  total?: number;
  items: ExternalItem[];
}
