import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Fuse from "fuse.js";
import { api, type ArticleIndexItem, type SearchResult } from "../api/client";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardActionArea from "@mui/material/CardActionArea";
import Chip from "@mui/material/Chip";
import Box from "@mui/material/Box";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import CircularProgress from "@mui/material/CircularProgress";

import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import BoltOutlinedIcon from "@mui/icons-material/BoltOutlined";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"semantic" | "hybrid">("semantic");
  const [suggestions, setSuggestions] = useState<ArticleIndexItem[]>([]);
  const [semanticResults, setSemanticResults] = useState<SearchResult[]>([]);
  const [indexLoading, setIndexLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [fuse, setFuse] = useState<InstanceType<typeof Fuse<ArticleIndexItem>> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const navigate = useNavigate();

  useEffect(() => {
    api.getArticlesIndex().then((data) => {
      setFuse(
        new Fuse(data.articles, {
          keys: [
            { name: "title", weight: 0.6 },
            { name: "summary", weight: 0.25 },
            { name: "keywords", weight: 0.15 },
          ],
          threshold: 0.4,
          includeScore: true,
          minMatchCharLength: 2,
        })
      );
      setIndexLoading(false);
    });
  }, []);

  function handleInputChange(value: string) {
    setQuery(value);
    setSearched(false);
    setSemanticResults([]);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!fuse || value.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      setSuggestions(fuse.search(value.trim(), { limit: 8 }).map((r) => r.item));
    }, 150);
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSuggestions([]);
    setSearching(true);
    try {
      const res = await api.search(query, 10, mode);
      setSemanticResults(res.results);
    } catch {
      setSemanticResults([]);
    } finally {
      setSearching(false);
      setSearched(true);
    }
  }

  return (
    <Box sx={{ maxWidth: 720 }}>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>Search</Typography>

      <Box component="form" onSubmit={handleSearch} sx={{ mb: 3 }}>
        <Box sx={{ display: "flex", gap: 1, mb: 1.5 }}>
          <TextField
            fullWidth
            size="small"
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder="Search articles..."
            autoFocus
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
          <Button type="submit" variant="contained" disabled={searching || !query.trim()}>
            {searching ? "Searching..." : "Search"}
          </Button>
        </Box>
        <RadioGroup
          row
          value={mode}
          onChange={(e) => setMode(e.target.value as "semantic" | "hybrid")}
        >
          <FormControlLabel value="semantic" control={<Radio size="small" />} label="Semantic" />
          <FormControlLabel value="hybrid" control={<Radio size="small" />} label="Hybrid (semantic + graph)" />
        </RadioGroup>
      </Box>

      {indexLoading && (
        <Typography variant="body2" color="text.disabled" sx={{ mb: 2 }}>
          Loading search index...
        </Typography>
      )}

      {suggestions.length > 0 && !searched && (
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 1 }}>
            <BoltOutlinedIcon sx={{ fontSize: 14 }} color="warning" />
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              QUICK MATCHES
            </Typography>
          </Box>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {suggestions.map((s) => (
              <Card key={s.id} variant="outlined">
                <CardActionArea onClick={() => navigate(`/article/${s.id}`)} sx={{ p: 1.5 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>{s.title}</Typography>
                  {s.summary && (
                    <Typography variant="caption" color="text.secondary" sx={{
                      display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden",
                    }}>
                      {s.summary}
                    </Typography>
                  )}
                  {s.keywords.length > 0 && (
                    <Box sx={{ display: "flex", gap: 0.5, mt: 0.5, flexWrap: "wrap" }}>
                      {s.keywords.slice(0, 4).map((k) => (
                        <Chip key={k} label={k} size="small" variant="outlined" sx={{ fontSize: "0.65rem" }} />
                      ))}
                    </Box>
                  )}
                </CardActionArea>
              </Card>
            ))}
          </Box>
        </Box>
      )}

      {searching && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 4, justifyContent: "center" }}>
          <CircularProgress size={20} />
          <Typography variant="body2" color="text.secondary">Running semantic search...</Typography>
        </Box>
      )}

      {searched && semanticResults.length === 0 && !searching && (
        <Typography color="text.secondary">No semantic results found.</Typography>
      )}

      {semanticResults.length > 0 && (
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 1 }}>
            <SearchOutlinedIcon sx={{ fontSize: 14 }} color="primary" />
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              SEMANTIC RESULTS
            </Typography>
          </Box>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {semanticResults.map((r) => (
              <Card key={r.article.id} variant="outlined" sx={{ transition: "box-shadow 0.2s", "&:hover": { boxShadow: 2 } }}>
                <CardActionArea onClick={() => navigate("/article/" + r.article.id)}>
                  <CardContent>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{r.article.title}</Typography>
                      <Chip
                        label={`${(r.score * 100).toFixed(1)}%`}
                        size="small"
                        color="success"
                        variant="outlined"
                        sx={{ fontFamily: "monospace", fontSize: "0.7rem" }}
                      />
                    </Box>
                    {r.article.summary && (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        {r.article.summary}
                      </Typography>
                    )}
                    <Box sx={{ display: "flex", gap: 0.5, mt: 1, flexWrap: "wrap" }}>
                      {r.article.topics.map((t) => (
                        <Chip key={t} label={t} size="small" color="primary" variant="outlined" sx={{ fontSize: "0.7rem" }} />
                      ))}
                    </Box>
                  </CardContent>
                </CardActionArea>
              </Card>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}
