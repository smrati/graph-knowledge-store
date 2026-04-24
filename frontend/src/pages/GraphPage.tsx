import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Fuse from "fuse.js";
import ForceGraph2D, { type ForceGraphMethods, type NodeObject } from "react-force-graph-2d";
import { api, type ArticleIndexItem, type GraphNode, type GraphEdge, type GraphStats } from "../api/client";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import CircularProgress from "@mui/material/CircularProgress";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import ClearOutlinedIcon from "@mui/icons-material/ClearOutlined";

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
  Article: "#5c6bc0",
  Topic: "#26a69a",
  Keyword: "#ffa726",
  Entity: "#ef5350",
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
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>Knowledge Graph</Typography>
        {stats && (
          <Box sx={{ display: "flex", gap: 2 }}>
            {Object.entries(stats).map(([key, val]) => (
              <Chip key={key} label={`${val} ${key}`} size="small" variant="outlined" />
            ))}
          </Box>
        )}
      </Box>

      <Box sx={{ position: "relative", mb: 3, maxWidth: 480 }}>
        <Box sx={{ display: "flex", gap: 1 }}>
          <TextField
            fullWidth
            size="small"
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            placeholder={indexLoading ? "Loading index..." : "Type to find an article..."}
            disabled={indexLoading}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchOutlinedIcon fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
          />
          {selectedId && (
            <Button variant="outlined" size="small" onClick={clearSelection} startIcon={<ClearOutlinedIcon />}>
              Clear
            </Button>
          )}
        </Box>

        {suggestions.length > 0 && (
          <Paper
            elevation={4}
            sx={{
              position: "absolute", zIndex: 20, top: "100%", mt: 0.5,
              width: "100%", overflow: "hidden", borderRadius: 2,
            }}
          >
            {suggestions.map((s) => (
              <Box
                key={s.id}
                onClick={() => selectArticle(s)}
                sx={{
                  px: 2, py: 1.5, cursor: "pointer",
                  borderBottom: "1px solid", borderColor: "divider",
                  "&:hover": { bgcolor: "action.hover" },
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 500 }}>{s.title}</Typography>
                {s.keywords.length > 0 && (
                  <Box sx={{ display: "flex", gap: 0.5, mt: 0.5 }}>
                    {s.keywords.slice(0, 3).map((k) => (
                      <Chip key={k} label={k} size="small" variant="outlined" sx={{ fontSize: "0.65rem" }} />
                    ))}
                  </Box>
                )}
              </Box>
            ))}
          </Paper>
        )}
      </Box>

      {selectedId && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
          <AccountTreeOutlinedIcon color="primary" fontSize="small" />
          <Typography variant="body2" sx={{ fontWeight: 500 }}>{selectedTitle}</Typography>
          <Button size="small" onClick={() => navigate(`/article/${selectedId}`)}>View article</Button>
        </Box>
      )}

      {loading && (
        <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: 256 }}>
          <CircularProgress />
        </Box>
      )}

      {!loading && nodes.length === 0 && (
        <Box sx={{ textAlign: "center", py: 8 }}>
          <AccountTreeOutlinedIcon sx={{ fontSize: 48, color: "text.disabled", mb: 1 }} />
          <Typography color="text.disabled">No graph data available yet.</Typography>
          <Typography variant="caption" color="text.disabled">Create and enrich articles to build the knowledge graph.</Typography>
        </Box>
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
    </Box>
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
      color: NODE_COLORS[n.label] || "#9e9e9e",
    })),
    links: edges.map((e) => ({
      source: e.source,
      target: e.target,
      edgeType: e.type,
      color: "#bdbdbd",
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

  const articleCount = nodes.filter((n) => n.label === "Article").length;

  return (
    <Box ref={containerRef}>
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
          const display = label.length > maxLen ? label.slice(0, maxLen - 1) + "\u2026" : label;
          const fontSize = Math.max(12 / globalScale, 3.5);
          ctx.font = `${n.nodeType === "Article" ? "600 " : ""}${fontSize}px "Roboto", sans-serif`;
          const isCenter = n.id === selectedId;
          const r = n.nodeType === "Article"
            ? (isCenter ? 7 : 5) * (articleCount > 5 ? 0.8 : 1)
            : 3.5 * (articleCount > 5 ? 0.8 : 1);
          ctx.beginPath();
          ctx.arc(n.x!, n.y!, r, 0, 2 * Math.PI);
          ctx.fillStyle = n.color;
          ctx.fill();
          if (isCenter) {
            ctx.strokeStyle = "#26418f";
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
          ctx.fillStyle = isCenter ? "#26418f" : n.nodeType === "Article" ? "#212121" : "#757575";
          ctx.fillText(display, n.x!, labelY);
        }}
        linkColor={() => "rgba(189,189,189,0.5)"}
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
      <Box sx={{ display: "flex", gap: 2, mt: 1, justifyContent: "center", alignItems: "center" }}>
        {Object.entries(NODE_COLORS).map(([label, color]) => (
          <Box key={label} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Box sx={{ width: 12, height: 12, borderRadius: "50%", bgcolor: color }} />
            <Typography variant="caption" color="text.secondary">{label}</Typography>
          </Box>
        ))}
        <Typography variant="caption" color="text.disabled">{nodes.length} nodes &middot; {edges.length} edges</Typography>
      </Box>
    </Box>
  );
}
