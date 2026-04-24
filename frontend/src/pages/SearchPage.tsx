import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type SearchResult } from "../api/client";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"semantic" | "hybrid">("semantic");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const navigate = useNavigate();

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await api.search(query, 10, mode);
      setResults(res.results);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
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
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search articles by meaning..."
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? "Searching..." : "Search"}
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
      {searched && results.length === 0 && (
        <p className="text-gray-500">No results found.</p>
      )}
      <div className="grid gap-3">
        {results.map((r) => (
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
  );
}
