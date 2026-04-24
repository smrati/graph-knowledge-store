import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

interface GraphArticle {
  id: string;
  title: string;
}

export default function GraphPage() {
  const [articles, setArticles] = useState<GraphArticle[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetch("/api/articles?limit=100")
      .then((r) => r.json())
      .then((data) => {
        setArticles(data.articles || []);
      });
  }, []);

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-4">Knowledge Graph</h2>
      <p className="text-sm text-gray-500 mb-4">
        Select an article to explore its knowledge graph neighborhood.
      </p>
      <select
        value={selectedId || ""}
        onChange={(e) => setSelectedId(e.target.value)}
        className="border border-gray-300 rounded-lg px-3 py-2 mb-4 w-full max-w-md"
      >
        <option value="">Choose an article...</option>
        {articles.map((a) => (
          <option key={a.id} value={a.id}>
            {a.title}
          </option>
        ))}
      </select>
      {selectedId && (
        <div>
          <button
            onClick={() => navigate(`/article/${selectedId}`)}
            className="text-sm text-indigo-600 hover:underline mb-4 inline-block"
          >
            View article →
          </button>
        </div>
      )}
    </div>
  );
}
