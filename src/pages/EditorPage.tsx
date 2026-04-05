import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useEditorStore } from "../app/store/editorStore";
import { useTabStore } from "../app/store/tabStore";
import {
  getMarkdownEditorHandle,
  MarkdownEditor,
} from "../features/editor/components/MarkdownEditor";
import { EditorLinkagesPanel } from "../features/associations/EditorLinkagesPanel";
import { GlobalAssociationsView } from "../features/associations/GlobalAssociationsView";
import { OutlinePanel } from "../features/editor/components/OutlinePanel";
import { Toolbar } from "../features/editor/components/Toolbar";
import { MarkdownPreview } from "../features/preview/components/MarkdownPreview";
import { useWritingTracker } from "../features/stats/hooks/useWritingTracker";
import {
  createDocument,
  deleteDocument,
  listDocuments,
  readFile,
  renameDocument,
  saveFileContent,
  saveUntitledInBook,
} from "../shared/lib/tauri";
import type { Book, DocumentItem } from "../shared/lib/tauri";
import {
  anchorsForDocument,
  loadAssociations,
  migrateAssociationDocPath,
  patchAssociation,
  removeAssociation,
  saveAssociations,
  stickiesVisible,
  upsertAssociation,
  type AssociationRecord,
} from "../shared/lib/associations";
import {
  DEFAULT_WELCOME_MARKDOWN,
  hasGlobalWelcomeBeenShown,
  markGlobalWelcomeShown,
} from "../shared/lib/welcomeContent";
import { isVirtualUntitledPath, virtualUntitledPath } from "../shared/lib/virtualDocument";

type EditorPageProps = {
  book: Book;
  /** 打开书库浮层（不卸载写作区） */
  onBack: () => void;
  /** 完全回到全屏书库（⌘⇧L） */
  onExitToLibrary: () => void;
};

type PendingAction =
  | { type: "openDoc"; doc: DocumentItem }
  | { type: "back" }
  | null;

type SearchResultItem = {
  doc: DocumentItem;
  matchCount: number;
  snippet: string;
};

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSnippet(content: string, query: string): string {
  const normalizedContent = content.replace(/\s+/g, " ").trim();
  const normalizedQuery = query.trim();
  if (!normalizedContent || !normalizedQuery) return "";

  const lowerContent = normalizedContent.toLowerCase();
  const lowerQuery = normalizedQuery.toLowerCase();
  const index = lowerContent.indexOf(lowerQuery);

  if (index === -1) {
    return normalizedContent.slice(0, 100);
  }

  const start = Math.max(0, index - 24);
  const end = Math.min(
    normalizedContent.length,
    index + normalizedQuery.length + 56,
  );
  const prefix = start > 0 ? "…" : "";
  const suffix = end < normalizedContent.length ? "…" : "";

  return `${prefix}${normalizedContent.slice(start, end)}${suffix}`;
}

