import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

interface Node {
  id: string;
  label: string;
  name?: string;
  title?: string;
}

interface Edge {
  source: string;
  target: string;
  type: string;
}

export default function GraphVisualization({ articleId }: { articleId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadGraph() {
      const res = await fetch(`/api/graph/article/${articleId}/subgraph`);
      const data = await res.json();
      if (cancelled) return;

      const nodes: Node[] = data.subgraph?.nodes || [];
      const edges: Edge[] = data.subgraph?.edges || [];

      if (!canvasRef.current || !containerRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const width = containerRef.current.clientWidth;
      const height = 400;
      canvas.width = width;
      canvas.height = height;

      const positions = new Map<string, { x: number; y: number }>();
      nodes.forEach((n, i) => {
        const angle = (2 * Math.PI * i) / nodes.length;
        const radius = Math.min(width, height) * 0.35;
        positions.set(n.id, {
          x: width / 2 + radius * Math.cos(angle),
          y: height / 2 + radius * Math.sin(angle),
        });
      });

      const colors: Record<string, string> = {
        Article: "#6366f1",
        Topic: "#10b981",
        Keyword: "#f59e0b",
        Entity: "#ef4444",
      };

      ctx.clearRect(0, 0, width, height);

      edges.forEach((e) => {
        const src = positions.get(e.source);
        const tgt = positions.get(e.target);
        if (src && tgt) {
          ctx.beginPath();
          ctx.moveTo(src.x, src.y);
          ctx.lineTo(tgt.x, tgt.y);
          ctx.strokeStyle = "#e5e7eb";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      });

      nodes.forEach((n) => {
        const pos = positions.get(n.id);
        if (!pos) return;
        const color = colors[n.label] || "#9ca3af";
        const isArticle = n.label === "Article";
        const radius = isArticle ? 12 : 8;

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = "#374151";
        ctx.font = "11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(n.title || n.name || n.id, pos.x, pos.y + radius + 14);
      });

      canvas.onclick = (e) => {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        for (const n of nodes) {
          const pos = positions.get(n.id);
          if (!pos) continue;
          const dx = mx - pos.x;
          const dy = my - pos.y;
          if (dx * dx + dy * dy < 225) {
            if (n.label === "Article") {
              navigate(`/article/${n.id}`);
            }
            break;
          }
        }
      };
    }

    loadGraph();
    return () => {
      cancelled = true;
    };
  }, [articleId, navigate]);

  return (
    <div ref={containerRef}>
      <canvas ref={canvasRef} className="w-full rounded-lg border border-gray-200" />
    </div>
  );
}
