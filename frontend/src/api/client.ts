const API_BASE = "/api";

export interface Article {
  id: string;
  title: string;
  content: string;
  summary: string | null;
  topics: string[];
  keywords: string[];
  entities: { name: string; type: string }[];
  enrichment_status: string;
  created_at: string;
  updated_at: string;
}

export interface ArticleListItem {
  id: string;
  title: string;
  summary: string | null;
  topics: string[];
  enrichment_status: string;
  created_at: string;
  updated_at: string;
}

export interface ArticleListResponse {
  articles: ArticleListItem[];
  total: number;
  page: number;
  limit: number;
}

export interface SearchResult {
  article: ArticleListItem;
  score: number;
}

export interface SearchResponse {
  results: SearchResult[];
  query: string;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Request failed");
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  listArticles: (page = 1, limit = 20) =>
    request<ArticleListResponse>(`/articles?page=${page}&limit=${limit}`),

  getArticle: (id: string) => request<Article>(`/articles/${id}`),

  createArticle: (data: { title?: string; content: string }) =>
    request<Article>("/articles", { method: "POST", body: JSON.stringify(data) }),

  updateArticle: (id: string, data: { title?: string; content?: string }) =>
    request<Article>(`/articles/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  deleteArticle: (id: string) =>
    request<void>(`/articles/${id}`, { method: "DELETE" }),

  search: (q: string, limit = 10, mode = "semantic") =>
    request<SearchResponse>(`/search?q=${encodeURIComponent(q)}&limit=${limit}&mode=${mode}`),
};
