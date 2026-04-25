import { BrowserRouter, Routes, Route } from "react-router-dom";
import MaterialThemeProvider from "./components/MaterialThemeProvider";
import Layout from "./components/Layout";
import HomePage from "./pages/HomePage";
import EditorPage from "./pages/EditorPage";
import ArticlePage from "./pages/ArticlePage";
import SearchPage from "./pages/SearchPage";
import GraphPage from "./pages/GraphPage";
import QuizPage from "./pages/QuizPage";

export default function App() {
  return (
    <MaterialThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/editor" element={<EditorPage />} />
            <Route path="/editor/:id" element={<EditorPage />} />
            <Route path="/article/:id" element={<ArticlePage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/graph" element={<GraphPage />} />
            <Route path="/quiz" element={<QuizPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </MaterialThemeProvider>
  );
}
