import { useEffect, useState } from "react";

import { BookListPage } from "./pages/BookListPage";
import { EditorPage } from "./pages/EditorPage";
import { StatisticsPage } from "./pages/StatisticsPage";
import type { Book } from "./shared/lib/tauri";
import { useThemeStore } from "./app/store/themeStore";

type AppPage = "library" | "editor" | "stats";

function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        height: "100%",
        width: "100%",
      }}
    >
      {children}
    </div>
  );
}

function App() {
  const [page, setPage] = useState<AppPage>("library");
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  if (page === "editor" && selectedBook) {
    return (
      <AppShell>
        <EditorPage
          book={selectedBook}
          onBack={() => {
            setSelectedBook(null);
            setPage("library");
          }}
        />
      </AppShell>
    );
  }

  if (page === "stats") {
    return (
      <AppShell>
        <StatisticsPage
          onBack={() => {
            setPage("library");
          }}
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <BookListPage
        onOpenBook={(book) => {
          setSelectedBook(book);
          setPage("editor");
        }}
        onOpenStats={() => {
          setPage("stats");
        }}
      />
    </AppShell>
  );
}

export default App;