import { useCallback, useEffect, useRef, useState } from "react";
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
import Tooltip from "@mui/material/Tooltip";
import FunctionsIcon from "@mui/icons-material/Functions";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import SaveIcon from "@mui/icons-material/Save";
import { useSnackbar } from "notistack";

function getTextArea(): HTMLTextAreaElement | null {
  return document.querySelector("textarea.w-md-editor-text-input") || document.querySelector(".w-md-editor textarea") || null;
}

export default function ArticleEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { dark } = useThemeMode();
  const isEditing = Boolean(id);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [fixEquations, setFixEquations] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [fixing, setFixing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef(content);
  contentRef.current = content;

  useEffect(() => {
    if (!id) {
      setTitle("");
      setContent("");
      setLoadedId(null);
      return;
    }
    api.getArticle(id).then((article) => {
      setTitle(article.title);
      setContent(article.content);
      setLoadedId(id);
    }).catch(() => navigate("/"));
  }, [id, navigate]);

  const handleSave = useCallback(async () => {
    if (!contentRef.current.trim()) return;
    setLoading(true);
    setError("");
    try {
      if (id) {
        await api.updateArticle(id, { title, content: contentRef.current, fix_equations: fixEquations || undefined });
        enqueueSnackbar("Article updated", { variant: "success" });
        navigate(`/article/${id}`);
      } else {
        const article = await api.createArticle({ content: contentRef.current, fix_equations: fixEquations || undefined });
        enqueueSnackbar("Article created", { variant: "success" });
        navigate(`/article/${article.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setLoading(false);
    }
  }, [id, title, fixEquations, navigate, enqueueSnackbar]);

  const canSave = isEditing
    ? loading || !content.trim() || !title.trim()
    : loading || !content.trim();

  const handleFixEquation = useCallback(async () => {
    const ta = getTextArea();
    if (!ta) {
      enqueueSnackbar("Could not find editor textarea", { variant: "error" });
      return;
    }
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    if (s === e) {
      enqueueSnackbar("Select an equation in the editor first", { variant: "info", autoHideDuration: 3000 });
      return;
    }
    const cur = contentRef.current;
    const selected = cur.substring(s, e);
    if (!selected.trim()) return;

    setFixing(true);
    try {
      const res = await api.fixEquation(selected);
      setContent(cur.substring(0, s) + res.fixed + cur.substring(e));
      enqueueSnackbar("Equation fixed", { variant: "success", autoHideDuration: 2000 });
    } catch {
      enqueueSnackbar("Failed to fix equation", { variant: "error" });
    }
    setFixing(false);
  }, [enqueueSnackbar]);

  const handleImageUpload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const res = await api.uploadImage(file);
      const ta = getTextArea();
      const cur = contentRef.current;
      const pos = ta ? ta.selectionStart : cur.length;
      const md = `![](${res.url})`;
      setContent(cur.substring(0, pos) + md + cur.substring(pos));
      enqueueSnackbar("Image uploaded", { variant: "success", autoHideDuration: 2000 });
    } catch (err) {
      enqueueSnackbar(err instanceof Error ? err.message : "Image upload failed", { variant: "error" });
    }
    setUploading(false);
  }, [enqueueSnackbar]);

  useEffect(() => {
    const container = editorRef.current;
    if (!container) return;

    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) handleImageUpload(file);
          return;
        }
      }
    }

    container.addEventListener("paste", onPaste);
    return () => container.removeEventListener("paste", onPaste);
  }, [handleImageUpload, loadedId]);

  if (isEditing && loadedId !== id) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

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

      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2, flexWrap: "wrap" }}>
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
              Auto-fix equations
              <Typography component="span" variant="caption" color="text.disabled">
                (regex on save)
              </Typography>
            </Box>
          }
        />
        <Tooltip title="Select equation text in the editor, then click this to fix it with LLM">
          <Button
            size="small"
            variant="outlined"
            startIcon={fixing ? <CircularProgress size={14} /> : <FunctionsIcon />}
            onClick={handleFixEquation}
            disabled={fixing}
            sx={{ borderRadius: 2 }}
          >
            {fixing ? "Fixing..." : "Fix Equation (select first)"}
          </Button>
        </Tooltip>
      </Box>

      <div ref={editorRef}>
        <MDEditor value={content} onChange={(v) => setContent(v || "")} height={700} />
      </div>
      {uploading && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
          Uploading image...
        </Typography>
      )}
    </Box>
  );
}
