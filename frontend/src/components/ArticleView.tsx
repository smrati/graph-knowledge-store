import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, type Article, type QuizType } from "../api/client";
import MarkdownPreview from "./MarkdownPreview";
import RelatedArticles from "./RelatedArticles";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import CircularProgress from "@mui/material/CircularProgress";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import CheckOutlinedIcon from "@mui/icons-material/CheckOutlined";
import QuizOutlinedIcon from "@mui/icons-material/QuizOutlined";
import CheckBoxOutlinedIcon from "@mui/icons-material/CheckBoxOutlined";
import EditNoteOutlinedIcon from "@mui/icons-material/EditNoteOutlined";
import StyleOutlinedIcon from "@mui/icons-material/StyleOutlined";

const ACTIVE_QUIZ_KEY = "active-quiz-id";

const QUIZ_TYPES: { value: QuizType; label: string; icon: React.ReactNode }[] = [
  { value: "mcq", label: "Multiple Choice", icon: <CheckBoxOutlinedIcon fontSize="small" /> },
  { value: "short_answer", label: "Short Answer", icon: <EditNoteOutlinedIcon fontSize="small" /> },
  { value: "flashcard", label: "Flashcards", icon: <StyleOutlinedIcon fontSize="small" /> },
];

export default function ArticleView() {
  const { id } = useParams() as { id: string };
  const navigate = useNavigate();
  const [article, setArticle] = useState<Article | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [quizAnchor, setQuizAnchor] = useState<null | HTMLElement>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.getArticle(id).then(setArticle).catch(() => navigate("/"));
  }, [id, navigate]);

  async function handleDelete() {
    setConfirmOpen(false);
    await api.deleteArticle(article!.id);
    navigate("/");
  }

  async function handleQuizTypeSelect(quizType: QuizType) {
    setQuizAnchor(null);
    if (!article) return;
    setQuizLoading(true);
    try {
      const res = await api.generateArticleQuiz(article.id, { quiz_type: quizType, num_questions: 10 });
      localStorage.setItem(ACTIVE_QUIZ_KEY, res.quiz_id);
      navigate("/quiz");
    } catch (err) {
      setQuizLoading(false);
    }
  }

  function handleCopyMarkdown() {
    if (!article) return;
    const md = `# ${article.title}\n\n${article.content}`;
    navigator.clipboard.writeText(md).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
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
            startIcon={quizLoading ? <CircularProgress size={16} /> : <QuizOutlinedIcon />}
            onClick={(e) => setQuizAnchor(e.currentTarget)}
            disabled={quizLoading}
          >
            Quiz
          </Button>
          <Menu
            anchorEl={quizAnchor}
            open={Boolean(quizAnchor)}
            onClose={() => setQuizAnchor(null)}
          >
            {QUIZ_TYPES.map((qt) => (
              <MenuItem key={qt.value} onClick={() => handleQuizTypeSelect(qt.value)}>
                <ListItemIcon>{qt.icon}</ListItemIcon>
                <ListItemText>{qt.label}</ListItemText>
              </MenuItem>
            ))}
          </Menu>
          <Button
            variant="outlined"
            startIcon={copied ? <CheckOutlinedIcon /> : <ContentCopyOutlinedIcon />}
            onClick={handleCopyMarkdown}
            color={copied ? "success" : "primary"}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
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
