import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, type ChatSessionResponse, type ChatMessageResponse } from "../api/client";
import MarkdownPreview from "../components/MarkdownPreview";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import IconButton from "@mui/material/IconButton";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import ChatBubbleOutlineOutlinedIcon from "@mui/icons-material/ChatBubbleOutlineOutlined";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import { useSnackbar } from "notistack";

interface LocalMessage {
  role: "user" | "assistant";
  content: string;
  sources?: { id: string; title: string; score: number }[];
  loading?: boolean;
}

export default function ChatPage() {
  const { enqueueSnackbar } = useSnackbar();
  const [sessions, setSessions] = useState<ChatSessionResponse[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.listChatSessions().then((data) => {
      setSessions(data);
      setSessionsLoading(false);
      if (data.length > 0) {
        loadSession(data[0].id);
      }
    }).catch(() => setSessionsLoading(false));
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadSession(sessionId: string) {
    setActiveSessionId(sessionId);
    const msgs = await api.getChatMessages(sessionId);
    setMessages(msgs.map((m: ChatMessageResponse) => ({
      role: m.role,
      content: m.content,
      sources: m.sources || undefined,
    })));
  }

  async function handleNewChat() {
    const cs = await api.createChatSession();
    setSessions((prev) => [cs, ...prev]);
    setActiveSessionId(cs.id);
    setMessages([]);
  }

  async function handleSend() {
    const query = input.trim();
    if (!query || loading) return;
    setInput("");

    let sessionId = activeSessionId;
    if (!sessionId) {
      const cs = await api.createChatSession();
      sessionId = cs.id;
      setSessions((prev) => [cs, ...prev]);
      setActiveSessionId(sessionId);
    }

    setMessages((prev) => [...prev, { role: "user", content: query }, { role: "assistant", content: "", loading: true }]);
    setLoading(true);

    try {
      let fullContent = "";
      let sources: { id: string; title: string; score: number }[] = [];
      for await (const event of api.streamRAG(query, sessionId)) {
        if (event.type === "chunk") {
          fullContent += event.content;
          const current = fullContent;
          setMessages((prev) => [
            ...prev.slice(0, -1),
            { role: "assistant", content: current },
          ]);
        } else if (event.type === "sources") {
          sources = event.sources;
        }
      }
      setMessages((prev) => [
        ...prev.slice(0, -1),
        { role: "assistant", content: fullContent, sources },
      ]);
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, updated_at: new Date().toISOString() } : s))
      );
    } catch {
      setMessages((prev) => [
        ...prev.slice(0, -1),
        { role: "assistant", content: "Sorry, something went wrong. Please try again." },
      ]);
      enqueueSnackbar("Failed to get response", { variant: "error" });
    }
    setLoading(false);
  }

  async function handleDeleteSession() {
    if (!deleteTarget) return;
    try {
      await api.deleteChatSession(deleteTarget);
      setSessions((prev) => prev.filter((s) => s.id !== deleteTarget));
      if (activeSessionId === deleteTarget) {
        setActiveSessionId(null);
        setMessages([]);
      }
    } catch {
      enqueueSnackbar("Failed to delete session", { variant: "error" });
    }
    setDeleteTarget(null);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <Box sx={{
      display: "flex",
      height: "calc(100vh - 64px)",
    }}>
      <Box sx={{ width: 260, borderRight: 1, borderColor: "divider", display: "flex", flexDirection: "column", bgcolor: "background.paper" }}>
        <Box sx={{ p: 2 }}>
          <Button
            variant="outlined"
            fullWidth
            startIcon={<AddOutlinedIcon />}
            onClick={handleNewChat}
            size="small"
          >
            New Chat
          </Button>
        </Box>
        <Box sx={{ flex: 1, overflow: "auto", px: 1 }}>
          {sessionsLoading && <Box sx={{ textAlign: "center", py: 4 }}><CircularProgress size={24} /></Box>}
          {sessions.map((s) => (
            <Box
              key={s.id}
              onClick={() => loadSession(s.id)}
              sx={{
                p: 1.5,
                mb: 0.5,
                borderRadius: 1.5,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 1,
                bgcolor: activeSessionId === s.id ? "action.selected" : "transparent",
                "&:hover": { bgcolor: "action.hover" },
              }}
            >
              <ChatBubbleOutlineOutlinedIcon sx={{ fontSize: 18, color: "text.secondary", flexShrink: 0 }} />
              <Typography
                variant="body2"
                sx={{
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontWeight: activeSessionId === s.id ? 600 : 400,
                }}
              >
                {s.title}
              </Typography>
              <IconButton
                size="small"
                onClick={(e) => { e.stopPropagation(); setDeleteTarget(s.id); }}
                sx={{ color: "text.disabled", "&:hover": { color: "error.main" }, flexShrink: 0 }}
              >
                <DeleteOutlinedIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Box>
          ))}
        </Box>
      </Box>

      <Box sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {messages.length === 0 && !loading && (
          <Box sx={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, color: "text.disabled" }}>
            <SmartToyOutlinedIcon sx={{ fontSize: 48 }} />
            <Typography variant="h6">Ask about your knowledge base</Typography>
            <Typography variant="body2" color="text.secondary">
              Questions are answered using your articles as context
            </Typography>
          </Box>
        )}

        <Box sx={{ flex: 1, overflow: "auto", px: 3, py: 2 }}>
          {messages.map((msg, i) => (
            <Box
              key={i}
              sx={{
                mb: 2.5,
                display: "flex",
                justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
              }}
            >
              <Box sx={{ maxWidth: "80%" }}>
                {msg.role === "user" ? (
                  <Paper sx={{ p: 2, borderRadius: 3, bgcolor: "primary.main", color: "primary.contrastText" }}>
                    <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>{msg.content}</Typography>
                  </Paper>
                ) : msg.loading ? (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 1 }}>
                    <CircularProgress size={20} />
                    <Typography variant="body2" color="text.secondary">Thinking...</Typography>
                  </Box>
                ) : (
                  <Paper sx={{ p: 2, borderRadius: 3, bgcolor: "background.paper" }}>
                    <Box sx={{ "& p": { mt: 0, mb: 1 }, "& ul, & ol": { mt: 0.5, mb: 1 } }}>
                      <MarkdownPreview content={msg.content} />
                    </Box>
                    {msg.sources && msg.sources.length > 0 && (
                      <Box sx={{ mt: 1.5, pt: 1.5, borderTop: 1, borderColor: "divider" }}>
                        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
                          Sources:
                        </Typography>
                        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                          {msg.sources.map((s) => (
                            <Chip
                              key={s.id}
                              label={s.title}
                              size="small"
                              variant="outlined"
                              clickable
                              component={Link}
                              to={`/article/${s.id}`}
                              sx={{ maxWidth: 200 }}
                            />
                          ))}
                        </Box>
                      </Box>
                    )}
                  </Paper>
                )}
              </Box>
            </Box>
          ))}
          <div ref={messagesEndRef} />
        </Box>

        <Box sx={{ p: 2, borderTop: 1, borderColor: "divider", bgcolor: "background.paper" }}>
          <Box sx={{ display: "flex", gap: 1, maxWidth: 900, mx: "auto", width: "100%" }}>
            <TextField
              fullWidth
              multiline
              maxRows={4}
              placeholder="Ask a question about your articles..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              size="small"
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2.5 } }}
            />
            <IconButton
              color="primary"
              onClick={handleSend}
              disabled={loading || !input.trim()}
              sx={{ bgcolor: "primary.main", color: "white", "&:hover": { bgcolor: "primary.dark" }, "&:disabled": { bgcolor: "action.disabledBackground" }, borderRadius: 2.5, width: 44, height: 44, alignSelf: "flex-end" }}
            >
              <SendOutlinedIcon />
            </IconButton>
          </Box>
        </Box>
      </Box>

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Delete Chat?</DialogTitle>
        <DialogContent>
          <Typography>This will permanently delete this conversation and all its messages.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button onClick={handleDeleteSession} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
