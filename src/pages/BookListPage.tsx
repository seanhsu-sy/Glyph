import { useEffect, useMemo, useState } from "react";
import {
  createBook,
  deleteBook,
  listBooks,
  renameBook,
} from "../shared/lib/tauri";
import type { Book } from "../shared/lib/tauri";
import { getStatsOverview } from "../shared/lib/stats";
import type { StatsOverview } from "../shared/lib/stats";
import { useThemeStore } from "../app/store/themeStore";

type Props = {
  onOpenBook: (book: Book) => void;
  onOpenStats: () => void;
};

function getLibrarySubtitleKey() {
  return "glyph_library_subtitle";
}

function getBookDescriptionKey(bookId: string) {
  return `glyph_book_description_${bookId}`;
}

function formatMinutes(ms: number) {
  return Math.round(ms / 60000);
}

export function BookListPage({ onOpenBook, onOpenStats }: Props) {
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);

  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState<StatsOverview | null>(null);

  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const [deletingBookId, setDeletingBookId] = useState<string | null>(null);
  const [confirmingBookId, setConfirmingBookId] = useState<string | null>(null);

  const [renamingBookId, setRenamingBookId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState("");

  const [librarySubtitle, setLibrarySubtitle] = useState("本地书籍库");
  const [editingLibrarySubtitle, setEditingLibrarySubtitle] = useState(false);

  const [bookDescriptions, setBookDescriptions] = useState<Record<string, string>>({});
  const [editingDescriptionBookId, setEditingDescriptionBookId] = useState<string | null>(null);
  const [descriptionDraft, setDescriptionDraft] = useState("");

  const loadBooks = async () => {
    setLoading(true);
    try {
      const nextBooks = await listBooks();
      setBooks(nextBooks);

      const nextDescriptions: Record<string, string> = {};
      for (const book of nextBooks) {
        const saved = localStorage.getItem(getBookDescriptionKey(book.id));
        nextDescriptions[book.id] = saved || book.description || "本地书籍文件夹";
      }
      setBookDescriptions(nextDescriptions);
    } catch (err) {
      console.error("读取书籍失败", err);
    } finally {
      setLoading(false);
    }
  };

  const loadOverview = async () => {
    try {
      const data = await getStatsOverview();
      setOverview(data);
    } catch (err) {
      console.error("读取统计失败", err);
    }
  };

  useEffect(() => {
    const saved = localStorage.getItem(getLibrarySubtitleKey());
    if (saved && saved.trim()) {
      setLibrarySubtitle(saved);
    }

    void loadBooks();
    void loadOverview();
  }, []);

  const handleCreateBook = async () => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;

    try {
      await createBook(trimmed);
      setNewTitle("");
      setCreating(false);
      await loadBooks();
    } catch (err) {
      console.error("创建书籍失败", err);
      alert(`创建书籍失败：${String(err)}`);
    }
  };

  const handleDeleteBook = async (book: Book) => {
    try {
      setDeletingBookId(book.id);
      await deleteBook(book.folderPath);
      setConfirmingBookId(null);
      localStorage.removeItem(getBookDescriptionKey(book.id));
      await loadBooks();
      await loadOverview();
    } catch (err) {
      console.error("删除书籍失败", err);
      alert(`删除书籍失败：${String(err)}`);
    } finally {
      setDeletingBookId(null);
    }
  };

  const handleSubmitRename = async (book: Book) => {
    const trimmed = renameTitle.trim();

    if (!trimmed) {
      setRenamingBookId(null);
      setRenameTitle("");
      return;
    }

    if (trimmed === book.title) {
      setRenamingBookId(null);
      setRenameTitle("");
      return;
    }

    try {
      await renameBook(book.folderPath, trimmed);
      setRenamingBookId(null);
      setRenameTitle("");
      await loadBooks();
    } catch (err) {
      console.error("重命名书籍失败", err);
      alert(`重命名书籍失败：${String(err)}`);
      setRenamingBookId(null);
      setRenameTitle("");
    }
  };

  const submitLibrarySubtitle = () => {
    const trimmed = librarySubtitle.trim();
    const nextValue = trimmed || "本地书籍库";
    setLibrarySubtitle(nextValue);
    localStorage.setItem(getLibrarySubtitleKey(), nextValue);
    setEditingLibrarySubtitle(false);
  };

  const startEditDescription = (bookId: string) => {
    setEditingDescriptionBookId(bookId);
    setDescriptionDraft(bookDescriptions[bookId] || "本地书籍文件夹");
  };

  const submitDescription = (bookId: string) => {
    const trimmed = descriptionDraft.trim();
    const nextValue = trimmed || "本地书籍文件夹";

    setBookDescriptions((prev) => ({
      ...prev,
      [bookId]: nextValue,
    }));

    localStorage.setItem(getBookDescriptionKey(bookId), nextValue);
    setEditingDescriptionBookId(null);
    setDescriptionDraft("");
  };

  const statsCards = useMemo(
    () => [
      {
        label: "总字数",
        value: overview?.totalWords ?? 0,
        sub: "累计产出",
      },
      {
        label: "总时长",
        value: formatMinutes(overview?.totalDurationMs ?? 0),
        sub: "分钟",
      },
      {
        label: "写作天数",
        value: overview?.totalWritingDays ?? 0,
        sub: "活跃天",
      },
      {
        label: "当前连续",
        value: overview?.currentStreakDays ?? 0,
        sub: "天",
      },
    ],
    [overview],
  );

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        width: "100%",
        background: "var(--bg)",
        color: "var(--text)",
      }}
      onClick={() => {
        if (editingLibrarySubtitle) {
          submitLibrarySubtitle();
        }
        if (editingDescriptionBookId) {
          submitDescription(editingDescriptionBookId);
        }
      }}
    >
      <div
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "32px 24px 48px",
        }}
      >
        <div
          style={{
            marginBottom: 22,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 24,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                marginBottom: 6,
              }}
            >
              Glyph
            </div>

            {editingLibrarySubtitle ? (
              <input
                autoFocus
                value={librarySubtitle}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setLibrarySubtitle(e.currentTarget.value)}
                onBlur={submitLibrarySubtitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    submitLibrarySubtitle();
                  }
                  if (e.key === "Escape") {
                    const saved = localStorage.getItem(getLibrarySubtitleKey());
                    setLibrarySubtitle(saved || "本地书籍库");
                    setEditingLibrarySubtitle(false);
                  }
                }}
                style={{
                  width: 220,
                  boxSizing: "border-box",
                  padding: "6px 8px",
                  border: "1px solid var(--btn-border)",
                  borderRadius: 8,
                  fontSize: 13,
                  outline: "none",
                  background: "var(--btn-bg)",
                  color: "var(--text-sub)",
                }}
              />
            ) : (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingLibrarySubtitle(true);
                }}
                style={{
                  fontSize: 13,
                  color: "var(--text-sub)",
                  lineHeight: 1.6,
                  cursor: "text",
                  display: "inline-block",
                  padding: "2px 0",
                }}
              >
                {librarySubtitle}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={toggleTheme}
              style={{
                border: "1px solid var(--btn-border)",
                borderRadius: 9,
                background: "var(--btn-bg)",
                color: "var(--text)",
                padding: "8px 12px",
                cursor: "pointer",
                fontSize: 12,
                lineHeight: 1.2,
              }}
            >
              {theme === "light" ? "深色" : "浅色"}
            </button>

            <button
              type="button"
              onClick={() => setCreating(true)}
              style={{
                border: "1px solid var(--btn-border)",
                borderRadius: 9,
                background: "var(--btn-bg)",
                color: "var(--text)",
                padding: "8px 12px",
                cursor: "pointer",
                fontSize: 12,
                lineHeight: 1.2,
              }}
            >
              新建书籍
            </button>
          </div>
        </div>

        <div
          style={{
            marginBottom: 18,
            padding: 14,
            border: "1px solid var(--border)",
            borderRadius: 14,
            background: "var(--card)",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              写作总览
            </div>

            <button
              type="button"
              onClick={onOpenStats}
              style={{
                border: "1px solid var(--btn-border)",
                borderRadius: 9,
                background: "var(--btn-bg)",
                color: "var(--text)",
                padding: "7px 11px",
                cursor: "pointer",
                fontSize: 12,
                lineHeight: 1.2,
              }}
            >
              更多
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 10,
            }}
          >
            {statsCards.map((item) => (
              <div
                key={item.label}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  background: "var(--btn-bg)",
                  padding: 12,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--text-sub)",
                    marginBottom: 6,
                  }}
                >
                  {item.label}
                </div>

                <div
                  style={{
                    fontSize: 20,
                    lineHeight: 1.1,
                    fontWeight: 700,
                    color: "var(--text)",
                  }}
                >
                  {item.value}
                </div>

                <div
                  style={{
                    marginTop: 4,
                    fontSize: 10,
                    color: "var(--text-sub)",
                  }}
                >
                  {item.sub}
                </div>
              </div>
            ))}
          </div>
        </div>

        {creating ? (
          <div
            style={{
              marginBottom: 18,
              padding: 14,
              border: "1px solid var(--border)",
              borderRadius: 14,
              background: "var(--card)",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600 }}>新建书籍</div>

            <input
              type="text"
              value={newTitle}
              placeholder="输入书名"
              onChange={(e) => setNewTitle(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void handleCreateBook();
                }
              }}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "9px 11px",
                border: "1px solid var(--btn-border)",
                borderRadius: 9,
                fontSize: 12,
                outline: "none",
                boxShadow: "none",
                background: "var(--btn-bg)",
                color: "var(--text)",
              }}
            />

            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  void handleCreateBook();
                }}
                style={{
                  border: "1px solid var(--btn-border)",
                  borderRadius: 9,
                  background: "var(--btn-bg)",
                  color: "var(--text)",
                  padding: "7px 11px",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                创建
              </button>

              <button
                type="button"
                onClick={() => {
                  setCreating(false);
                  setNewTitle("");
                }}
                style={{
                  border: "1px solid var(--btn-border)",
                  borderRadius: 9,
                  background: "var(--btn-bg)",
                  color: "var(--text)",
                  padding: "7px 11px",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                取消
              </button>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div
            style={{
              padding: 18,
              border: "1px solid var(--border)",
              borderRadius: 14,
              background: "var(--card)",
              color: "var(--text-sub)",
              fontSize: 12,
            }}
          >
            正在读取本地书籍…
          </div>
        ) : books.length === 0 ? (
          <div
            style={{
              padding: 18,
              border: "1px dashed var(--border)",
              borderRadius: 14,
              color: "var(--text-sub)",
              fontSize: 12,
              background: "var(--card)",
            }}
          >
            还没有书籍。点击右上角「新建书籍」开始。
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr",
              gap: 14,
            }}
          >
            {books.map((book) => {
              const deleting = deletingBookId === book.id;
              const confirming = confirmingBookId === book.id;
              const renaming = renamingBookId === book.id;
              const editingDescription = editingDescriptionBookId === book.id;

              return (
                <div
                  key={book.id}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 14,
                    padding: 14,
                    background: "var(--card)",
                    boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 8,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {renaming ? (
                        <input
                          autoFocus
                          value={renameTitle}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setRenameTitle(e.currentTarget.value)}
                          onFocus={(e) => e.target.select()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              void handleSubmitRename(book);
                            }
                            if (e.key === "Escape") {
                              setRenamingBookId(null);
                              setRenameTitle("");
                            }
                          }}
                          onBlur={() => {
                            void handleSubmitRename(book);
                          }}
                          style={{
                            width: "100%",
                            boxSizing: "border-box",
                            padding: "7px 9px",
                            border: "1px solid var(--accent)",
                            borderRadius: 8,
                            fontSize: 14,
                            fontWeight: 700,
                            outline: "none",
                            background: "var(--btn-bg)",
                            color: "var(--text)",
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => onOpenBook(book)}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            border: "none",
                            background: "transparent",
                            padding: 0,
                            cursor: "pointer",
                            fontSize: 15,
                            fontWeight: 700,
                            color: "var(--text)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                          title={book.title}
                        >
                          {book.title}
                        </button>
                      )}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        flexShrink: 0,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setRenamingBookId(book.id);
                          setRenameTitle(book.title);
                        }}
                        style={{
                          border: "1px solid var(--btn-border)",
                          borderRadius: 8,
                          background: "var(--btn-bg)",
                          color: "var(--text)",
                          padding: "5px 9px",
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                      >
                        改名
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (confirming) {
                            void handleDeleteBook(book);
                            return;
                          }
                          setConfirmingBookId(book.id);
                        }}
                        disabled={deleting}
                        style={{
                          border: "1px solid var(--btn-border)",
                          borderRadius: 8,
                          background: confirming ? "#fff4e5" : "var(--btn-bg)",
                          color: "var(--text)",
                          padding: "5px 9px",
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                      >
                        {deleting ? "..." : confirming ? "确认" : "删除"}
                      </button>
                    </div>
                  </div>

                  {editingDescription ? (
                    <input
                      autoFocus
                      value={descriptionDraft}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setDescriptionDraft(e.currentTarget.value)}
                      onBlur={() => {
                        submitDescription(book.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          submitDescription(book.id);
                        }
                        if (e.key === "Escape") {
                          setEditingDescriptionBookId(null);
                          setDescriptionDraft("");
                        }
                      }}
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "6px 8px",
                        border: "1px solid var(--btn-border)",
                        borderRadius: 8,
                        fontSize: 12,
                        outline: "none",
                        background: "var(--btn-bg)",
                        color: "var(--text-sub)",
                      }}
                    />
                  ) : (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditDescription(book.id);
                      }}
                      style={{
                        fontSize: 12,
                        color: "var(--text-sub)",
                        lineHeight: 1.6,
                        cursor: "text",
                        display: "inline-block",
                        width: "fit-content",
                        padding: "2px 0",
                      }}
                    >
                      {bookDescriptions[book.id] || "本地书籍文件夹"}
                    </div>
                  )}

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      color: "var(--text-sub)",
                      fontSize: 12,
                      lineHeight: 1.5,
                    }}
                  >
                    <div>文件夹：{book.folderName}</div>
                    <div>文档数：{book.documentCount}</div>
                    <div>更新：{book.updatedAt}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}