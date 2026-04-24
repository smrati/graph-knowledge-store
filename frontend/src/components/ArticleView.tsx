import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, type Article } from "../api/client";
import MarkdownPreview from "./MarkdownPreview";
import RelatedArticles from "./RelatedArticles";

export default function ArticleView() {
  const { id } = useParams() as { id: string };
  const navigate = useNavigate();
  const [article, setArticle] = useState<Article | null>(null);

  useEffect(() => {
    api.getArticle(id).then(setArticle).catch(() => navigate("/"));
  }, [id, navigate]);

  if (!article) return <div className="text-gray-500">Loading...</div>;

  return (
    <div className="max-w-4xl">
      <div className="flex justify-between items-start mb-4">
        <h1 className="text-2xl font-bold text-gray-900">{article.title}</h1>
        <div className="flex gap-2">
          <button
            onClick={() => navigate(`/editor/${article.id}`)}
            className="text-sm px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Edit
          </button>
          <button
            onClick={async () => {
              if (!confirm("Delete this article?")) return;
              await api.deleteArticle(article.id);
              navigate("/");
            }}
            className="text-sm px-3 py-1 border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>
      {article.topics.length > 0 && (
        <div className="flex gap-1 mb-4 flex-wrap">
          {article.topics.map((t: string) => (
            <span key={t} className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded">
              {t}
            </span>
          ))}
          {article.keywords.map((k: string) => (
            <span key={k} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
              {k}
            </span>
          ))}
        </div>
      )}
      <MarkdownPreview content={article.content} />
      <RelatedArticles articleId={article.id} />
      <p className="text-xs text-gray-400 mt-6">
        Created {new Date(article.created_at).toLocaleString()} · Updated{" "}
        {new Date(article.updated_at).toLocaleString()}
      </p>
    </div>
  );
}
