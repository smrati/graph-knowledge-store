import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

interface Neighbor {
  id: string;
  title: string;
  shared_nodes: number;
  connection_type: string;
}

export default function RelatedArticles({ articleId }: { articleId: string }) {
  const [neighbors, setNeighbors] = useState<Neighbor[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetch(`/api/graph/article/${articleId}/neighbors?limit=5`)
      .then((r) => r.json())
      .then((data) => setNeighbors(data.neighbors || []))
      .catch(() => setNeighbors([]))
      .finally(() => setLoading(false));
  }, [articleId]);

  if (loading) return <p className="text-sm text-gray-400">Loading related...</p>;
  if (neighbors.length === 0) return null;

  return (
    <div className="mt-6 pt-4 border-t border-gray-200">
      <h3 className="text-sm font-semibold text-gray-700 mb-2">Related Articles</h3>
      <div className="grid gap-2">
        {neighbors.map((n) => (
          <div
            key={n.id}
            onClick={() => navigate(`/article/${n.id}`)}
            className="text-sm p-2 rounded border border-gray-100 hover:bg-gray-50 cursor-pointer flex justify-between items-center"
          >
            <span className="text-gray-700">{n.title}</span>
            <span className="text-xs text-gray-400">
              {n.shared_nodes} shared {n.connection_type}
              {n.shared_nodes > 1 ? "s" : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
