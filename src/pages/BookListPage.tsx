import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  clearBookCover,
  createBook,
  deleteBook,
  getBookCoverDataUrl,
  listBooks,
  pickAndSetBookCover,
  renameBook,
  setBookGroup,
} from "../shared/lib/tauri";
import type { Book } from "../shared/lib/tauri";
import { getStatsOverview } from "../shared/lib/stats";
import type { StatsOverview } from "../shared/lib/stats";
import { ThemeModeButton } from "../components/ThemeModeButton";
import { TypewriterSoundButton } from "../components/TypewriterSoundButton";

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

function displayGroupName(group: string | undefined): string {
  const t = (group ?? "").trim();
  return t || "未分组";
}

function sortGroupKeys(groups: Set<string>): string[] {
  const ung = "未分组";
  const arr = [...groups];
  const ungIncluded = arr.includes(ung);
  const rest = arr
    .filter((g) => g !== ung)
    .sort((a, b) => a.localeCompare(b, "zh-CN"));
  return ungIncluded ? [ung, ...rest] : rest.sort((a, b) => a.localeCompare(b, "zh-CN"));
}

type BookCoverSlotProps = {
  coverPath: string | null;
  bookFolderPath: string;
  bookTitle: string;
  coverDataBust: number;
  canInteract: boolean;
  onPick: () => void;
  onClear: () => void;
};

/** 无上传封面：纯抽象色块 + 书脊，无文字（随主题色变化） */
function BookCoverPlaceholder({ seed }: { seed: string }) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const glowX = 68 + (Math.abs(h) % 32);
  const glowY = 6 + (Math.abs(h >> 8) % 22);
  const orb = 38 + (Math.abs(h >> 16) % 18);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        borderRadius: 9,
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 5,
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--accent) 55%, var(--card)) 0%, color-mix(in srgb, var(--accent-soft) 100%, var(--card)) 100%)",
          boxShadow: "inset -1px 0 0 color-mix(in srgb, var(--text) 8%, transparent)",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 5,
          top: 0,
          right: 0,
          bottom: 0,
          background: `
            radial-gradient(ellipse ${glowX}% ${46 + (Math.abs(h) % 14)}% at ${glowY}% 0%, color-mix(in srgb, var(--accent) 26%, transparent), transparent 56%),
            radial-gradient(ellipse 88% 62% at 0% 100%, color-mix(in srgb, var(--accent-soft) 42%, transparent), transparent 50%),
            linear-gradient(168deg, color-mix(in srgb, var(--card) 96%, var(--accent-soft)) 0%, color-mix(in srgb, var(--bg) 52%, var(--card)) 100%)`,
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 5,
          top: "18%",
          right: "12%",
          width: `${orb}%`,
          paddingBottom: `${orb}%`,
          borderRadius: "50%",
          background:
            "radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--accent-soft) 55%, transparent), transparent 62%)",
          opacity: 0.45,
          filter: "blur(0.5px)",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 5,
          top: 0,
          right: 0,
          bottom: 0,
          opacity: 0.05,
          backgroundImage:
            "repeating-linear-gradient(-18deg, transparent, transparent 7px, var(--text) 7px, var(--text) 7.4px)",
        }}
      />
    </div>
  );
}

function BookCoverSlot({
  coverPath,
  bookFolderPath,
  bookTitle,
  coverDataBust,
  canInteract,
  onPick,
  onClear,
}: BookCoverSlotProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!coverPath || !isTauri()) {
      setDataUrl(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const url = await getBookCoverDataUrl(bookFolderPath);
        if (!cancelled) setDataUrl(url);
      } catch {
        if (!cancelled) setDataUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [coverPath, bookFolderPath, coverDataBust]);

  return (
    <div
      role={canInteract ? "button" : undefined}
      tabIndex={canInteract ? 0 : undefined}
      onClick={(e) => {
        if (!canInteract) return;
        e.stopPropagation();
        if (e.shiftKey) {
          void onClear();
        } else {
          void onPick();
        }
      }}
      onKeyDown={(e) => {
        if (!canInteract) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          void onPick();
        }
      }}
      title={canInteract ? "点击上传封面；Shift+点击清除封面" : undefined}
      style={{
        width: 72,
        height: 96,
        flexShrink: 0,
        borderRadius: 10,
        overflow: "hidden",
        border: "1px solid color-mix(in srgb, var(--border) 85%, var(--accent-soft))",
        background: "var(--btn-bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: canInteract ? "pointer" : "default",
        outline: "none",
      }}
    >
      {dataUrl ? (
        <img
          src={dataUrl}
          alt=""
          draggable={false}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            pointerEvents: "none",
          }}
        />
      ) : (
        <BookCoverPlaceholder seed={`${bookFolderPath}\0${bookTitle}`} />
      )}
    </div>
  );
}

