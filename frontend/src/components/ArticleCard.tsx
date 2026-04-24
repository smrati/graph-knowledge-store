import { useNavigate } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { api, type ArticleListItem } from "../api/client";

export default function ArticleCard({ article }: { article: ArticleListItem }) {
  const navigate = useNavigate();

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Delete this article?")) return;
    await api.deleteArticle(article.id);
    window.location.reload();
  }

  return (
    <div
      onClick={() => navigate(`/article/${article.id}`)}
      className="border border-gray-200 rounded-lg p-4 bg-white hover:shadow-md transition-shadow cursor-pointer group"
    >
      <div className="flex justify-between items-start">
        <h3 className="font-semibold text-gray-900 group-hover:text-indigo-600">
          {article.title}
        </h3>
        <button
          onClick={handleDelete}
          className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Trash2 size={16} />
        </button>
      </div>
      {article.summary && (
        <p className="text-sm text-gray-500 mt-1 line-clamp-2">{article.summary}</p>
      )}
      <div className="flex gap-1 mt-2 flex-wrap">
        {article.topics.map((t) => (
          <span key={t} className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded">
            {t}
          </span>
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-2">
        {new Date(article.updated_at).toLocaleDateString()}
      </p>
    </div>
  );
}
