import Pagination from "@mui/material/Pagination";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

interface Props {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export default function PaginationControls({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: Props) {
  const totalPages = Math.ceil(total / pageSize);

  if (total === 0) return null;

  const firstItem = (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, total);

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 2,
        mt: 3,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Typography variant="body2" color="text.secondary">
          {firstItem}&ndash;{lastItem} of {total}
        </Typography>
        <Typography variant="body2" color="text.disabled">
          |
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Per page
        </Typography>
        <FormControl size="small" variant="outlined">
          <Select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            sx={{ height: 32, fontSize: "0.85rem", minWidth: 72 }}
          >
            {PAGE_SIZE_OPTIONS.map((opt) => (
              <MenuItem key={opt} value={opt} sx={{ fontSize: "0.85rem" }}>
                {opt}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {totalPages > 1 && (
        <Pagination
          count={totalPages}
          page={page}
          onChange={(_, p) => onPageChange(p)}
          color="primary"
          shape="rounded"
          size="small"
        />
      )}
    </Box>
  );
}
