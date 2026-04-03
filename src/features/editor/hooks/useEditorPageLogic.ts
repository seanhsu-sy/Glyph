import { useCallback, useEffect, useMemo, useState } from "react";

import { useEditorStore } from "../../../app/store/editorStore";
import {
  createDocument,
  deleteDocument,
  listDocuments,
  readFile,
  renameDocument,
  saveFileContent,
} from "../../../shared/lib/tauri";
import type { Book, DocumentItem } from "../../../shared/lib/tauri";

export type SearchResultItem = {
  doc: DocumentItem;
  matchCount: number;
  snippet: string;
};

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSnippet(content: string, query: string): string {
  const normalizedContent = content.replace(/\s+/g, " ").trim();
  const normalizedQuery = query.trim();

  if (!normalizedContent || !normalizedQuery) {
    return "";
  }

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

async function readDocToStore(
  doc: DocumentItem,
  setFile: (payload: {
    filePath: string | null;
    fileName: string;
    content: string;
  }) => void,
) {
  const fileContent = await readFile(doc.path);

  setFile({
    filePath: doc.path,
    fileName: doc.name,
    content: fileContent,
  });
}

export function useEditorPageLogic(book: Book) {
  const content = useEditorStore((s) => s.content);
  const filePath = useEditorStore((s) => s.filePath);
  const isDirty = useEditorStore((s) => s.isDirty);
  const liveWordCount = useEditorStore((s) => s.wordCount);
  const setFile = useEditorStore((s) => s.setFile);
  const setDirty = useEditorStore((s) => s.setDirty);
  const setSaveStatus = useEditorStore((s) => s.setSaveStatus);

  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);

  const [creatingKind, setCreatingKind] = useState<"chapter" | "outline" | null>(
    null,
  );
  const [newDocTitle, setNewDocTitle] = useState("");
  const [createDocError, setCreateDocError] = useState<string | null>(null);
  const [createDocSubmitting, setCreateDocSubmitting] = useState(false);

  const [libraryOpen, setLibraryOpen] = useState(true);

  const [deletingDocPath, setDeletingDocPath] = useState<string | null>(null);
  const [renamingDocPath, setRenamingDocPath] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);

  const chapterDocs = useMemo(
    () => docs.filter((doc) => doc.kind === "chapter"),
    [docs],
  );

  const outlineDocs = useMemo(
    () => docs.filter((doc) => doc.kind === "outline"),
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
    if (!filePath) {
      return true;
    }

    try {
      setSaveStatus("saving");
      await saveFileContent(filePath, content);
      setDirty(false);
      setSaveStatus("saved");
      return true;
    } catch (err) {
      console.error("save failed", err);
      setSaveStatus("unsaved");
      return false;
    }
  }, [content, filePath, setDirty, setSaveStatus]);

  const ensureCanLeaveCurrentDoc = useCallback(async () => {
    if (!isDirty) {
      return true;
    }

    const shouldSave = window.confirm("当前文档有未保存内容。是否先保存？");
    if (!shouldSave) {
      return window.confirm("不保存并继续吗？");
    }

    return await handleSave();
  }, [handleSave, isDirty]);

  const openDocNow = useCallback(
    async (doc: DocumentItem) => {
      await readDocToStore(doc, setFile);
      setDirty(false);
      setSaveStatus("saved");
    },
    [setDirty, setFile, setSaveStatus],
  );

  const handleOpenDoc = useCallback(
    async (doc: DocumentItem) => {
      if (doc.path === filePath) {
        return;
      }

      const ok = await ensureCanLeaveCurrentDoc();
      if (!ok) {
        return;
      }

      await openDocNow(doc);
    },
    [ensureCanLeaveCurrentDoc, filePath, openDocNow],
  );

  const handleBack = useCallback(async () => {
    const ok = await ensureCanLeaveCurrentDoc();
    return ok;
  }, [ensureCanLeaveCurrentDoc]);

  const handleCreateDocument = useCallback(async () => {
    const trimmed = newDocTitle.trim();

    if (!creatingKind) {
      return;
    }

    if (!trimmed) {
      setCreateDocError("名称不能为空");
      return;
    }

    try {
      setCreateDocSubmitting(true);
      setCreateDocError(null);

      const created = await createDocument(
        book.folderPath,
        trimmed,
        creatingKind,
      );

      await loadDocs();

      setCreatingKind(null);
      setNewDocTitle("");
      await openDocNow(created);
    } catch (err) {
      console.error("创建文档失败", err);
      setCreateDocError(String(err));
    } finally {
      setCreateDocSubmitting(false);
    }
  }, [book.folderPath, creatingKind, loadDocs, newDocTitle, openDocNow]);

  const handleDeleteDoc = useCallback(
    async (doc: DocumentItem) => {
      const confirmed = window.confirm(`确定删除「${doc.name}」吗？`);
      if (!confirmed) {
        return;
      }

      try {
        setDeletingDocPath(doc.path);
        await deleteDocument(doc.path);

        const deletedCurrent = filePath === doc.path;
        await loadDocs();

        if (deletedCurrent) {
          const remaining = await listDocuments(book.folderPath);
          const nextDoc = remaining.find((item) => item.kind === "chapter") ?? remaining[0];

          if (nextDoc) {
            await openDocNow(nextDoc);
          } else {
            setFile({
              filePath: null,
              fileName: "Untitled.md",
              content: "",
            });
          }
        }
      } catch (err) {
        console.error("删除文档失败", err);
        alert(`删除失败：${String(err)}`);
      } finally {
        setDeletingDocPath(null);
      }
    },
    [book.folderPath, filePath, loadDocs, openDocNow, setFile],
  );

  const startRenameDoc = useCallback((doc: DocumentItem) => {
    setRenamingDocPath(doc.path);
    const nextTitle = doc.name.replace(/\.md$/i, "");
    setRenameTitle(nextTitle);
  }, []);

  const handleSubmitRename = useCallback(async () => {
    if (!renamingDocPath) {
      return;
    }

    const trimmed = renameTitle.trim();
    if (!trimmed) {
      setRenamingDocPath(null);
      setRenameTitle("");
      return;
    }

    try {
      const updated = await renameDocument(renamingDocPath, trimmed);
      await loadDocs();

      if (filePath === renamingDocPath) {
        const contentNow = useEditorStore.getState().content;
        setFile({
          filePath: updated.path,
          fileName: updated.name,
          content: contentNow,
        });
      }

      setRenamingDocPath(null);
      setRenameTitle("");
    } catch (err) {
      console.error("重命名失败", err);
      alert(`重命名失败：${String(err)}`);
    }
  }, [filePath, loadDocs, renameTitle, renamingDocPath, setFile]);

  useEffect(() => {
    void loadDocs();
  }, [loadDocs]);

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
    if (!filePath || !isDirty) {
      return;
    }

    setSaveStatus("unsaved");

    const timer = window.setTimeout(async () => {
      try {
        setSaveStatus("saving");
        await saveFileContent(filePath, content);
        setDirty(false);
        setSaveStatus("saved");
      } catch (err) {
        console.error("autosave failed", err);
        setSaveStatus("unsaved");
      }
    }, 1000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [content, filePath, isDirty, setDirty, setSaveStatus]);

  useEffect(() => {
    if (!filePath) {
      return;
    }

    setDocs((prev) =>
      prev.map((doc) =>
        doc.path === filePath ? { ...doc, wordCount: liveWordCount } : doc,
      ),
    );
  }, [filePath, liveWordCount]);

  useEffect(() => {
    let cancelled = false;

    const runSearch = async () => {
      const query = searchQuery.trim();

      if (!query) {
        setSearchResults([]);
        setSearching(false);
        return;
      }

      try {
        setSearching(true);

        const regex = new RegExp(escapeRegExp(query), "gi");

        const results = await Promise.all(
          docs.map(async (doc) => {
            try {
              const text = await readFile(doc.path);
              const matches = text.match(regex);
              const titleMatches = doc.name.match(regex);

              const matchCount =
                (matches?.length ?? 0) + (titleMatches?.length ?? 0);

              if (matchCount === 0) {
                return null;
              }

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

        if (cancelled) {
          return;
        }

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
  }, [docs, searchQuery]);

  useEffect(() => {
    if (docsLoading || docs.length === 0) {
      return;
    }

    if (filePath && docs.some((doc) => doc.path === filePath)) {
      return;
    }

    const firstChapter = docs.find((doc) => doc.kind === "chapter");
    const firstDoc = firstChapter ?? docs[0];

    if (firstDoc) {
      void openDocNow(firstDoc);
    }
  }, [docs, docsLoading, filePath, openDocNow]);

  return {
    docs,
    chapterDocs,
    outlineDocs,
    docsLoading,
    docsError,

    creatingKind,
    setCreatingKind,
    newDocTitle,
    setNewDocTitle,
    createDocError,
    createDocSubmitting,
    handleCreateDocument,

    libraryOpen,
    setLibraryOpen,

    deletingDocPath,
    handleDeleteDoc,

    renamingDocPath,
    renameTitle,
    setRenameTitle,
    startRenameDoc,
    handleSubmitRename,
    cancelRename: () => {
      setRenamingDocPath(null);
      setRenameTitle("");
    },

    searchQuery,
    setSearchQuery,
    searching,
    searchResults,

    handleOpenDoc,
    handleBack,
    handleSave,
  };
}