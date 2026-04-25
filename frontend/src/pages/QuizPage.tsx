import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Fuse from "fuse.js";
import { api, type QuizResponse, type QuizType } from "../api/client";
import QuizRunner from "../components/QuizRunner";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import CircularProgress from "@mui/material/CircularProgress";
import InputAdornment from "@mui/material/InputAdornment";
import Slider from "@mui/material/Slider";
import Alert from "@mui/material/Alert";
import QuizOutlinedIcon from "@mui/icons-material/QuizOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";

const QUIZ_TYPES: { value: QuizType; label: string; description: string }[] = [
  { value: "mcq", label: "Multiple Choice", description: "4 options, immediate feedback with explanations" },
  { value: "short_answer", label: "Short Answer", description: "Type your answer, compare with model answer" },
  { value: "flashcard", label: "Flashcards", description: "Flip to reveal, self-rate your recall" },
];

function ChipInput({
  label,
  available,
  selected,
  onChange,
}: {
  label: string;
  available: string[];
  selected: string[];
  onChange: (items: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fuseRef = useRef<Fuse<string> | null>(null);

  useEffect(() => {
    fuseRef.current = new Fuse(available, { threshold: 0.4, ignoreLocation: true });
  }, [available]);

  function handleInput(value: string) {
    setQuery(value);
    setShowSuggestions(true);
    const lowerSelected = selected.map((s) => s.toLowerCase());
    if (!fuseRef.current || value.trim().length < 1) {
      setSuggestions(available.filter((a) => !lowerSelected.includes(a.toLowerCase())).slice(0, 8));
      return;
    }
    const matches = fuseRef.current.search(value.trim(), { limit: 8 }).map((r) => r.item);
    setSuggestions(matches.filter((m) => !lowerSelected.includes(m.toLowerCase())));
  }

  function select(item: string) {
    const lowerSelected = selected.map((s) => s.toLowerCase());
    if (!lowerSelected.includes(item.toLowerCase())) {
      onChange([...selected, item]);
    }
    setQuery("");
    setShowSuggestions(false);
    inputRef.current?.focus();
  }

  function remove(item: string) {
    onChange(selected.filter((s) => s !== item));
  }

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
        {label}
        {selected.length > 0 && (
          <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
            ({selected.length} selected)
          </Typography>
        )}
      </Typography>

      {selected.length > 0 && (
        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mb: 1 }}>
          {selected.map((s) => (
            <Chip
              key={s}
              label={s}
              size="small"
              onDelete={() => remove(s)}
              color={label === "Topics" ? "primary" : "secondary"}
              variant="outlined"
            />
          ))}
        </Box>
      )}

      <Box sx={{ position: "relative" }}>
        <TextField
          inputRef={inputRef}
          fullWidth
          size="small"
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => { setShowSuggestions(true); handleInput(query); }}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          placeholder={`Search ${label.toLowerCase()}...`}
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
        {showSuggestions && suggestions.length > 0 && (
          <Paper
            elevation={4}
            sx={{
              position: "absolute", zIndex: 20, top: "100%", mt: 0.5,
              width: "100%", overflow: "hidden", borderRadius: 2,
              maxHeight: 240, overflowY: "auto",
            }}
          >
            {suggestions.map((s) => (
              <Box
                key={s}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(s)}
                sx={{
                  px: 2, py: 1, cursor: "pointer",
                  borderBottom: "1px solid", borderColor: "divider",
                  "&:hover": { bgcolor: "action.hover" },
                }}
              >
                <Typography variant="body2">{s}</Typography>
              </Box>
            ))}
          </Paper>
        )}
      </Box>
    </Box>
  );
}

