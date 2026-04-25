import { createTheme } from "@mui/material/styles";

const common = {
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h4: { fontWeight: 600 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 500,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)",
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 500,
        },
      },
    },
  },
};

export const lightTheme = createTheme({
  ...common,
  palette: {
    mode: "light",
    primary: {
      main: "#5c6bc0",
      light: "#8e99f3",
      dark: "#26418f",
    },
    secondary: {
      main: "#26a69a",
      light: "#64d8cb",
      dark: "#00796b",
    },
    background: {
      default: "#f5f5f5",
      paper: "#ffffff",
    },
  },
});

export const darkTheme = createTheme({
  ...common,
  palette: {
    mode: "dark",
    primary: {
      main: "#7986cb",
      light: "#aab2f5",
      dark: "#4955a8",
    },
    secondary: {
      main: "#4db6ac",
      light: "#82e9de",
      dark: "#00867a",
    },
    text: {
      primary: "#eceff1",
      secondary: "#b0bec5",
      disabled: "#78909c",
    },
    background: {
      default: "#121212",
      paper: "#1e1e1e",
    },
    divider: "rgba(255,255,255,0.08)",
  },
  components: {
    ...common.components,
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: "0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)",
          border: "1px solid rgba(255,255,255,0.06)",
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: "#1a1a2e",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundImage: "none",
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 500,
        },
        outlined: {
          borderColor: "rgba(255,255,255,0.15)",
        },
      },
    },
  },
});
