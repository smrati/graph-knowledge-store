import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, type Article } from "../api/client";
import MarkdownPreview from "./MarkdownPreview";
import RelatedArticles from "./RelatedArticles";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import CircularProgress from "@mui/material/CircularProgress";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";

export default function ArticleView() {
  const { id } = useParams() as { id: string };
  const navigate = useNavigate();
  const [article, setArticle] = useState<Article | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    api.getArticle(id).then(setArticle).catch(() => navigate("/"));
  }, [id, navigate]);

  async function handleDelete() {
    setConfirmOpen(false);
    await api.deleteArticle(article!.id);
    navigate("/");
  }

  if (!article) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 900 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, flex: 1, pr: 2 }}>{article.title}</Typography>
        <Box sx={{ display: "flex", gap: 1, flexShrink: 0 }}>
          <Button
            variant="outlined"
            startIcon={<EditOutlinedIcon />}
            onClick={() => navigate(`/editor/${article.id}`)}
          >
            Edit
          </Button>
          <Button
            variant="outlined"
            color="error"
            startIcon={<DeleteOutlineIcon />}
            onClick={() => setConfirmOpen(true)}
          >
            Delete
          </Button>
        </Box>
      </Box>

      {(article.topics.length > 0 || article.keywords.length > 0) && (
        <Box sx={{ display: "flex", gap: 0.5, mb: 3, flexWrap: "wrap" }}>
          {article.topics.map((t: string) => (
            <Chip
              key={t}
              label={t}
              size="small"
              color="primary"
              variant="outlined"
              clickable
              onClick={() => navigate("/?topic=" + encodeURIComponent(t))}
            />
          ))}
          {article.keywords.map((k: string) => (
            <Chip
              key={k}
              label={k}
              size="small"
              variant="outlined"
              clickable
              onClick={() => navigate("/?keyword=" + encodeURIComponent(k))}
            />
          ))}
        </Box>
      )}

      <Paper elevation={0} sx={{ p: 3, bgcolor: "background.paper", borderRadius: 2 }}>
        <MarkdownPreview content={article.content} />
      </Paper>

      <RelatedArticles articleId={article.id} />

      <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 3 }}>
        Created {new Date(article.created_at).toLocaleString()} · Updated {new Date(article.updated_at).toLocaleString()}
      </Typography>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Delete Article?</DialogTitle>
        <DialogContent>
          <Typography>This will permanently delete &quot;{article.title}&quot;.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
