import { useEffect, useState } from "react";

import { BookListPage } from "./pages/BookListPage";
import { EditorPage } from "./pages/EditorPage";
import { StatisticsPage } from "./pages/StatisticsPage";
import type { Book } from "./shared/lib/tauri";
import { useThemeStore } from "./app/store/themeStore";

type AppPage = "library" | "editor" | "stats";

function App() {
  const [page, setPage] = useState<AppPage>("library");
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  if (page === "editor" && selectedBook) {
    return (
      <EditorPage
        book={selectedBook}
        onBack={() => {
          setSelectedBook(null);
          setPage("library");
        }}
      />
    );
  }

  if (page === "stats") {
    return (
      <StatisticsPage
        onBack={() => {
          setPage("library");
        }}
      />
    );
  }

  return (
    <BookListPage
      onOpenBook={(book) => {
        setSelectedBook(book);
        setPage("editor");
      }}
      onOpenStats={() => {
        setPage("stats");
      }}
    />
  );
}

export default App;