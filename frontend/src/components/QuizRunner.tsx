import { useState } from "react";
import {
  type QuizResponse,
  type McqQuestion,
  type ShortAnswerQuestion,
  type FlashcardItem,
} from "../api/client";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import LinearProgress from "@mui/material/LinearProgress";
import CheckCircleOutlineOutlinedIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import EmojiObjectsOutlinedIcon from "@mui/icons-material/EmojiObjectsOutlined";
import RestartAltIcon from "@mui/icons-material/RestartAlt";

interface Props {
  quiz: QuizResponse;
  onRestart: () => void;
}

export default function QuizRunner({ quiz, onRestart }: Props) {
  const [current, setCurrent] = useState(0);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  if (quiz.quiz_type === "mcq") {
    return (
      <McqRunner
        questions={quiz.questions as McqQuestion[]}
        current={current}
        score={score}
        onNext={() => {
          if (current + 1 >= (quiz.questions as McqQuestion[]).length) setFinished(true);
          else setCurrent(current + 1);
        }}
        onCorrect={() => setScore((s) => s + 1)}
        finished={finished}
        onRestart={onRestart}
      />
    );
  }

  if (quiz.quiz_type === "short_answer") {
    return (
      <ShortAnswerRunner
        questions={quiz.questions as ShortAnswerQuestion[]}
        current={current}
        score={score}
        onNext={() => {
          if (current + 1 >= (quiz.questions as ShortAnswerQuestion[]).length) setFinished(true);
          else setCurrent(current + 1);
        }}
        onCorrect={() => setScore((s) => s + 1)}
        finished={finished}
        onRestart={onRestart}
      />
    );
  }

  return (
    <FlashcardRunner
      items={quiz.questions as FlashcardItem[]}
      current={current}
      score={score}
      onNext={() => {
        if (current + 1 >= (quiz.questions as FlashcardItem[]).length) setFinished(true);
        else setCurrent(current + 1);
      }}
      onGotIt={() => setScore((s) => s + 1)}
      finished={finished}
      onRestart={onRestart}
    />
  );
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <Box sx={{ mb: 3 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
        <Typography variant="caption" color="text.secondary">
          Question {current + 1} of {total}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {Math.round(((current) / total) * 100)}%
        </Typography>
      </Box>
      <LinearProgress variant="determinate" value={(current / total) * 100} sx={{ borderRadius: 4, height: 6 }} />
    </Box>
  );
}

function ScoreCard({
  score,
  total,
  onRestart,
}: {
  score: number;
  total: number;
  onRestart: () => void;
}) {
  const pct = Math.round((score / total) * 100);
  return (
    <Paper sx={{ p: 4, textAlign: "center", borderRadius: 3 }}>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
        {pct >= 80 ? "Excellent!" : pct >= 50 ? "Good effort!" : "Keep practicing!"}
      </Typography>
      <Typography variant="h2" sx={{ fontWeight: 700, color: "primary.main", my: 2 }}>
        {score}/{total}
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        You scored {pct}% — {score} correct out of {total} questions
      </Typography>
      <Button variant="contained" startIcon={<RestartAltIcon />} onClick={onRestart} size="large">
        Try Again
      </Button>
    </Paper>
  );
}

function McqRunner({
  questions,
  current,
  score,
  onNext,
  onCorrect,
  finished,
  onRestart,
}: {
  questions: McqQuestion[];
  current: number;
  score: number;
  onNext: () => void;
  onCorrect: () => void;
  finished: boolean;
  onRestart: () => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);

  if (finished) return <ScoreCard score={score} total={questions.length} onRestart={onRestart} />;

  const q = questions[current];
  const isCorrect = selected === q.correct_index;

  return (
    <Box>
      <ProgressBar current={current} total={questions.length} />
      <Paper sx={{ p: 3, borderRadius: 3, mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>{q.question}</Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {q.options.map((opt, i) => {
            let borderColor = "divider";
            let bgColor = "transparent";
            if (selected !== null) {
              if (i === q.correct_index) { borderColor = "#4caf50"; bgColor = "rgba(76,175,80,0.08)"; }
              else if (i === selected && !isCorrect) { borderColor = "#ef5350"; bgColor = "rgba(239,83,80,0.08)"; }
            }
            return (
              <Paper
                key={opt.label}
                variant="outlined"
                onClick={() => selected === null && setSelected(i)}
                sx={{
                  p: 1.5, cursor: selected === null ? "pointer" : "default",
                  borderColor, backgroundColor: bgColor,
                  transition: "all 0.15s",
                  "&:hover": selected === null ? { borderColor: "primary.main", bgcolor: "action.hover" } : {},
                  borderRadius: 2,
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                  <Chip label={opt.label} size="small" sx={{ fontWeight: 600, minWidth: 28 }} />
                  <Typography variant="body2">{opt.text}</Typography>
                  {selected !== null && i === q.correct_index && <CheckCircleOutlineOutlinedIcon sx={{ ml: "auto", color: "#4caf50", fontSize: 20 }} />}
                  {selected !== null && i === selected && !isCorrect && i !== q.correct_index && <CancelOutlinedIcon sx={{ ml: "auto", color: "#ef5350", fontSize: 20 }} />}
                </Box>
              </Paper>
            );
          })}
        </Box>
      </Paper>

      {selected !== null && (
        <Paper sx={{ p: 2, mb: 2, borderRadius: 2, bgcolor: isCorrect ? "rgba(76,175,80,0.06)" : "rgba(239,83,80,0.06)" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
            {isCorrect ? <CheckCircleOutlineOutlinedIcon sx={{ color: "#4caf50" }} /> : <CancelOutlinedIcon sx={{ color: "#ef5350" }} />}
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: isCorrect ? "#4caf50" : "#ef5350" }}>
              {isCorrect ? "Correct!" : "Incorrect"}
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary">{q.explanation}</Typography>
        </Paper>
      )}

      {selected !== null && (
        <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
          <Button
            variant="contained"
            onClick={() => {
              if (isCorrect) onCorrect();
              setSelected(null);
              onNext();
            }}
          >
            {current + 1 >= questions.length ? "See Results" : "Next Question"}
          </Button>
        </Box>
      )}
    </Box>
  );
}

function ShortAnswerRunner({
  questions,
  current,
  score,
  onNext,
  onCorrect,
  finished,
  onRestart,
}: {
  questions: ShortAnswerQuestion[];
  current: number;
  score: number;
  onNext: () => void;
  onCorrect: () => void;
  finished: boolean;
  onRestart: () => void;
}) {
  const [answer, setAnswer] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [selfScored, setSelfScored] = useState(false);

  if (finished) return <ScoreCard score={score} total={questions.length} onRestart={onRestart} />;

  const q = questions[current];

  return (
    <Box>
      <ProgressBar current={current} total={questions.length} />
      <Paper sx={{ p: 3, borderRadius: 3, mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>{q.question}</Typography>
        <TextField
          fullWidth
          multiline
          minRows={3}
          maxRows={6}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Type your answer..."
          disabled={revealed}
          sx={{ mb: 2 }}
        />
        {!revealed && (
          <Button variant="contained" onClick={() => setRevealed(true)} disabled={!answer.trim()}>
            Submit Answer
          </Button>
        )}
      </Paper>

      {revealed && (
        <>
          <Paper sx={{ p: 3, mb: 2, borderRadius: 2, border: "1px solid", borderColor: "primary.light" }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: "primary.main" }}>
              Model Answer
            </Typography>
            <Typography variant="body2" sx={{ mb: 2 }}>{q.model_answer}</Typography>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
              Key Points:
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
              {q.key_points.map((pt, i) => (
                <Box key={i} sx={{ display: "flex", alignItems: "flex-start", gap: 0.5 }}>
                  <EmojiObjectsOutlinedIcon sx={{ fontSize: 16, mt: 0.25, color: "warning.main" }} />
                  <Typography variant="body2" color="text.secondary">{pt}</Typography>
                </Box>
              ))}
            </Box>
          </Paper>

          {!selfScored && (
            <Paper sx={{ p: 2, mb: 2, borderRadius: 2, textAlign: "center" }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Did you cover the key points?
              </Typography>
              <Box sx={{ display: "flex", justifyContent: "center", gap: 1 }}>
                <Button
                  variant="outlined"
                  color="success"
                  startIcon={<CheckCircleOutlineOutlinedIcon />}
                  onClick={() => { onCorrect(); setSelfScored(true); }}
                >
                  I Got It
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<CancelOutlinedIcon />}
                  onClick={() => setSelfScored(true)}
                >
                  Missed It
                </Button>
              </Box>
            </Paper>
          )}

          {selfScored && (
            <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
              <Button
                variant="contained"
                onClick={() => {
                  setAnswer("");
                  setRevealed(false);
                  setSelfScored(false);
                  onNext();
                }}
              >
                {current + 1 >= questions.length ? "See Results" : "Next Question"}
              </Button>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}

function FlashcardRunner({
  items,
  current,
  score,
  onNext,
  onGotIt,
  finished,
  onRestart,
}: {
  items: FlashcardItem[];
  current: number;
  score: number;
  onNext: () => void;
  onGotIt: () => void;
  finished: boolean;
  onRestart: () => void;
}) {
  const [flipped, setFlipped] = useState(false);

  if (finished) return <ScoreCard score={score} total={items.length} onRestart={onRestart} />;

  const card = items[current];

  return (
    <Box>
      <ProgressBar current={current} total={items.length} />
      <Paper
        onClick={() => !flipped && setFlipped(true)}
        sx={{
          p: 4,
          borderRadius: 3,
          minHeight: 220,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          cursor: flipped ? "default" : "pointer",
          transition: "all 0.2s",
          border: "2px solid",
          borderColor: flipped ? "primary.main" : "divider",
          "&:hover": flipped ? {} : { borderColor: "primary.light", boxShadow: 2 },
        }}
      >
        <Typography variant="caption" color="text.disabled" sx={{ mb: 1, textAlign: "center" }}>
          {flipped ? "ANSWER" : "QUESTION — click to reveal"}
        </Typography>
        <Typography variant="h6" sx={{ fontWeight: 600, textAlign: "center", mb: flipped ? 2 : 0 }}>
          {flipped ? card.back : card.front}
        </Typography>
        {!flipped && card.hint && (
          <Typography variant="body2" color="text.disabled" sx={{ mt: 2, textAlign: "center", fontStyle: "italic" }}>
            Hint: {card.hint}
          </Typography>
        )}
      </Paper>

      {flipped && (
        <Box sx={{ display: "flex", justifyContent: "center", gap: 1.5, mt: 2 }}>
          <Button
            variant="outlined"
            color="error"
            startIcon={<CancelOutlinedIcon />}
            onClick={() => {
              setFlipped(false);
              onNext();
            }}
          >
            Missed It
          </Button>
          <Button
            variant="contained"
            color="success"
            startIcon={<CheckCircleOutlineOutlinedIcon />}
            onClick={() => {
              onGotIt();
              setFlipped(false);
              onNext();
            }}
          >
            Got It
          </Button>
        </Box>
      )}
    </Box>
  );
}