export default function QuizPage() {
  const [searchParams] = useSearchParams();
  const initialTopics = searchParams.get("topics")?.split(",").filter(Boolean) ||
    (searchParams.get("topic") ? [searchParams.get("topic")!] : []);
  const initialKeywords = searchParams.get("keywords")?.split(",").filter(Boolean) ||
    (searchParams.get("keyword") ? [searchParams.get("keyword")!] : []);

  const [selectedTopics, setSelectedTopics] = useState<string[]>(initialTopics);
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>(initialKeywords);
  const [quizType, setQuizType] = useState<QuizType>("mcq");
  const [numQuestions, setNumQuestions] = useState(5);
  const [quiz, setQuiz] = useState<QuizResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [topics, setTopics] = useState<string[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [indexLoading, setIndexLoading] = useState(true);

  useEffect(() => {
    api.getArticlesIndex().then((data) => {
      const topicSet = new Set<string>();
      const keywordSet = new Set<string>();
      for (const a of data.articles) {
        for (const t of a.topics) topicSet.add(t);
        for (const k of a.keywords) keywordSet.add(k);
      }
      setTopics(Array.from(topicSet).sort());
      setKeywords(Array.from(keywordSet).sort());
      setIndexLoading(false);
    });
  }, []);

  async function handleGenerate() {
    if (!selectedTopics.length && !selectedKeywords.length) {
      setError("Select at least one topic or keyword");
      return;
    }
    setError("");
    setLoading(true);
    setQuiz(null);
    try {
      const res = await api.generateQuiz({
        topics: selectedTopics,
        keywords: selectedKeywords,
        quiz_type: quizType,
        num_questions: numQuestions,
      });
      setQuiz(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate quiz");
    } finally {
      setLoading(false);
    }
  }

  function handleRestart() {
    setQuiz(null);
  }

  if (quiz) {
    const filterLabel = [
      ...quiz.topics.map((t) => `topic: ${t}`),
      ...quiz.keywords.map((k) => `keyword: ${k}`),
    ].join(", ");
    return (
      <Box sx={{ maxWidth: 720 }}>
        <Box sx={{ mb: 3 }}>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>
            {quiz.quiz_type === "mcq" ? "Multiple Choice" : quiz.quiz_type === "short_answer" ? "Short Answer" : "Flashcard"} Quiz
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Based on {quiz.article_count} articles — {filterLabel}
          </Typography>
        </Box>
        <QuizRunner quiz={quiz} onRestart={handleRestart} />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 720 }}>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 1 }}>Quiz</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Test your understanding with AI-generated questions from your articles
      </Typography>

      <Paper sx={{ p: 3, borderRadius: 3, mb: 3 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>
          Select topics and keywords
        </Typography>

        <Box sx={{ mb: 3 }}>
          <ChipInput
            label="Topics"
            available={topics}
            selected={selectedTopics}
            onChange={setSelectedTopics}
          />
        </Box>

        <ChipInput
          label="Keywords"
          available={keywords}
          selected={selectedKeywords}
          onChange={setSelectedKeywords}
        />

        {!selectedTopics.length && !selectedKeywords.length && !indexLoading && (
          <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 1.5 }}>
            Select at least one topic or keyword to generate a quiz
          </Typography>
        )}
      </Paper>

      <Paper sx={{ p: 3, borderRadius: 3, mb: 3 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>
          Quiz type
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {QUIZ_TYPES.map((qt) => (
            <Paper
              key={qt.value}
              variant="outlined"
              onClick={() => setQuizType(qt.value)}
              sx={{
                p: 2, cursor: "pointer", borderRadius: 2,
                borderColor: quizType === qt.value ? "primary.main" : "divider",
                bgcolor: quizType === qt.value ? "action.selected" : "transparent",
                transition: "all 0.15s",
                "&:hover": { borderColor: "primary.light" },
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{qt.label}</Typography>
              <Typography variant="caption" color="text.secondary">{qt.description}</Typography>
            </Paper>
          ))}
        </Box>
      </Paper>

      <Paper sx={{ p: 3, borderRadius: 3, mb: 3 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
          Number of questions: {numQuestions}
        </Typography>
        <Slider
          value={numQuestions}
          onChange={(_, v) => setNumQuestions(v as number)}
          min={3}
          max={15}
          step={1}
          marks={[{ value: 3, label: "3" }, { value: 5, label: "5" }, { value: 10, label: "10" }, { value: 15, label: "15" }]}
          valueLabelDisplay="auto"
          sx={{ mt: 1 }}
        />
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Button
        variant="contained"
        size="large"
        fullWidth
        startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <QuizOutlinedIcon />}
        onClick={handleGenerate}
        disabled={loading || (!selectedTopics.length && !selectedKeywords.length)}
        sx={{ py: 1.5, borderRadius: 2 }}
      >
        {loading ? "Generating Quiz..." : "Generate Quiz"}
      </Button>
    </Box>
  );
}
