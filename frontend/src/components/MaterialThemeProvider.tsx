import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { SnackbarProvider } from "notistack";
import theme from "../theme";

export default function MaterialThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <SnackbarProvider maxSnack={3} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        {children}
      </SnackbarProvider>
    </ThemeProvider>
  );
}
