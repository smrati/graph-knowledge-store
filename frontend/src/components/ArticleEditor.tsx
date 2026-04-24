import { useState } from "react";
import MDEditor from "@uiw/react-md-editor";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { Sparkles, FunctionSquare } from "lucide-react";

export default function ArticleEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = Boolean(id);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [fixEquations, setFixEquations] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  if (isEditing && !loaded) {
    (async () => {
      const article = await api.getArticle(id!);
      setTitle(article.title);
      setContent(article.content);
      setLoaded(true);
    })();
    return <div className="text-gray-500">Loading...</div>;
  }

  async function handleSave() {
    if (!content.trim()) return;
    setLoading(true);
    try {
      if (isEditing) {
        await api.updateArticle(id!, { title, content, fix_equations: fixEquations || undefined });
        navigate(`/article/${id}`);
      } else {
        const article = await api.createArticle({ content, fix_equations: fixEquations || undefined });
        navigate(`/article/${article.id}`);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Save failed");
    } finally {
      setLoading(false);
    }
  }

  const canSave = isEditing
    ? loading || !content.trim() || !title.trim()
    : loading || !content.trim();

  return (
    <div className="max-w-4xl" data-color-mode="light">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-900">
          {isEditing ? "Edit Article" : "New Article"}
        </h2>
        <button
          onClick={handleSave}
          disabled={canSave}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Saving..." : "Save"}
        </button>
      </div>
      {isEditing && (
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Article title"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-lg mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      )}
      {!isEditing && (
        <div className="flex items-center gap-2 mb-4 px-1 text-sm text-gray-500">
          <Sparkles size={16} className="text-indigo-500" />
          Title will be auto-generated from your content
        </div>
      )}
      <div className="flex items-center gap-2 mb-3">
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={fixEquations}
            onChange={(e) => setFixEquations(e.target.checked)}
            className="accent-indigo-600 w-4 h-4"
          />
          <FunctionSquare size={16} className="text-gray-500" />
          <span className="text-gray-700">
            Fix equations with LLM
          </span>
          <span className="text-xs text-gray-400">
            (uses an extra LLM call to normalize LaTeX delimiters)
          </span>
        </label>
      </div>
      <MDEditor value={content} onChange={(v) => setContent(v || "")} height={500} />
    </div>
  );
}
