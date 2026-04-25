import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { SnackbarProvider } from "notistack";
import { lightTheme, darkTheme } from "../theme";

interface ThemeContextValue {
  dark: boolean;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({ dark: false, toggleTheme: () => {} });

export function useThemeMode() {
  return useContext(ThemeContext);
}

const STORAGE_KEY = "knowledge-store-theme";

function getInitialMode(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) return stored === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

export default function MaterialThemeProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(getInitialMode);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, dark ? "dark" : "light");
    document.documentElement.classList.toggle("dark-mode", dark);
  }, [dark]);

  function toggleTheme() {
    setDark((prev) => !prev);
  }

  return (
    <ThemeContext.Provider value={{ dark, toggleTheme }}>
      <ThemeProvider theme={dark ? darkTheme : lightTheme}>
        <CssBaseline />
        <SnackbarProvider maxSnack={3} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
          {children}
        </SnackbarProvider>
      </ThemeProvider>
    </ThemeContext.Provider>
  );
}