function renderHighlightedText(
  text: string,
  query: string,
): React.ReactNode {
  const trimmed = query.trim();
  if (!trimmed) return text;

  const regex = new RegExp(`(${escapeRegExp(trimmed)})`, "ig");
  const parts = text.split(regex);

  return parts.map((part, index) => {
    if (part.toLowerCase() === trimmed.toLowerCase()) {
      return (
        <mark
          key={`${part}-${index}`}
          style={{
            background: "rgba(59,130,246,0.22)",
            color: "var(--text)",
            padding: "0 2px",
            borderRadius: 3,
          }}
        >
          {part}
        </mark>
      );
    }

    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

function formatMinutes(ms: number) {
  return Math.round(ms / 60000);
}

function getTargetStorageKey(bookId: string) {
  return `writing_target_${bookId}`;
}

const SIDE_PANEL_WIDTH_KEY = "glyph_editor_side_panel_width_px";
const MIN_EDITOR_SPLIT_W = 200;
const MIN_SIDE_W = 200;
const DEFAULT_SIDE_W = 320;
const SPLIT_DIVIDER_W = 6;

function fileNameFromDiskPath(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || "Untitled.md";
}

export function EditorPage({
  book,
  onBack,
  onExitToLibrary,
}: EditorPageProps) {
  const content = useEditorStore((s) => s.content);
  const filePath = useEditorStore((s) => s.filePath);
  const fileName = useEditorStore((s) => s.fileName);
  const isDirty = useEditorStore((s) => s.isDirty);
  const liveWordCount = useEditorStore((s) => s.wordCount);
  const setFile = useEditorStore((s) => s.setFile);
  const setContent = useEditorStore((s) => s.setContent);
  const setDirty = useEditorStore((s) => s.setDirty);
  const setSaveStatus = useEditorStore((s) => s.setSaveStatus);
  const setBookFolderPath = useEditorStore((s) => s.setBookFolderPath);

  const toolRailOpen = useEditorStore((s) => s.toolRailOpen);
  const sidePanelOpen = useEditorStore((s) => s.sidePanelOpen);
  const sidePanelMode = useEditorStore((s) => s.sidePanelMode);

  const openSidePanel = useEditorStore((s) => s.openSidePanel);
  const closeToolRail = useEditorStore((s) => s.closeToolRail);
  const closeSidePanel = useEditorStore((s) => s.closeSidePanel);

  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const openTab = useTabStore((s) => s.openTab);
  const setActiveTab = useTabStore((s) => s.setActiveTab);
  const closeTab = useTabStore((s) => s.closeTab);
  const updateTabContent = useTabStore((s) => s.updateTabContent);
  const renameTabByPath = useTabStore((s) => s.renameTabByPath);
  const removeTabByPath = useTabStore((s) => s.removeTabByPath);
  const clearTabs = useTabStore((s) => s.clearTabs);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [tabs, activeTabId],
  );

  const [associations, setAssociations] = useState<AssociationRecord[]>(() =>
    loadAssociations(),
  );
  const [anchorDraft, setAnchorDraft] = useState<{
    from: number;
    to: number;
    quote: string;
    body: string;
    scopeGlobal: boolean;
  } | null>(null);

  const [globalAssocOverlayOpen, setGlobalAssocOverlayOpen] = useState(false);

  const associationAnchors = useMemo(
    () => anchorsForDocument(associations, book.id, filePath),
    [associations, book.id, filePath],
  );

  const visibleStickies = useMemo(
    () => stickiesVisible(associations, book.id),
    [associations, book.id],
  );

  const syncingFromTabRef = useRef(false);

  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const docsRef = useRef<DocumentItem[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);

  const [creatingChapter, setCreatingChapter] = useState(false);
  const [creatingOutline, setCreatingOutline] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState("");
  const [createDocError, setCreateDocError] = useState<string | null>(null);
  const [createDocSubmitting, setCreateDocSubmitting] = useState(false);

  const [libraryOpen, setLibraryOpen] = useState(true);
  const [deletingDocPath, setDeletingDocPath] = useState<string | null>(null);
  const [confirmingDocPath, setConfirmingDocPath] = useState<string | null>(
    null,
  );

  const [renamingDocPath, setRenamingDocPath] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState("");

  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [pendingSubmitting, setPendingSubmitting] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);

  const [dailyTarget, setDailyTarget] = useState(2000);

  const [sidePanelWidthPx, setSidePanelWidthPx] = useState(() => {
    const saved = localStorage.getItem(SIDE_PANEL_WIDTH_KEY);
    const n = saved ? Number(saved) : NaN;
    if (Number.isFinite(n) && n >= MIN_SIDE_W) return Math.round(n);
    return DEFAULT_SIDE_W;
  });

  const rowContainerRef = useRef<HTMLDivElement>(null);
  const draggingSplitRef = useRef(false);
  const sidePanelDragRafRef = useRef<number | null>(null);
  const sidePanelPendingWRef = useRef<number | null>(null);
  const prevFilePathForMigrateRef = useRef<string | null>(null);
  /** 仅首次进入本书且无任何标签时自动打开内存 Untitled；用户关掉所有标签后不应再次自动打开 */
  const didAutoOpenUntitledRef = useRef(false);

  const showSidePanel = sidePanelOpen;
  const showToolRail = toolRailOpen && !showSidePanel;

  const { displayWords, displayDurationMs } = useWritingTracker({
    bookId: book.id,
    filePath,
    wordCount: liveWordCount,
  });

  useLayoutEffect(() => {
    docsRef.current = docs;
  }, [docs]);

  const tabsRef = useRef(tabs);
  useLayoutEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  useEffect(() => {
    localStorage.setItem(SIDE_PANEL_WIDTH_KEY, String(sidePanelWidthPx));
  }, [sidePanelWidthPx]);

  useLayoutEffect(() => {
    if (!showSidePanel || !rowContainerRef.current) return;
    const rect = rowContainerRef.current.getBoundingClientRect();
    const maxW = Math.max(
      MIN_SIDE_W,
      rect.width - MIN_EDITOR_SPLIT_W - SPLIT_DIVIDER_W,
    );
    setSidePanelWidthPx((w) => Math.min(Math.max(MIN_SIDE_W, w), maxW));
  }, [showSidePanel]);

  useEffect(() => {
    const flushSidePanelWidth = () => {
      const w = sidePanelPendingWRef.current;
      if (w !== null) setSidePanelWidthPx(w);
    };
    const onMove = (e: PointerEvent) => {
      if (!draggingSplitRef.current || !rowContainerRef.current) return;
      const rect = rowContainerRef.current.getBoundingClientRect();
      const maxW = Math.max(
        MIN_SIDE_W,
        rect.width - MIN_EDITOR_SPLIT_W - SPLIT_DIVIDER_W,
      );
      const raw = rect.right - e.clientX;
      const clamped = Math.min(Math.max(MIN_SIDE_W, raw), maxW);
      sidePanelPendingWRef.current = clamped;
      if (sidePanelDragRafRef.current !== null) return;
      sidePanelDragRafRef.current = requestAnimationFrame(() => {
        sidePanelDragRafRef.current = null;
        flushSidePanelWidth();
      });
    };
    const onUp = () => {
      draggingSplitRef.current = false;
      if (sidePanelDragRafRef.current !== null) {
        cancelAnimationFrame(sidePanelDragRafRef.current);
        sidePanelDragRafRef.current = null;
      }
      flushSidePanelWidth();
      sidePanelPendingWRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  useEffect(() => {
    const reloadTarget = () => {
      const saved = localStorage.getItem(getTargetStorageKey(book.id));
      const parsed = saved ? Number(saved) : NaN;
      setDailyTarget(Number.isFinite(parsed) && parsed > 0 ? parsed : 2000);
    };
    reloadTarget();
    const onCustom = () => reloadTarget();
    const onVis = () => {
      if (document.visibilityState === "visible") reloadTarget();
    };
    window.addEventListener("writing-target-changed", onCustom);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("writing-target-changed", onCustom);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [book.id]);

  const chapterDocs = useMemo(
    () => docs.filter((doc) => doc.kind === "chapter"),
    [docs],
  );

  const outlineDocs = useMemo(
    () => docs.filter((doc) => doc.kind === "outline"),
    [docs],
  );

  /** 仅随「文档增删/路径」变化，不随每键字数更新而变，避免搜索侧栏对全库重复读盘 */
  const docsIdentityForSearch = useMemo(
    () => docs.map((d) => d.path).join("\0"),
    [docs],
  );

  const loadDocs = useCallback(async () => {
    try {
      setDocsLoading(true);
      setDocsError(null);

      const nextDocs = await listDocuments(book.folderPath);
      setDocs(nextDocs);
    } catch (err) {
      console.error(err);
      setDocsError(String(err));
    } finally {
      setDocsLoading(false);
    }
  }, [book.folderPath]);

  const handleSave = useCallback(async () => {
    if (!filePath) return true;

    if (isVirtualUntitledPath(filePath)) {
      try {
        setSaveStatus("saving");
        const newPath = await saveUntitledInBook(book.folderPath, content);
        const newName = fileNameFromDiskPath(newPath);
        setFile({
          filePath: newPath,
          fileName: newName,
          content,
        });
        setDirty(false);
        setSaveStatus("saved");

        if (activeTabId) {
          updateTabContent(activeTabId, {
            content,
            isDirty: false,
            fileName: newName,
            filePath: newPath,
          });
        }

        void loadDocs();
        return true;
      } catch (err) {
        console.error("save failed", err);
        setSaveStatus("unsaved");
        return false;
      }
    }

    try {
      setSaveStatus("saving");
      await saveFileContent(filePath, content);
      setDirty(false);
      setSaveStatus("saved");

      if (activeTabId) {
        updateTabContent(activeTabId, {
          content,
          isDirty: false,
          fileName,
          filePath,
        });
      }

      return true;
    } catch (err) {
      console.error("save failed", err);
      setSaveStatus("unsaved");
      return false;
    }
  }, [
    filePath,
    content,
    activeTabId,
    fileName,
    setFile,
    setDirty,
    setSaveStatus,
    updateTabContent,
    book.folderPath,
    loadDocs,
  ]);

  const openDocNow = useCallback(
    async (doc: DocumentItem) => {
      try {
        const fileContent = await readFile(doc.path);

        openTab({
          filePath: doc.path,
          fileName: doc.name,
          content: fileContent,
        });

        setFile({
          filePath: doc.path,
          fileName: doc.name,
          content: fileContent,
        });
        setDirty(false);
        setSaveStatus("saved");
      } catch (err) {
        console.error(err);
      }
    },
    [openTab, setFile, setDirty, setSaveStatus],
  );

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "l"
      ) {
        e.preventDefault();
        onExitToLibrary();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onExitToLibrary]);

  useEffect(() => {
    setBookFolderPath(book.folderPath);
    return () => setBookFolderPath(null);
  }, [book.folderPath, setBookFolderPath]);

  useEffect(() => {
    void loadDocs();
  }, [book.folderPath, loadDocs]);

  useEffect(() => {
    return () => {
      clearTabs();
    };
  }, [clearTabs]);

  useEffect(() => {
    didAutoOpenUntitledRef.current = false;
  }, [book.id]);

  useEffect(() => {
    const vpath = virtualUntitledPath(book.id);
    if (tabs.some((t) => t.filePath === vpath)) return;
    if (tabs.length > 0) return;
    if (didAutoOpenUntitledRef.current) return;
    didAutoOpenUntitledRef.current = true;
    const showWelcome = !hasGlobalWelcomeBeenShown();
    const content = showWelcome ? DEFAULT_WELCOME_MARKDOWN : "";
    openTab({
      filePath: vpath,
      fileName: "Untitled.md",
      content,
    });
    if (showWelcome) {
      markGlobalWelcomeShown();
    }
  }, [book.id, tabs, openTab]);

  useEffect(() => {
    const prev = prevFilePathForMigrateRef.current;
    if (
      prev &&
      isVirtualUntitledPath(prev) &&
      filePath &&
      !isVirtualUntitledPath(filePath) &&
      prev !== filePath
    ) {
      setAssociations((items) => {
        const next = migrateAssociationDocPath(items, book.id, prev, filePath);
        saveAssociations(next);
        return next;
      });
      void loadDocs();
    }
    prevFilePathForMigrateRef.current = filePath;
  }, [filePath, book.id, loadDocs]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void handleSave();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave]);

  useEffect(() => {
    if (!filePath || !isDirty) return;

    setSaveStatus("unsaved");

    const timer = window.setTimeout(() => {
      void handleSave();
    }, 1000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [filePath, content, isDirty, handleSave]);

  useEffect(() => {
    if (!filePath) return;

    const t = window.setTimeout(() => {
      setDocs((prev) =>
        prev.map((doc) =>
          doc.path === filePath ? { ...doc, wordCount: liveWordCount } : doc,
        ),
      );
    }, 400);

    return () => window.clearTimeout(t);
  }, [filePath, liveWordCount]);

  useEffect(() => {
    let cancelled = false;

    const runSearch = async () => {
      if (sidePanelMode !== "search") return;

      const query = searchQuery.trim();
      if (!query) {
        setSearchResults([]);
        setSearching(false);
        return;
      }

      try {
        setSearching(true);

        const regex = new RegExp(escapeRegExp(query), "gi");
        const docList = docsRef.current;
        const results = await Promise.all(
          docList.map(async (doc) => {
            try {
              const text = await readFile(doc.path);
              const matches = text.match(regex);
              const matchCount = matches?.length ?? 0;

              if (matchCount === 0) return null;

              return {
                doc,
                matchCount,
                snippet: buildSnippet(text, query),
              } satisfies SearchResultItem;
            } catch (err) {
              console.error("搜索读取失败", doc.path, err);
              return null;
            }
          }),
        );

        if (cancelled) return;

        const filtered = results.filter(
          (item): item is SearchResultItem => item !== null,
        );

        filtered.sort((a, b) => {
          if (b.matchCount !== a.matchCount) {
            return b.matchCount - a.matchCount;
          }
          return a.doc.name.localeCompare(b.doc.name);
        });

        setSearchResults(filtered);
      } finally {
        if (!cancelled) {
          setSearching(false);
        }
      }
    };

    void runSearch();

    return () => {
      cancelled = true;
    };
  }, [sidePanelMode, searchQuery, docsIdentityForSearch]);

  useEffect(() => {
    syncingFromTabRef.current = true;

    if (!activeTab) {
      setFile({
        filePath: null,
        fileName: "Untitled.md",
        content: "",
      });
      setDirty(false);
      setSaveStatus("idle");
      window.setTimeout(() => {
        syncingFromTabRef.current = false;
      }, 0);
      return;
    }

    setFile({
      filePath: activeTab.filePath,
      fileName: activeTab.fileName,
      content: activeTab.content,
    });
    setDirty(activeTab.isDirty);

    window.setTimeout(() => {
      syncingFromTabRef.current = false;
    }, 0);
  }, [activeTabId, activeTab, setFile, setDirty, setSaveStatus]);

  useEffect(() => {
    if (!activeTabId) return;
    if (!filePath) return;
    if (syncingFromTabRef.current) return;

    updateTabContent(activeTabId, {
      content,
      isDirty,
      fileName,
      filePath,
    });
  }, [activeTabId, filePath, fileName, content, isDirty, updateTabContent]);

  const handleOpenDoc = async (doc: DocumentItem) => {
    if (renamingDocPath) return;

    if (filePath === doc.path) {
      setRenamingDocPath(doc.path);
      setRenameTitle(doc.name.replace(/\.md$/i, ""));
      return;
    }

    if (isDirty) {
      setPendingAction({ type: "openDoc", doc });
      return;
    }

    await openDocNow(doc);
  };

  const handleBackRequest = () => {
    if (isDirty) {
      setPendingAction({ type: "back" });
      return;
    }

    onBack();
  };

  const handleConfirmPendingAction = async () => {
    if (!pendingAction) return;

    try {
      setPendingSubmitting(true);

      const ok = await handleSave();
      if (!ok) return;

      if (pendingAction.type === "openDoc") {
        await openDocNow(pendingAction.doc);
      } else if (pendingAction.type === "back") {
        onBack();
      }
    } finally {
      setPendingSubmitting(false);
      setPendingAction(null);
    }
  };

  const handleCancelPendingAction = () => {
    setPendingAction(null);
  };

  const handleAnnotateSelection = () => {
    const sel = getMarkdownEditorHandle()?.getSelection();
    if (!sel || sel.from === sel.to) {
      window.alert("请先选中一段文字");
      return;
    }
    if (!filePath) {
      window.alert("请先打开一篇文档");
      return;
    }
    setAnchorDraft({
      from: sel.from,
      to: sel.to,
      quote: sel.text,
      body: "",
      scopeGlobal: false,
    });
  };

  const handleAddSticky = () => {
    const id = crypto.randomUUID();
    setAssociations((prev) => {
      const next = upsertAssociation(prev, {
        id,
        bookId: book.id,
        docPath: null,
        from: -1,
        to: -1,
        quote: "",
        body: "",
        scope: "book",
        kind: "sticky",
      });
      saveAssociations(next);
      return next;
    });
  };

  const handleSaveAnchorDraft = () => {
    if (!anchorDraft || !filePath) return;
    const body = anchorDraft.body.trim();
    if (!body) {
      window.alert("批注内容不能为空");
      return;
    }
    const id = crypto.randomUUID();
    setAssociations((prev) => {
      const next = upsertAssociation(prev, {
        id,
        bookId: book.id,
        docPath: filePath,
        from: anchorDraft.from,
        to: anchorDraft.to,
        quote: anchorDraft.quote,
        body,
        scope: anchorDraft.scopeGlobal ? "global" : "book",
        kind: "anchor",
      });
      saveAssociations(next);
      return next;
    });
    setAnchorDraft(null);
  };

  const handleCreateDoc = async (kind: "chapter" | "outline") => {
    const trimmed = newDocTitle.trim();
    if (!trimmed) {
      setCreateDocError(kind === "chapter" ? "请输入章节名" : "请输入大纲名");
      return;
    }

    try {
      setCreateDocSubmitting(true);
      setCreateDocError(null);

      const created = await createDocument(book.folderPath, trimmed, kind);
      await loadDocs();
      await openDocNow(created);

      setNewDocTitle("");
      setCreatingChapter(false);
      setCreatingOutline(false);
    } catch (err) {
      console.error(err);
      setCreateDocError(String(err));
    } finally {
      setCreateDocSubmitting(false);
    }
  };

  const handleDeleteDoc = async (doc: DocumentItem) => {
    try {
      setDeletingDocPath(doc.path);

      if (filePath === doc.path && isDirty) {
        const ok = await handleSave();
        if (!ok) return;
      }

      await deleteDocument(doc.path);
      await loadDocs();

      removeTabByPath(doc.path);

      if (filePath === doc.path) {
        setFile({
          filePath: null,
          fileName: "Untitled.md",
          content: "",
        });
      }
    } catch (err) {
      console.error("delete doc failed", err);
      alert(`删除失败：${String(err)}`);
    } finally {
      setDeletingDocPath(null);
      setConfirmingDocPath(null);
    }
  };

  const handleSubmitRename = async (doc: DocumentItem) => {
    const trimmed = renameTitle.trim();

    if (!trimmed) {
      setRenamingDocPath(null);
      setRenameTitle("");
      return;
    }

    const currentBaseName = doc.name.replace(/\.md$/i, "");
    if (trimmed === currentBaseName) {
      setRenamingDocPath(null);
      setRenameTitle("");
      return;
    }

    try {
      if (filePath === doc.path && isDirty) {
        const ok = await handleSave();
        if (!ok) return;
      }

      const renamed = await renameDocument(doc.path, trimmed);
      await loadDocs();

      renameTabByPath(doc.path, {
        newPath: renamed.path,
        newFileName: renamed.name,
      });

      if (filePath === doc.path) {
        setFile({
          filePath: renamed.path,
          fileName: renamed.name,
          content,
        });
      }

      setRenamingDocPath(null);
      setRenameTitle("");
    } catch (err) {
      console.error("rename doc failed", err);
      alert(`重命名失败：${String(err)}`);
      setRenamingDocPath(null);
      setRenameTitle("");
    }
  };

  const handleOpenPreview = () => {
    closeToolRail();
    openSidePanel("preview");
  };

  const handleOpenOutline = () => {
    closeToolRail();
    openSidePanel("outline");
  };

  const handleOpenReferences = () => {
    closeToolRail();
    openSidePanel("references");
  };

  const handleOpenSearch = () => {
    closeToolRail();
    openSidePanel("search");
  };

  const renderCreateBox = (kind: "chapter" | "outline") => {
    const isOpen = kind === "chapter" ? creatingChapter : creatingOutline;
    if (!isOpen) return null;

    return (
      <div
        style={{
          padding: 10,
          borderBottom: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          background: "var(--card)",
        }}
      >
        <input
          type="text"
          value={newDocTitle}
          placeholder={kind === "chapter" ? "输入章节名" : "输入大纲名"}
          onChange={(e) => setNewDocTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              void handleCreateDoc(kind);
            }
          }}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "6px 8px",
            border: "1px solid var(--btn-border)",
            borderRadius: 8,
            outline: "none",
            background: "var(--btn-bg)",
            color: "var(--text)",
            fontSize: 11,
          }}
        />

        {createDocError ? (
          <div style={{ fontSize: 10, color: "#ef4444" }}>{createDocError}</div>
        ) : null}

        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            onClick={() => {
              void handleCreateDoc(kind);
            }}
            disabled={createDocSubmitting}
            style={{
              border: "1px solid var(--btn-border)",
              borderRadius: 8,
              background: "var(--btn-bg)",
              color: "var(--text)",
              padding: "5px 8px",
              cursor: "pointer",
              fontSize: 11,
            }}
          >
            {createDocSubmitting ? "..." : "创建"}
          </button>

          <button
            type="button"
            onClick={() => {
              setCreatingChapter(false);
              setCreatingOutline(false);
              setNewDocTitle("");
              setCreateDocError(null);
            }}
            disabled={createDocSubmitting}
            style={{
              border: "1px solid var(--btn-border)",
              borderRadius: 8,
              background: "var(--btn-bg)",
              color: "var(--text)",
              padding: "5px 8px",
              cursor: "pointer",
              fontSize: 11,
            }}
          >
            取消
          </button>
        </div>
      </div>
    );
  };

  const renderDocList = (items: DocumentItem[]) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {items.map((doc) => {
        const active = filePath === doc.path;
        const deleting = deletingDocPath === doc.path;
        const confirming = confirmingDocPath === doc.path;
        const renaming = renamingDocPath === doc.path;

        return (
          <div
            key={doc.path}
            style={{
              display: "flex",
              gap: 5,
            }}
          >
            {renaming ? (
              <input
                autoFocus
                value={renameTitle}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setRenameTitle(e.target.value)}
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    void handleSubmitRename(doc);
                  }

                  if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    setRenamingDocPath(null);
                    setRenameTitle("");
                  }
                }}
                onBlur={() => {
                  void handleSubmitRename(doc);
                }}
                style={{
                  flex: 1,
                  padding: "5px 7px",
                  borderRadius: 8,
                  border: "1px solid var(--accent)",
                  outline: "none",
                  fontSize: 11,
                  background: "rgba(59,130,246,0.12)",
                  color: "var(--text)",
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  void handleOpenDoc(doc);
                }}
                style={{
                  flex: 1,
                  textAlign: "left",
                  padding: "5px 7px",
                  borderRadius: 8,
                  border: "1px solid var(--btn-border)",
                  background: active
                    ? "rgba(59,130,246,0.12)"
                    : "var(--btn-bg)",
                  color: "var(--text)",
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontSize: 11,
                  }}
                >
                  {doc.name}
                  {active && isDirty ? " *" : ""}
                </span>

                <span
                  style={{
                    flexShrink: 0,
                    fontSize: 10,
                    color: "var(--text-sub)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {doc.wordCount}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                if (confirming) {
                  void handleDeleteDoc(doc);
                  return;
                }
                setConfirmingDocPath(doc.path);
              }}
              disabled={deleting}
              style={{
                width: 56,
                borderRadius: 8,
                border: "1px solid var(--btn-border)",
                background: confirming ? "#fff4e5" : "var(--btn-bg)",
                color: "var(--text)",
                cursor: "pointer",
                fontSize: 11,
                padding: "0 6px",
              }}
            >
              {deleting ? "..." : confirming ? "确认" : "删除"}
            </button>
          </div>
        );
      })}
    </div>
  );

  return (
    <div
      style={{
        display: "flex",
        flex: 1,
        width: "100%",
        minHeight: 0,
        height: "100%",
        background: "var(--bg)",
        color: "var(--text)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {libraryOpen ? (
        <div
          style={{
            width: 280,
            minWidth: 280,
            borderRight: "1px solid var(--border)",
            background: "var(--panel-bg)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              padding: 10,
              borderBottom: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <button
              type="button"
              onClick={handleBackRequest}
              style={{
                border: "1px solid var(--btn-border)",
                borderRadius: 8,
                background: "var(--btn-bg)",
                color: "var(--text)",
                padding: "5px 8px",
                cursor: "pointer",
                fontSize: 11,
              }}
            >
              返回
            </button>

            <button
              type="button"
              onClick={() => setLibraryOpen(false)}
              style={{
                border: "1px solid var(--btn-border)",
                borderRadius: 8,
                background: "var(--btn-bg)",
                color: "var(--text)",
                padding: "5px 8px",
                cursor: "pointer",
                fontSize: 11,
              }}
            >
              隐藏
            </button>
          </div>

          <div
            style={{
              padding: 10,
              borderBottom: "1px solid var(--border)",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                onClick={() => {
                  setCreatingChapter((v) => !v);
                  setCreatingOutline(false);
                  setCreateDocError(null);
                }}
                style={{
                  flex: 1,
                  border: "1px solid var(--btn-border)",
                  borderRadius: 8,
                  background: "var(--btn-bg)",
                  color: "var(--text)",
                  padding: "5px 8px",
                  cursor: "pointer",
                  fontSize: 11,
                }}
              >
                新章节
              </button>

              <button
                type="button"
                onClick={() => {
                  setCreatingOutline((v) => !v);
                  setCreatingChapter(false);
                  setCreateDocError(null);
                }}
                style={{
                  flex: 1,
                  border: "1px solid var(--btn-border)",
                  borderRadius: 8,
                  background: "var(--btn-bg)",
                  color: "var(--text)",
                  padding: "5px 8px",
                  cursor: "pointer",
                  fontSize: 11,
                }}
              >
                新大纲
              </button>
            </div>
          </div>

          {renderCreateBox("outline")}
          {renderCreateBox("chapter")}

          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflow: "auto",
              padding: 10,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {docsLoading ? (
              <div style={{ color: "var(--text-sub)", fontSize: 10 }}>
                读取中…
              </div>
            ) : docsError ? (
              <div style={{ color: "#ef4444", fontSize: 10 }}>{docsError}</div>
            ) : (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-sub)",
                    }}
                  >
                    大纲
                  </div>
                  {renderDocList(outlineDocs)}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-sub)",
                    }}
                  >
                    章节
                  </div>
                  {renderDocList(chapterDocs)}
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          background: "var(--bg)",
          color: "var(--text)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "4px 8px",
            borderBottom: "1px solid var(--border)",
            background: "var(--card)",
            overflowX: "auto",
          }}
        >
          {!libraryOpen ? (
            <button
              type="button"
              onClick={() => setLibraryOpen(true)}
              title="展开章节栏"
              style={{
                flexShrink: 0,
                width: 24,
                height: 24,
                border: "1px solid var(--btn-border)",
                borderRadius: 8,
                background: "var(--btn-bg)",
                color: "var(--text)",
                cursor: "pointer",
                fontSize: 11,
              }}
            >
              ≡
            </button>
          ) : null}
          {tabs.map((tab) => {
            const tabActive = tab.id === activeTabId;

            return (
              <div
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                }}
                title="切换文档"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  minWidth: 0,
                  maxWidth: 180,
                  padding: "4px 8px",
                  borderRadius: 8,
                  border: "1px solid var(--btn-border)",
                  background: tabActive ? "rgba(59,130,246,0.12)" : "var(--btn-bg)",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--text)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {tab.fileName}
                  {tab.isDirty ? " *" : ""}
                </span>

                <button
                  type="button"
                  draggable={false}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  style={{
                    width: 16,
                    height: 16,
                    border: "none",
                    background: "transparent",
                    color: "var(--text-sub)",
                    cursor: "pointer",
                    padding: 0,
                    lineHeight: 1,
                    flexShrink: 0,
                    fontSize: 10,
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>

        <Toolbar mode="global" />

        <div
          ref={rowContainerRef}
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "stretch",
            flex: 1,
            minHeight: 0,
            width: "100%",
            background: "var(--bg)",
          }}
        >
          <div
            style={{
              flex: 1,
              minWidth: MIN_EDITOR_SPLIT_W,
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              background: "var(--bg)",
            }}
          >
            <Toolbar
              mode="editor"
              onAnnotateSelection={handleAnnotateSelection}
              onAddSticky={handleAddSticky}
            />

            <div
              style={{
                flex: 1,
                minHeight: 0,
                background: "var(--bg)",
                position: "relative",
                display: "flex",
                flexDirection: "column",
                minWidth: 0,
              }}
            >
              <MarkdownEditor associationAnchors={associationAnchors} />

              {anchorDraft ? (
                <div
                  style={{
                    position: "absolute",
                    left: 16,
                    right: 16,
                    bottom: 16,
                    maxWidth: 440,
                    margin: "0 auto",
                    zIndex: 20,
                    padding: 12,
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "color-mix(in srgb, var(--panel-bg) 90%, transparent)",
                    boxShadow: "0 8px 28px rgba(0,0,0,0.18)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-sub)",
                      maxHeight: 48,
                      overflow: "auto",
                    }}
                  >
                    {anchorDraft.quote || "（空选区）"}
                  </div>
                  <textarea
                    value={anchorDraft.body}
                    onChange={(e) =>
                      setAnchorDraft((d) =>
                        d ? { ...d, body: e.target.value } : d,
                      )
                    }
                    placeholder="批注内容…"
                    rows={3}
                    style={{
                      width: "100%",
                      resize: "vertical",
                      fontSize: 13,
                      lineHeight: 1.5,
                      padding: 8,
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "var(--bg)",
                      color: "var(--text)",
                      boxSizing: "border-box",
                    }}
                  />
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12,
                      color: "var(--text-sub)",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={anchorDraft.scopeGlobal}
                      onChange={(e) =>
                        setAnchorDraft((d) =>
                          d ? { ...d, scopeGlobal: e.target.checked } : d,
                        )
                      }
                    />
                    跨书关联（全局可见）
                  </label>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      gap: 8,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setAnchorDraft(null)}
                      style={{
                        border: "1px solid var(--btn-border)",
                        background: "var(--btn-bg)",
                        color: "var(--text)",
                        borderRadius: 8,
                        padding: "6px 12px",
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveAnchorDraft}
                      style={{
                        border: "1px solid var(--accent)",
                        background: "var(--accent)",
                        color: "var(--bg)",
                        borderRadius: 8,
                        padding: "6px 12px",
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      保存
                    </button>
                  </div>
                </div>
              ) : null}

              <div
                style={{
                  position: "fixed",
                  right: 16,
                  bottom: 16,
                  width: 260,
                  maxHeight: "42vh",
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  zIndex: 19,
                  pointerEvents: "none",
                }}
              >
                {visibleStickies.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      pointerEvents: "auto",
                      padding: 10,
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      background:
                        "color-mix(in srgb, var(--panel-bg) 88%, transparent)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <span style={{ fontSize: 10, color: "var(--text-sub)" }}>
                        便签
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setAssociations((prev) => {
                            const next = patchAssociation(prev, s.id, {
                              dismissed: true,
                            });
                            saveAssociations(next);
                            return next;
                          })
                        }
                        style={{
                          border: "none",
                          background: "transparent",
                          color: "var(--text-sub)",
                          cursor: "pointer",
                          fontSize: 14,
                          lineHeight: 1,
                          padding: 2,
                        }}
                        title="关闭"
                      >
                        ×
                      </button>
                    </div>
                    <textarea
                      value={s.body}
                      onChange={(e) =>
                        setAssociations((prev) => {
                          const next = patchAssociation(prev, s.id, {
                            body: e.target.value,
                          });
                          saveAssociations(next);
                          return next;
                        })
                      }
                      placeholder="写点什么…"
                      rows={3}
                      style={{
                        width: "100%",
                        resize: "vertical",
                        fontSize: 12,
                        lineHeight: 1.5,
                        padding: 6,
                        borderRadius: 6,
                        border: "1px solid var(--border)",
                        background: "var(--bg)",
                        color: "var(--text)",
                        boxSizing: "border-box",
                      }}
                    />
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 11,
                        color: "var(--text-sub)",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={s.scope === "global"}
                        onChange={(e) =>
                          setAssociations((prev) => {
                            const next = patchAssociation(prev, s.id, {
                              scope: e.target.checked ? "global" : "book",
                            });
                            saveAssociations(next);
                            return next;
                          })
                        }
                      />
                      跨书
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setAssociations((prev) => {
                          const next = removeAssociation(prev, s.id);
                          saveAssociations(next);
                          return next;
                        })
                      }
                      style={{
                        alignSelf: "flex-end",
                        border: "none",
                        background: "transparent",
                        color: "var(--text-sub)",
                        fontSize: 11,
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      删除
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {showSidePanel ? (
            <>
              <div
                role="separator"
                aria-orientation="vertical"
                aria-valuenow={sidePanelWidthPx}
                onPointerDown={(e) => {
                  e.preventDefault();
                  draggingSplitRef.current = true;
                  (e.currentTarget as HTMLDivElement).setPointerCapture(
                    e.pointerId,
                  );
                }}
                style={{
                  width: SPLIT_DIVIDER_W,
                  flexShrink: 0,
                  cursor: "col-resize",
                  touchAction: "none",
                  userSelect: "none",
                  background: "var(--border)",
                }}
              />
              <div
                style={{
                  width: sidePanelWidthPx,
                  minWidth: MIN_SIDE_W,
                  flexShrink: 0,
                  alignSelf: "stretch",
                  background: "var(--panel-bg)",
                  display: "flex",
                  flexDirection: "column",
                  minHeight: 0,
                  overflow: "hidden",
                }}
              >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 10px",
                  borderBottom: "1px solid var(--border)",
                  background: "var(--toolbar-bg)",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    type="button"
                    onClick={handleOpenPreview}
                    style={{
                      border: "1px solid var(--btn-border)",
                      background:
                        sidePanelMode === "preview"
                          ? "rgba(59,130,246,0.12)"
                          : "var(--btn-bg)",
                      color: "var(--text)",
                      borderRadius: 6,
                      padding: "3px 8px",
                      cursor: "pointer",
                      fontSize: 11,
                    }}
                  >
                    预览
                  </button>

                  <button
                    type="button"
                    onClick={handleOpenOutline}
                    style={{
                      border: "1px solid var(--btn-border)",
                      background:
                        sidePanelMode === "outline"
                          ? "rgba(59,130,246,0.12)"
                          : "var(--btn-bg)",
                      color: "var(--text)",
                      borderRadius: 6,
                      padding: "3px 8px",
                      cursor: "pointer",
                      fontSize: 11,
                    }}
                  >
                    大纲
                  </button>

                  <button
                    type="button"
                    onClick={handleOpenReferences}
                    style={{
                      border: "1px solid var(--btn-border)",
                      background:
                        sidePanelMode === "references"
                          ? "rgba(59,130,246,0.12)"
                          : "var(--btn-bg)",
                      color: "var(--text)",
                      borderRadius: 6,
                      padding: "3px 8px",
                      cursor: "pointer",
                      fontSize: 11,
                    }}
                  >
                    关联
                  </button>

                  <button
                    type="button"
                    onClick={handleOpenSearch}
                    style={{
                      border: "1px solid var(--btn-border)",
                      background:
                        sidePanelMode === "search"
                          ? "rgba(59,130,246,0.12)"
                          : "var(--btn-bg)",
                      color: "var(--text)",
                      borderRadius: 6,
                      padding: "3px 8px",
                      cursor: "pointer",
                      fontSize: 11,
                    }}
                  >
                    搜索
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => closeSidePanel()}
                  style={{
                    border: "1px solid var(--btn-border)",
                    background: "var(--btn-bg)",
                    color: "var(--text)",
                    borderRadius: 6,
                    width: 24,
                    height: 24,
                    cursor: "pointer",
                    lineHeight: 1,
                    fontSize: 11,
                  }}
                  aria-label="close panel"
                  title="close"
                >
                  ×
                </button>
              </div>

              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  minWidth: 0,
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                  padding: 10,
                  background: "var(--panel-bg)",
                  color: "var(--text)",
                }}
              >
                {sidePanelMode === "preview" ? (
                  <div
                    style={{
                      flex: 1,
                      minHeight: 0,
                      overflow: "auto",
                    }}
                  >
                    <MarkdownPreview content={content} />
                  </div>
                ) : sidePanelMode === "outline" ? (
                  <div
                    style={{
                      flex: 1,
                      minHeight: 0,
                      minWidth: 0,
                      display: "flex",
                      flexDirection: "column",
                      overflow: "hidden",
                    }}
                  >
                    <OutlinePanel
                      docs={docs}
                      currentFilePath={filePath}
                      editorContent={content}
                      onEditorContentChange={setContent}
                      editorDirty={isDirty}
                      onOpenOutlineInEditor={async (doc) => {
                        if (isDirty) {
                          setPendingAction({ type: "openDoc", doc });
                          return;
                        }
                        await openDocNow(doc);
                      }}
                    />
                  </div>
                ) : sidePanelMode === "references" ? (
                  <div
                    style={{
                      flex: 1,
                      minHeight: 0,
                      overflow: "auto",
                    }}
                  >
                    <EditorLinkagesPanel
                      book={book}
                      associations={associations}
                      setAssociations={setAssociations}
                      onOpenCrossBook={() => setGlobalAssocOverlayOpen(true)}
                    />
                  </div>
                ) : sidePanelMode === "search" ? (
                  <div
                    style={{
                      flex: 1,
                      minHeight: 0,
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                      overflow: "hidden",
                    }}
                  >
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.currentTarget.value)}
                      placeholder="搜索当前书内全文…"
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "7px 9px",
                        border: "1px solid var(--btn-border)",
                        borderRadius: 8,
                        background: "var(--btn-bg)",
                        color: "var(--text)",
                        outline: "none",
                        fontSize: 11,
                      }}
                    />

                    {searchQuery.trim() === "" ? (
                      <div style={{ fontSize: 11, color: "var(--text-sub)" }}>
                        输入关键词后搜索当前书内所有文档
                      </div>
                    ) : searching ? (
                      <div style={{ fontSize: 11, color: "var(--text-sub)" }}>
                        搜索中…
                      </div>
                    ) : searchResults.length === 0 ? (
                      <div style={{ fontSize: 11, color: "var(--text-sub)" }}>
                        没有找到结果
                      </div>
                    ) : (
                      <div
                        style={{
                          flex: 1,
                          minHeight: 0,
                          overflow: "auto",
                          display: "flex",
                          flexDirection: "column",
                          gap: 8,
                        }}
                      >
                        {searchResults.map((item) => (
                          <button
                            key={item.doc.path}
                            type="button"
                            onClick={() => {
                              void handleOpenDoc(item.doc);
                            }}
                            style={{
                              textAlign: "left",
                              border: "1px solid var(--btn-border)",
                              borderRadius: 8,
                              background: "var(--btn-bg)",
                              color: "var(--text)",
                              padding: 10,
                              cursor: "pointer",
                              display: "flex",
                              flexDirection: "column",
                              gap: 6,
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 8,
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {item.doc.name}
                              </span>

                              <span
                                style={{
                                  flexShrink: 0,
                                  fontSize: 10,
                                  color: "var(--text-sub)",
                                }}
                              >
                                {item.matchCount} 处
                              </span>
                            </div>

                            <div
                              style={{
                                fontSize: 11,
                                color: "var(--text-sub)",
                                lineHeight: 1.5,
                              }}
                            >
                              {renderHighlightedText(item.snippet, searchQuery)}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
            </>
          ) : showToolRail ? (
            <div
              style={{
                borderLeft: "1px solid var(--border)",
                background: "var(--panel-bg)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
                paddingTop: 10,
                paddingLeft: 6,
                paddingRight: 6,
              }}
            >
              <button
                type="button"
                onClick={handleOpenPreview}
                style={{
                  width: "100%",
                  height: 30,
                  border: "1px solid var(--btn-border)",
                  borderRadius: 10,
                  background: "var(--btn-bg)",
                  color: "var(--text)",
                  cursor: "pointer",
                  fontSize: 12,
                  lineHeight: 1,
                  whiteSpace: "nowrap",
                }}
                title="预览"
              >
                预览
              </button>

              <button
                type="button"
                onClick={handleOpenOutline}
                style={{
                  width: "100%",
                  height: 30,
                  border: "1px solid var(--btn-border)",
                  borderRadius: 10,
                  background: "var(--btn-bg)",
                  color: "var(--text)",
                  cursor: "pointer",
                  fontSize: 12,
                  lineHeight: 1,
                  whiteSpace: "nowrap",
                }}
                title="大纲"
              >
                大纲
              </button>

              <button
                type="button"
                onClick={handleOpenReferences}
                style={{
                  width: "100%",
                  height: 30,
                  border: "1px solid var(--btn-border)",
                  borderRadius: 10,
                  background: "var(--btn-bg)",
                  color: "var(--text)",
                  cursor: "pointer",
                  fontSize: 12,
                  lineHeight: 1,
                  whiteSpace: "nowrap",
                }}
                title="关联"
              >
                关联
              </button>

              <button
                type="button"
                onClick={handleOpenSearch}
                style={{
                  width: "100%",
                  height: 30,
                  border: "1px solid var(--btn-border)",
                  borderRadius: 10,
                  background: "var(--btn-bg)",
                  color: "var(--text)",
                  cursor: "pointer",
                  fontSize: 12,
                  lineHeight: 1,
                  whiteSpace: "nowrap",
                }}
                title="搜索"
              >
                搜索
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          right: 16,
          bottom: 12,
          fontSize: 11,
          color: "var(--text-sub)",
          background: "rgba(255,255,255,0.55)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: "6px 10px",
          pointerEvents: "none",
          backdropFilter: "blur(4px)",
        }}
      >
        今日 {displayWords}/{dailyTarget} 字 · {formatMinutes(displayDurationMs)} 分钟
      </div>

      {globalAssocOverlayOpen ? (
        <GlobalAssociationsView
          variant="overlay"
          onClose={() => {
            setGlobalAssocOverlayOpen(false);
            setAssociations(loadAssociations());
          }}
        />
      ) : null}

      {pendingAction ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
        >
          <div
            style={{
              width: 320,
              borderRadius: 12,
              background: "var(--card)",
              border: "1px solid var(--border)",
              boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ fontSize: 13, color: "var(--text)" }}>
              当前文档有未保存内容，是否先保存？
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={handleCancelPendingAction}
                disabled={pendingSubmitting}
                style={{
                  border: "1px solid var(--btn-border)",
                  borderRadius: 8,
                  background: "var(--btn-bg)",
                  color: "var(--text)",
                  padding: "6px 10px",
                  cursor: "pointer",
                  fontSize: 11,
                }}
              >
                取消
              </button>

              <button
                type="button"
                onClick={() => {
                  setPendingAction(null);
                  if (pendingAction.type === "openDoc") {
                    void openDocNow(pendingAction.doc);
                  } else {
                    onBack();
                  }
                }}
                disabled={pendingSubmitting}
                style={{
                  border: "1px solid var(--btn-border)",
                  borderRadius: 8,
                  background: "#fff4e5",
                  color: "var(--text)",
                  padding: "6px 10px",
                  cursor: "pointer",
                  fontSize: 11,
                }}
              >
                不保存
              </button>

              <button
                type="button"
                onClick={() => {
                  void handleConfirmPendingAction();
                }}
                disabled={pendingSubmitting}
                style={{
                  border: "1px solid var(--btn-border)",
                  borderRadius: 8,
                  background: "rgba(59,130,246,0.12)",
                  color: "var(--text)",
                  padding: "6px 10px",
                  cursor: "pointer",
                  fontSize: 11,
                }}
              >
                {pendingSubmitting ? "保存中…" : "保存并继续"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}