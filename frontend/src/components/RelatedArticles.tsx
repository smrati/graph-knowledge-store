import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import Typography from "@mui/material/Typography";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Divider from "@mui/material/Divider";
import Chip from "@mui/material/Chip";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";

interface Neighbor {
  id: string;
  title: string;
  shared_nodes: number;
  connection_type: string;
}

export default function RelatedArticles({ articleId }: { articleId: string }) {
  const [neighbors, setNeighbors] = useState<Neighbor[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.getNeighbors(articleId, 5)
      .then((data) => {
        const seen = new Set<string>();
        const unique = (data.neighbors || []).filter((n: Neighbor) => {
          if (seen.has(n.id)) return false;
          seen.add(n.id);
          return true;
        });
        setNeighbors(unique);
      })
      .catch(() => setNeighbors([]))
      .finally(() => setLoading(false));
  }, [articleId]);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
        <CircularProgress size={20} />
      </Box>
    );
  }
  if (neighbors.length === 0) return null;

  return (
    <Box sx={{ mt: 4 }}>
      <Divider sx={{ mb: 2 }} />
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
        Related Articles
      </Typography>
      <List disablePadding>
        {neighbors.map((n) => (
          <ListItem key={n.id} disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton
              onClick={() => navigate(`/article/${n.id}`)}
              sx={{ borderRadius: 1 }}
            >
              <ListItemText
                primary={n.title}
                sx={{ "& .MuiListItemText-primary": { fontWeight: 500, fontSize: "0.875rem" } }}
              />
              <Chip
                label={`${n.shared_nodes} shared`}
                size="small"
                variant="outlined"
                sx={{ fontSize: "0.7rem" }}
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
  );
}
