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

export interface ArticleIndexItem {
  id: string;
  title: string;
  summary: string | null;
  keywords: string[];
}

export interface SearchResult {
  article: ArticleListItem;
  score: number;
}

export interface SearchResponse {
  results: SearchResult[];
  query: string;
}

export interface GraphNode {
  id: string;
  label: string;
  name?: string;
  title?: string;
  type?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
}

export interface SubgraphResponse {
  article_id: string;
  subgraph: { nodes: GraphNode[]; edges: GraphEdge[] };
}

export interface GraphNeighbor {
  id: string;
  title: string;
  shared_nodes: number;
  connection_type: string;
}

export interface GraphStats {
  articles: number;
  topics: number;
  keywords: number;
  entities: number;
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
  listArticles: (page = 1, limit = 20, filters?: { topic?: string; keyword?: string }) => {
    let path = `/articles?page=${page}&limit=${limit}`;
    if (filters?.topic) path += `&topic=${encodeURIComponent(filters.topic)}`;
    if (filters?.keyword) path += `&keyword=${encodeURIComponent(filters.keyword)}`;
    return request<ArticleListResponse>(path);
  },

  getArticlesIndex: () =>
    request<{ articles: ArticleIndexItem[] }>("/articles/index"),

  getArticle: (id: string) => request<Article>(`/articles/${id}`),

  createArticle: (data: { title?: string; content: string; fix_equations?: boolean }) =>
    request<Article>("/articles", { method: "POST", body: JSON.stringify(data) }),

  updateArticle: (id: string, data: { title?: string; content?: string; fix_equations?: boolean }) =>
    request<Article>(`/articles/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  deleteArticle: (id: string) =>
    request<void>(`/articles/${id}`, { method: "DELETE" }),

  search: (q: string, limit = 10, mode = "semantic") =>
    request<SearchResponse>(`/search?q=${encodeURIComponent(q)}&limit=${limit}&mode=${mode}`),

  getFullGraph: () =>
    request<{ nodes: GraphNode[]; edges: GraphEdge[] }>("/graph/full"),

  getSubgraph: (articleId: string, depth = 2) =>
    request<SubgraphResponse>(`/graph/article/${articleId}/subgraph?depth=${depth}`),

  getNeighbors: (articleId: string, limit = 10) =>
    request<{ article_id: string; neighbors: GraphNeighbor[] }>(`/graph/article/${articleId}/neighbors?limit=${limit}`),

  getGraphStats: () => request<GraphStats>("/graph/stats"),
};
