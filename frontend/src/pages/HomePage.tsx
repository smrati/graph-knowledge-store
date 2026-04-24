import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, type ArticleListItem } from "../api/client";
import ArticleCard from "../components/ArticleCard";
import Typography from "@mui/material/Typography";
import Pagination from "@mui/material/Pagination";
import Chip from "@mui/material/Chip";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";

export default function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const topic = searchParams.get("topic") || undefined;
  const keyword = searchParams.get("keyword") || undefined;

  const [articles, setArticles] = useState<ArticleListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [topic, keyword]);

  useEffect(() => {
    api.listArticles(page, 20, { topic, keyword }).then((res) => {
      setArticles(res.articles);
      setTotal(res.total);
    });
  }, [page, topic, keyword]);

  const totalPages = Math.ceil(total / 20);

  function clearFilter() {
    setSearchParams({});
  }

  const title = topic
    ? `Articles tagged "${topic}"`
    : keyword
    ? `Articles with keyword "${keyword}"`
    : "Articles";

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>{title}</Typography>
        <Typography variant="body2" color="text.secondary">{total} total</Typography>
      </Box>

      {(topic || keyword) && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
          <Chip
            label={topic ? `Topic: ${topic}` : `Keyword: ${keyword}`}
            color="primary"
            size="small"
            onDelete={clearFilter}
          />
          <IconButton size="small" onClick={clearFilter}>
            <CloseOutlinedIcon fontSize="small" />
          </IconButton>
        </Box>
      )}

      {articles.length === 0 ? (
        <Typography color="text.secondary">
          {topic || keyword ? "No articles match this filter." : "No articles yet. Create your first one!"}
        </Typography>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {articles.map((a) => (
            <ArticleCard key={a.id} article={a} />
          ))}
        </Box>
      )}
      {totalPages > 1 && (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 3 }}>
          <Pagination
            count={totalPages}
            page={page}
            onChange={(_, p) => setPage(p)}
            color="primary"
            shape="rounded"
          />
        </Box>
      )}
    </Box>
  );
}
