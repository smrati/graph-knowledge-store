import { useEffect, useState } from "react";
import { api, type ArticleListItem } from "../api/client";
import ArticleCard from "../components/ArticleCard";
import Typography from "@mui/material/Typography";
import Pagination from "@mui/material/Pagination";
import Box from "@mui/material/Box";

export default function HomePage() {
  const [articles, setArticles] = useState<ArticleListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  useEffect(() => {
    api.listArticles(page).then((res) => {
      setArticles(res.articles);
      setTotal(res.total);
    });
  }, [page]);

  const totalPages = Math.ceil(total / 20);

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>Articles</Typography>
        <Typography variant="body2" color="text.secondary">{total} total</Typography>
      </Box>
      {articles.length === 0 ? (
        <Typography color="text.secondary">No articles yet. Create your first one!</Typography>
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