export function BookListPage({
  onOpenBook,
  onOpenStats,
}: Props) {
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

  const [groupFilter, setGroupFilter] = useState<"all" | string>("all");
  const [bookSearchQuery, setBookSearchQuery] = useState("");
  const [libraryNarrow, setLibraryNarrow] = useState(false);
  const [editingGroupBookId, setEditingGroupBookId] = useState<string | null>(null);
  const [groupDraft, setGroupDraft] = useState("");
  const groupEditCancelledRef = useRef(false);
  /** 同一 coverPath 下替换图片后强制重新拉取 data URL */
  const [coverDataBust, setCoverDataBust] = useState<Record<string, number>>({});

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

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const update = () => setLibraryNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
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

  const handleSubmitGroup = async (book: Book) => {
    if (!isTauri()) return;
    if (groupEditCancelledRef.current) {
      groupEditCancelledRef.current = false;
      return;
    }
    const g = groupDraft.trim();
    try {
      await setBookGroup(book.folderPath, g);
      setEditingGroupBookId(null);
      setGroupDraft("");
      await loadBooks();
    } catch (err) {
      console.error(err);
      alert(`保存分组失败：${String(err)}`);
    }
  };

  const handlePickCover = async (book: Book) => {
    if (!isTauri()) return;
    try {
      await pickAndSetBookCover(book.folderPath);
      await loadBooks();
      setCoverDataBust((prev) => ({
        ...prev,
        [book.id]: (prev[book.id] ?? 0) + 1,
      }));
    } catch (err) {
      console.error(err);
      alert(`设置封面失败：${String(err)}`);
    }
  };

  const handleClearCover = async (book: Book) => {
    if (!isTauri()) return;
    try {
      await clearBookCover(book.folderPath);
      await loadBooks();
      setCoverDataBust((prev) => ({
        ...prev,
        [book.id]: (prev[book.id] ?? 0) + 1,
      }));
    } catch (err) {
      console.error(err);
      alert(`清除封面失败：${String(err)}`);
    }
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

  const uniqueGroupKeys = useMemo(() => {
    const s = new Set<string>();
    for (const b of books) {
      s.add(displayGroupName(b.group));
    }
    return sortGroupKeys(s);
  }, [books]);

  const filteredBooks = useMemo(() => {
    if (groupFilter === "all") return books;
    return books.filter((b) => displayGroupName(b.group) === groupFilter);
  }, [books, groupFilter]);

  const searchedBooks = useMemo(() => {
    const q = bookSearchQuery.trim().toLowerCase();
    if (!q) return filteredBooks;
    return filteredBooks.filter((b) => {
      const g = displayGroupName(b.group).toLowerCase();
      return (
        b.title.toLowerCase().includes(q) ||
        (b.folderName ?? "").toLowerCase().includes(q) ||
        g.includes(q)
      );
    });
  }, [filteredBooks, bookSearchQuery]);

  const bookSections = useMemo(() => {
    const m = new Map<string, Book[]>();
    for (const b of searchedBooks) {
      const g = displayGroupName(b.group);
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(b);
    }
    const keys = sortGroupKeys(new Set(m.keys()));
    return keys.map((k) => ({ group: k, books: m.get(k)! }));
  }, [searchedBooks]);

  const uniqueGroupKeysInView = useMemo(() => {
    const s = new Set<string>();
    for (const b of searchedBooks) {
      s.add(displayGroupName(b.group));
    }
    return sortGroupKeys(s);
  }, [searchedBooks]);

  const showSectionHeader =
    groupFilter === "all" && uniqueGroupKeysInView.length > 1;

  const bookGridStyle = {
    display: "grid",
    gridTemplateColumns: libraryNarrow ? "1fr" : "repeat(2, minmax(0, 1fr))",
    gap: 14,
  } as const;

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
          position: "sticky",
          top: 0,
          zIndex: 10,
          display: "flex",
          justifyContent: "flex-end",
          background: "var(--bg)",
          padding: "10px 24px",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 1200,
            margin: "0 auto",
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}
        >
          <ThemeModeButton />
          <TypewriterSoundButton />
        </div>
      </div>

      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "24px 24px 48px",
        }}
      >
        <div style={{ marginBottom: 22 }}>
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
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 6,
              lineHeight: 1.6,
            }}
          >
            <span>还没有书籍。点击</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setCreating(true);
              }}
              style={{
                border: "1px solid var(--btn-border)",
                borderRadius: 9,
                background: "var(--btn-bg)",
                color: "var(--text)",
                padding: "6px 12px",
                cursor: "pointer",
                fontSize: 12,
                lineHeight: 1.2,
              }}
            >
              新建书籍
            </button>
            <span>开始。</span>
          </div>
        ) : (
          <>
            <div
              style={{
                marginBottom: 12,
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 8,
                justifyContent: "space-between",
                rowGap: 8,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 8,
                  flex: "1 1 auto",
                  minWidth: 0,
                }}
              >
                <span style={{ fontSize: 11, color: "var(--text-sub)" }}>筛选</span>
                <button
                  type="button"
                  onClick={() => setGroupFilter("all")}
                  style={{
                    border: `1px solid ${groupFilter === "all" ? "var(--accent)" : "var(--btn-border)"}`,
                    borderRadius: 8,
                    background: groupFilter === "all" ? "var(--accent-soft)" : "var(--btn-bg)",
                    color: "var(--text)",
                    padding: "4px 10px",
                    cursor: "pointer",
                    fontSize: 11,
                  }}
                >
                  全部
                </button>
                {uniqueGroupKeys.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGroupFilter(g)}
                    style={{
                      border: `1px solid ${groupFilter === g ? "var(--accent)" : "var(--btn-border)"}`,
                      borderRadius: 8,
                      background: groupFilter === g ? "var(--accent-soft)" : "var(--btn-bg)",
                      color: "var(--text)",
                      padding: "4px 10px",
                      cursor: "pointer",
                      fontSize: 11,
                    }}
                  >
                    {g}
                  </button>
                ))}
                <span
                  style={{
                    marginLeft: 4,
                    fontSize: 11,
                    color: "var(--text-sub)",
                    alignSelf: "center",
                  }}
                >
                  搜索
                </span>
                <input
                  type="search"
                  value={bookSearchQuery}
                  onChange={(e) => setBookSearchQuery(e.target.value)}
                  placeholder="书名 / 文件夹 / 分组"
                  style={{
                    minWidth: 160,
                    flex: "1 1 160px",
                    maxWidth: 320,
                    boxSizing: "border-box",
                    padding: "5px 9px",
                    border: "1px solid var(--btn-border)",
                    borderRadius: 8,
                    fontSize: 12,
                    background: "var(--btn-bg)",
                    color: "var(--text)",
                  }}
                />
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setCreating(true);
                }}
                title="新建书籍"
                aria-label="新建书籍"
                style={{
                  flexShrink: 0,
                  width: 32,
                  height: 32,
                  border: "1px solid var(--btn-border)",
                  borderRadius: 9,
                  background: "var(--btn-bg)",
                  color: "var(--text)",
                  cursor: "pointer",
                  fontSize: 18,
                  lineHeight: 1,
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                +
              </button>
            </div>

            {filteredBooks.length > 0 && searchedBooks.length === 0 ? (
              <div
                style={{
                  marginBottom: 14,
                  padding: 14,
                  border: "1px dashed var(--border)",
                  borderRadius: 12,
                  color: "var(--text-sub)",
                  fontSize: 12,
                  background: "var(--card)",
                }}
              >
                没有与当前搜索匹配的书籍。
              </div>
            ) : null}

            {bookSections.map(({ group: sectionGroup, books: sectionBooks }) => (
              <div key={sectionGroup} style={{ marginBottom: 18 }}>
                {showSectionHeader ? (
                  <div
                    style={{
                      marginBottom: 8,
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--text-sub)",
                    }}
                  >
                    {sectionGroup}
                  </div>
                ) : null}
                <div style={bookGridStyle}>
                  {sectionBooks.map((book) => {
                    const deleting = deletingBookId === book.id;
                    const confirming = confirmingBookId === book.id;
                    const renaming = renamingBookId === book.id;
                    const editingDescription = editingDescriptionBookId === book.id;

                    return (
                      <div
                        key={book.id}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          position: "relative",
                          border: "1px solid var(--border)",
                          borderRadius: 14,
                          padding: 14,
                          paddingBottom: 50,
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
                            gap: 12,
                            alignItems: "flex-start",
                          }}
                        >
                          <BookCoverSlot
                            coverPath={book.coverPath}
                            bookFolderPath={book.folderPath}
                            bookTitle={book.title}
                            coverDataBust={coverDataBust[book.id] ?? 0}
                            canInteract={isTauri()}
                            onPick={() => {
                              void handlePickCover(book);
                            }}
                            onClear={() => {
                              void handleClearCover(book);
                            }}
                          />

                          <div
                            style={{
                              flex: 1,
                              minWidth: 0,
                              display: "flex",
                              flexDirection: "column",
                              gap: 8,
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
                                  <div
                                    onDoubleClick={(e) => {
                                      e.stopPropagation();
                                      setRenamingBookId(book.id);
                                      setRenameTitle(book.title);
                                    }}
                                    title="双击书名可改名"
                                    style={{
                                      width: "100%",
                                      fontSize: 15,
                                      fontWeight: 700,
                                      color: "var(--text)",
                                      whiteSpace: "nowrap",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      cursor: "default",
                                    }}
                                  >
                                    {book.title}
                                  </div>
                                )}
                              </div>

                              <div
                                style={{
                                  display: "flex",
                                  gap: 6,
                                  flexShrink: 0,
                                  flexWrap: "wrap",
                                  justifyContent: "flex-end",
                                }}
                              >
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

                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                flexWrap: "wrap",
                                fontSize: 12,
                              }}
                            >
                              <span style={{ color: "var(--text-sub)" }}>分组</span>
                              {isTauri() ? (
                                editingGroupBookId === book.id ? (
                                  <input
                                    autoFocus
                                    value={groupDraft}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => setGroupDraft(e.currentTarget.value)}
                                    placeholder="分组名称，留空为未分组"
                                    onBlur={() => {
                                      void handleSubmitGroup(book);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        void handleSubmitGroup(book);
                                      }
                                      if (e.key === "Escape") {
                                        groupEditCancelledRef.current = true;
                                        setEditingGroupBookId(null);
                                        setGroupDraft("");
                                      }
                                    }}
                                    style={{
                                      flex: 1,
                                      minWidth: 120,
                                      maxWidth: 280,
                                      boxSizing: "border-box",
                                      padding: "5px 8px",
                                      border: "1px solid var(--accent)",
                                      borderRadius: 8,
                                      fontSize: 12,
                                      outline: "none",
                                      background: "var(--btn-bg)",
                                      color: "var(--text)",
                                    }}
                                  />
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      groupEditCancelledRef.current = false;
                                      setEditingGroupBookId(book.id);
                                      setGroupDraft((book.group ?? "").trim());
                                    }}
                                    style={{
                                      border: "1px dashed var(--btn-border)",
                                      borderRadius: 8,
                                      background: "transparent",
                                      color: "var(--text-sub)",
                                      padding: "4px 10px",
                                      cursor: "pointer",
                                      fontSize: 12,
                                      textAlign: "left",
                                    }}
                                  >
                                    {displayGroupName(book.group)}
                                  </button>
                                )
                              ) : (
                                <span style={{ color: "var(--text-sub)" }}>
                                  {displayGroupName(book.group)}
                                </span>
                              )}
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
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenBook(book);
                          }}
                          title="进入写作"
                          style={{
                            position: "absolute",
                            right: 12,
                            bottom: 11,
                            border: "1px solid color-mix(in srgb, var(--accent) 42%, var(--btn-border))",
                            borderRadius: 999,
                            background:
                              "linear-gradient(180deg, color-mix(in srgb, var(--accent-soft) 75%, var(--btn-bg)) 0%, var(--btn-bg) 100%)",
                            color: "var(--text)",
                            padding: "6px 14px",
                            fontSize: 11,
                            fontWeight: 600,
                            letterSpacing: "0.03em",
                            cursor: "pointer",
                            boxShadow:
                              "0 1px 2px color-mix(in srgb, var(--text) 8%, transparent)",
                          }}
                        >
                          继续码字
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}