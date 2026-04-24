import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Fuse from "fuse.js";
import ForceGraph2D, { type ForceGraphMethods, type NodeObject } from "react-force-graph-2d";
import { api, type ArticleIndexItem, type GraphNode, type GraphEdge, type GraphStats } from "../api/client";
import { Search, Network, Loader2 } from "lucide-react";

interface GraphDataNode extends NodeObject {
  id: string;
  label: string;
  name?: string;
  title?: string;
  type?: string;
  nodeType: string;
  val: number;
  color: string;
}

interface GraphDataEdge {
  source: string;
  target: string;
  edgeType: string;
  color: string;
}

const NODE_COLORS: Record<string, string> = {
  Article: "#6366f1",
  Topic: "#10b981",
  Keyword: "#f59e0b",
  Entity: "#ef4444",
};

const EDGE_COLORS: Record<string, string> = {
  HAS_TOPIC: "#10b981",
  HAS_KEYWORD: "#f59e0b",
  MENTIONS_ENTITY: "#ef4444",
};

export default function GraphPage() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<ArticleIndexItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTitle, setSelectedTitle] = useState("");
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<GraphStats | null>(null);
  const [fuse, setFuse] = useState<InstanceType<typeof Fuse<ArticleIndexItem>> | null>(null);
  const [indexLoading, setIndexLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const navigate = useNavigate();

  useEffect(() => {
    api.getArticlesIndex().then((data) => {
      setFuse(
        new Fuse(data.articles, {
          keys: [{ name: "title", weight: 0.8 }, { name: "keywords", weight: 0.2 }],
          threshold: 0.4,
          minMatchCharLength: 2,
        })
      );
      setIndexLoading(false);
    });
    api.getGraphStats().then(setStats).catch(() => {});
    api.getFullGraph().then((data) => {
      setNodes(data.nodes || []);
      setEdges(data.edges || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) {
      api.getFullGraph().then((data) => {
        setNodes(data.nodes || []);
        setEdges(data.edges || []);
      }).catch(() => {});
      return;
    }
    setLoading(true);
    api
      .getSubgraph(selectedId, 2)
      .then((data) => {
        setNodes(data.subgraph?.nodes || []);
        setEdges(data.subgraph?.edges || []);
      })
      .catch(() => {
        setNodes([]);
        setEdges([]);
      })
      .finally(() => setLoading(false));
  }, [selectedId]);

  function handleInput(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!fuse || value.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      setSuggestions(fuse.search(value.trim(), { limit: 6 }).map((r) => r.item));
    }, 150);
  }

  function selectArticle(article: ArticleIndexItem) {
    setSelectedId(article.id);
    setSelectedTitle(article.title);
    setQuery(article.title);
    setSuggestions([]);
  }

  function clearSelection() {
    setSelectedId(null);
    setSelectedTitle("");
    setQuery("");
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900">Knowledge Graph</h2>
        {stats && (
          <div className="flex gap-3 text-xs text-gray-500">
            <span>{stats.articles} articles</span>
            <span>{stats.topics} topics</span>
            <span>{stats.keywords} keywords</span>
            <span>{stats.entities} entities</span>
          </div>
        )}
      </div>

      <div className="relative mb-6">
        <div className="flex gap-2">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => handleInput(e.target.value)}
              placeholder={indexLoading ? "Loading index..." : "Type to find an article..."}
              disabled={indexLoading}
              className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
            />
          </div>
          {selectedId && (
            <button onClick={clearSelection} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2 border border-gray-200 rounded-lg">
              Clear
            </button>
          )}
        </div>

        {suggestions.length > 0 && (
          <div className="absolute z-20 top-full mt-1 w-full max-w-md bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
            {suggestions.map((s) => (
              <div
                key={s.id}
                onClick={() => selectArticle(s)}
                className="px-4 py-2.5 hover:bg-indigo-50 cursor-pointer border-b border-gray-100 last:border-0"
              >
                <p className="text-sm font-medium text-gray-900">{s.title}</p>
                {s.keywords.length > 0 && (
                  <div className="flex gap-1 mt-1">
                    {s.keywords.slice(0, 3).map((k) => (
                      <span key={k} className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{k}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedId && (
        <div className="mb-4 flex items-center gap-3">
          <Network size={16} className="text-indigo-600" />
          <span className="text-sm font-medium text-gray-700">{selectedTitle}</span>
          <button onClick={() => navigate(`/article/${selectedId}`)} className="text-xs text-indigo-600 hover:underline">
            View article
          </button>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center h-64 text-gray-400">
          <Loader2 size={24} className="animate-spin mr-2" />
          Loading graph...
        </div>
      )}

      {!loading && nodes.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <Network size={40} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm">No graph data available yet.</p>
          <p className="text-xs mt-1">Create and enrich articles to build the knowledge graph.</p>
        </div>
      )}

      {!loading && nodes.length > 0 && (
        <InteractiveGraph
          nodes={nodes}
          edges={edges}
          selectedId={selectedId}
          onArticleSelect={(id, title) => {
            setSelectedId(id);
            setSelectedTitle(title);
            setQuery(title);
          }}
        />
      )}
    </div>
  );
}

function InteractiveGraph({
  nodes,
  edges,
  selectedId,
  onArticleSelect,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedId: string | null;
  onArticleSelect: (id: string, title: string) => void;
}) {
  const graphData = useMemo(() => ({
    nodes: nodes.map((n) => ({
      id: n.id,
      label: n.label,
      name: n.name,
      title: n.title,
      type: n.type,
      nodeType: n.label,
      val: n.label === "Article" ? 3 : 1,
      color: NODE_COLORS[n.label] || "#9ca3af",
    })),
    links: edges.map((e) => ({
      source: e.source,
      target: e.target,
      edgeType: e.type,
      color: EDGE_COLORS[e.type] || "#d1d5db",
    })),
  }), [nodes, edges]);

  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<ForceGraphMethods<GraphDataNode, GraphDataEdge>>(null);
  const [dims, setDims] = useState({ width: 800, height: 600 });

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect;
      setDims({ width: Math.floor(width), height: 600 });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const fg = graphRef.current;
    if (!fg) return;
    const strength = nodes.length > 30 ? -600 : -300;
    const dist = nodes.length > 30 ? 120 : 80;
    fg.d3Force("charge")?.strength(strength);
    fg.d3Force("link")?.distance(dist);
  }, [graphData, nodes.length]);

  const nodeCount = nodes.length;
  const articleCount = nodes.filter((n) => n.label === "Article").length;

  return (
    <div ref={containerRef}>
      <ForceGraph2D<GraphDataNode, GraphDataEdge>
        ref={graphRef as React.MutableRefObject<ForceGraphMethods<GraphDataNode, GraphDataEdge> | undefined>}
        graphData={graphData}
        width={dims.width}
        height={dims.height}
        nodeId="id"
        nodeLabel={(n) => n.title || n.name || n.id}
        nodeColor={(n) => n.color}
        nodeVal={(n) => n.val}
        nodeRelSize={articleCount > 5 ? 4 : 6}
        nodeCanvasObjectMode={() => "after"}
        nodeCanvasObject={(node, ctx, globalScale) => {
          const n = node as GraphDataNode;
          if (globalScale < 0.4) return;

          const label = n.title || n.name || n.id;
          const maxLen = globalScale > 1 ? 30 : 20;
          const display = label.length > maxLen ? label.slice(0, maxLen - 1) + "…" : label;
          const fontSize = Math.max(12 / globalScale, 3.5);
          ctx.font = `${n.nodeType === "Article" ? "600 " : ""}${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;

          const isCenter = n.id === selectedId;
          const r = n.nodeType === "Article"
            ? (isCenter ? 7 : 5) * (articleCount > 5 ? 0.8 : 1)
            : 3.5 * (articleCount > 5 ? 0.8 : 1);

          ctx.beginPath();
          ctx.arc(n.x!, n.y!, r, 0, 2 * Math.PI);
          ctx.fillStyle = n.color;
          ctx.fill();
          if (isCenter) {
            ctx.strokeStyle = "#4338ca";
            ctx.lineWidth = 2;
            ctx.stroke();
          }

          const labelY = n.y! + r + 2;
          const textWidth = ctx.measureText(display).width;
          const pad = fontSize * 0.4;

          ctx.fillStyle = "rgba(255,255,255,0.9)";
          ctx.beginPath();
          ctx.roundRect(n.x! - textWidth / 2 - pad, labelY - fontSize * 0.15, textWidth + pad * 2, fontSize * 1.35, 2);
          ctx.fill();

          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillStyle = isCenter ? "#4338ca" : n.nodeType === "Article" ? "#1f2937" : "#6b7280";
          ctx.fillText(display, n.x!, labelY);
        }}
        linkColor={() => "rgba(156,163,175,0.5)"}
        linkWidth={1}
        linkDirectionalArrowLength={3.5}
        linkDirectionalArrowRelPos={0.9}
        linkCurvature={0.15}
        backgroundColor="#fafafa"
        cooldownTicks={200}
        warmupTicks={50}
        onEngineStop={() => {
          graphRef.current?.zoomToFit(400, 40);
        }}
        onNodeClick={(node) => {
          if (node.nodeType === "Article" && node.id !== selectedId) {
            onArticleSelect(node.id, node.title || node.name || node.id);
          }
        }}
        onNodeDragEnd={(node) => {
          node.fx = node.x;
          node.fy = node.y;
        }}
      />
      <div className="flex gap-4 mt-2 justify-center">
        {Object.entries(NODE_COLORS).map(([label, color]) => (
          <div key={label} className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
            {label}
          </div>
        ))}
        <span className="text-xs text-gray-400">{nodeCount} nodes · {edges.length} edges</span>
      </div>
    </div>
  );
}
