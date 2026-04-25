import { useState, useEffect } from "react";
import Fab from "@mui/material/Fab";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import Box from "@mui/material/Box";

export default function ScrollButtons() {
  const [nearTop, setNearTop] = useState(true);

  useEffect(() => {
    function onScroll() {
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setNearTop(y < max * 0.4);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function handleClick() {
    if (nearTop) {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  return (
    <Box
      sx={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 1200,
      }}
    >
      <Fab
        size="medium"
        color="primary"
        onClick={handleClick}
        aria-label={nearTop ? "Scroll to bottom" : "Scroll to top"}
        sx={{
          boxShadow: 3,
          transition: "transform 0.2s",
          "&:hover": { transform: "scale(1.1)" },
        }}
      >
        {nearTop ? <KeyboardArrowDownIcon /> : <KeyboardArrowUpIcon />}
      </Fab>
    </Box>
  );
}
