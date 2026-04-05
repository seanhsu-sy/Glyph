import { useCallback, useEffect, useState } from "react";

import { useThemeStore } from "./app/store/themeStore";
import { BookListPage } from "./pages/BookListPage";
import { EditorPage } from "./pages/EditorPage";
import { StatisticsPage } from "./pages/StatisticsPage";
import type { Book } from "./shared/lib/tauri";

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
        position: "relative",
        zIndex: 1,
      }}
    >
      {children}
    </div>
  );
}

function App() {
  const [page, setPage] = useState<AppPage>("library");
  const [currentBook, setCurrentBook] = useState<Book | null>(null);
  const [libraryOverlayOpen, setLibraryOverlayOpen] = useState(false);
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!libraryOverlayOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setLibraryOverlayOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [libraryOverlayOpen]);

  const openBook = useCallback((book: Book) => {
    setCurrentBook(book);
    setPage("editor");
    setLibraryOverlayOpen(false);
  }, []);

  const exitToLibrary = useCallback(() => {
    setCurrentBook(null);
    setPage("library");
    setLibraryOverlayOpen(false);
  }, []);

  return (
    <>
      {page === "editor" && currentBook ? (
        <AppShell>
          <EditorPage
            book={currentBook}
            onBack={() => setLibraryOverlayOpen(true)}
            onExitToLibrary={exitToLibrary}
          />
          {libraryOverlayOpen ? (
            <div
              role="dialog"
              aria-modal="true"
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 1000,
                background: "var(--bg)",
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
              }}
            >
              <BookListPage
                onOpenBook={openBook}
                onOpenStats={() => {
                  setLibraryOverlayOpen(false);
                  setPage("stats");
                }}
              />
            </div>
          ) : null}
        </AppShell>
      ) : page === "stats" ? (
        <AppShell>
          <StatisticsPage
            onBack={() => {
              setPage("library");
            }}
          />
        </AppShell>
      ) : (
        <AppShell>
          <BookListPage
            onOpenBook={openBook}
            onOpenStats={() => {
              setPage("stats");
            }}
          />
        </AppShell>
      )}
    </>
  );
}

export default App;
