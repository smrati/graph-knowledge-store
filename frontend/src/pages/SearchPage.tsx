import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Fuse from "fuse.js";
import { api, type ArticleIndexItem, type SearchResult } from "../api/client";
import { Search, Zap } from "lucide-react";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"semantic" | "hybrid">("semantic");
  const [suggestions, setSuggestions] = useState<ArticleIndexItem[]>([]);
  const [semanticResults, setSemanticResults] = useState<SearchResult[]>([]);
  const [indexLoading, setIndexLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [fuse, setFuse] = useState<InstanceType<typeof Fuse<ArticleIndexItem>> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const navigate = useNavigate();

  useEffect(() => {
    api.getArticlesIndex().then((data) => {
      const fuseIndex = new Fuse(data.articles, {
        keys: [
          { name: "title", weight: 0.6 },
          { name: "summary", weight: 0.25 },
          { name: "keywords", weight: 0.15 },
        ],
        threshold: 0.4,
        includeScore: true,
        minMatchCharLength: 2,
      });
      setFuse(fuseIndex);
      setIndexLoading(false);
    });
  }, []);

  function handleInputChange(value: string) {
    setQuery(value);
    setSearched(false);
    setSemanticResults([]);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!fuse || value.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    debounceRef.current = setTimeout(() => {
      const results = fuse.search(value.trim(), { limit: 8 });
      setSuggestions(results.map((r) => r.item));
    }, 150);
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSuggestions([]);
    setSearching(true);
    try {
      const res = await api.search(query, 10, mode);
      setSemanticResults(res.results);
    } catch {
      setSemanticResults([]);
    } finally {
      setSearching(false);
      setSearched(true);
    }
  }

  return (
    <div className="max-w-3xl">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Search</h2>

      <form onSubmit={handleSearch} className="mb-6">
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder="Search articles..."
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            autoFocus
          />
          <button
            type="submit"
            disabled={searching || !query.trim()}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {searching ? "Searching..." : "Search"}
          </button>
        </div>
        <div className="flex gap-3">
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="radio"
              name="mode"
              checked={mode === "semantic"}
              onChange={() => setMode("semantic")}
              className="accent-indigo-600"
            />
            Semantic
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="radio"
              name="mode"
              checked={mode === "hybrid"}
              onChange={() => setMode("hybrid")}
              className="accent-indigo-600"
            />
            Hybrid (semantic + graph)
          </label>
        </div>
      </form>

      {indexLoading && (
        <p className="text-sm text-gray-400 mb-4">Loading search index...</p>
      )}

      {suggestions.length > 0 && !searched && (
        <div className="mb-6">
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-2">
            <Zap size={12} />
            QUICK MATCHES
          </div>
          <div className="grid gap-2">
            {suggestions.map((s) => (
              <div
                key={s.id}
                onClick={() => navigate(`/article/${s.id}`)}
                className="border border-gray-200 rounded-lg p-3 bg-white hover:shadow-md transition-shadow cursor-pointer"
              >
                <h3 className="font-medium text-gray-900 text-sm">{s.title}</h3>
                {s.summary && (
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{s.summary}</p>
                )}
                {s.keywords.length > 0 && (
                  <div className="flex gap-1 mt-1.5 flex-wrap">
                    {s.keywords.slice(0, 4).map((k) => (
                      <span key={k} className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                        {k}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {searched && semanticResults.length === 0 && !searching && (
        <p className="text-gray-500">No semantic results found.</p>
      )}

      {searching && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Search size={14} className="animate-pulse" />
          Running semantic search...
        </div>
      )}

      {semanticResults.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-2">
            <Search size={12} />
            SEMANTIC RESULTS
          </div>
          <div className="grid gap-3">
            {semanticResults.map((r) => (
              <div
                key={r.article.id}
                onClick={() => navigate(`/article/${r.article.id}`)}
                className="border border-gray-200 rounded-lg p-4 bg-white hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className="flex justify-between items-start">
                  <h3 className="font-semibold text-gray-900">{r.article.title}</h3>
                  <span className="text-xs font-mono bg-green-50 text-green-700 px-2 py-0.5 rounded">
                    {(r.score * 100).toFixed(1)}%
                  </span>
                </div>
                {r.article.summary && (
                  <p className="text-sm text-gray-500 mt-1">{r.article.summary}</p>
                )}
                <div className="flex gap-1 mt-2 flex-wrap">
                  {r.article.topics.map((t) => (
                    <span key={t} className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
