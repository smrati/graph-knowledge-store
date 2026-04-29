import { useState } from "react";
import MDEditor from "@uiw/react-md-editor";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { useThemeMode } from "./MaterialThemeProvider";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import SaveIcon from "@mui/icons-material/Save";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import FunctionsIcon from "@mui/icons-material/Functions";
import { useSnackbar } from "notistack";

export default function ArticleEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const isEditing = Boolean(id);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [fixEquations, setFixEquations] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  if (isEditing && !loaded) {
    (async () => {
      const article = await api.getArticle(id!);
      setTitle(article.title);
      setContent(article.content);
      setLoaded(true);
    })();
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  async function handleSave() {
    if (!content.trim()) return;
    setLoading(true);
    setError("");
    try {
      if (isEditing) {
        await api.updateArticle(id!, { title, content, fix_equations: fixEquations || undefined });
        enqueueSnackbar("Article updated", { variant: "success" });
        navigate(`/article/${id}`);
      } else {
        const article = await api.createArticle({ content, fix_equations: fixEquations || undefined });
        enqueueSnackbar("Article created", { variant: "success" });
        navigate(`/article/${article.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setLoading(false);
    }
  }

  const canSave = isEditing
    ? loading || !content.trim() || !title.trim()
    : loading || !content.trim();

  const { dark } = useThemeMode();

  return (
    <Box sx={{ maxWidth: 900 }} data-color-mode={dark ? "dark" : "light"}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          {isEditing ? "Edit Article" : "New Article"}
        </Typography>
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          onClick={handleSave}
          disabled={canSave}
        >
          {loading ? "Saving..." : "Save"}
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {isEditing && (
        <TextField
          fullWidth
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          sx={{ mb: 3 }}
          size="small"
        />
      )}

      {!isEditing && (
        <Alert severity="info" icon={<AutoFixHighIcon />} sx={{ mb: 3 }}>
          Title will be auto-generated from your content
        </Alert>
      )}

      <FormControlLabel
        control={
          <Checkbox
            checked={fixEquations}
            onChange={(e) => setFixEquations(e.target.checked)}
            icon={<FunctionsIcon />}
            checkedIcon={<FunctionsIcon />}
          />
        }
        label={
          <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
            Fix equations with LLM
            <Typography component="span" variant="caption" color="text.disabled">
              (extra LLM call to normalize LaTeX)
            </Typography>
          </Box>
        }
        sx={{ mb: 2 }}
      />

      <MDEditor value={content} onChange={(v) => setContent(v || "")} height={700} />
    </Box>
  );
}
