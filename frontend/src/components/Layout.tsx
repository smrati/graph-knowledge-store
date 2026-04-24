import { NavLink, Outlet } from "react-router-dom";
import Drawer from "@mui/material/Drawer";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import AddBoxOutlinedIcon from "@mui/icons-material/AddBoxOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";

const NAV_ITEMS = [
  { to: "/", label: "Articles", icon: <MenuBookOutlinedIcon />, end: true },
  { to: "/editor", label: "New Article", icon: <AddBoxOutlinedIcon />, end: false },
  { to: "/search", label: "Search", icon: <SearchOutlinedIcon />, end: false },
  { to: "/graph", label: "Graph", icon: <AccountTreeOutlinedIcon />, end: false },
];

const DRAWER_WIDTH = 240;

export default function Layout() {
  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: DRAWER_WIDTH,
            boxSizing: "border-box",
            borderRight: "1px solid",
            borderColor: "divider",
          },
        }}
      >
        <Box sx={{ p: 2.5, pb: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, color: "primary.main", letterSpacing: -0.5 }}>
            Knowledge Store
          </Typography>
        </Box>
        <List sx={{ px: 1, pt: 0.5 }}>
          {NAV_ITEMS.map(({ to, label, icon, end }) => (
            <ListItem key={to} disablePadding sx={{ mb: 0.5 }}>
              <ListItemButton
                component={NavLink}
                to={to}
                end={end}
                sx={{
                  borderRadius: 2,
                  py: 1,
                  "&.active": {
                    bgcolor: "primary.main",
                    color: "#fff",
                    "& .MuiListItemIcon-root": { color: "#fff" },
                    "&:hover": { bgcolor: "primary.dark" },
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 40 }}>{icon}</ListItemIcon>
                <ListItemText primary={label} sx={{ "& .MuiListItemText-primary": { fontWeight: 500, fontSize: "0.9rem" } }} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Drawer>
      <Box component="main" sx={{ flex: 1, overflow: "auto", bgcolor: "background.default" }}>
        <Box sx={{ maxWidth: 1200, mx: "auto", p: 3 }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
