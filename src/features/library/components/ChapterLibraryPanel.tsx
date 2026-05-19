import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import {
  addVolume,
  addVolumeAboveChapter,
  defaultVolumeTitle,
  deleteVolume,
  fallbackChapterLayout,
  getVolumeDisplayPaths,
  migrateChapterPathInLayout,
  moveChapterTo,
  moveVolumeInRoot,
  renameVolume,
  type ChapterLayout,
  type DropTarget,
} from "../../../shared/lib/chapterLayout";
import {
  getChapterLayout,
  saveChapterLayout,
  type DocumentItem,
} from "../../../shared/lib/tauri";

type DragPayload =
  | { kind: "chapter"; path: string }
  | { kind: "volume"; volumeId: string };

type ContextMenuState =
  | { kind: "list"; x: number; y: number }
  | { kind: "volume"; volumeId: string; x: number; y: number }
  | { kind: "chapter"; chapterPath: string; x: number; y: number }
  | null;

export type ChapterLibraryPanelHandle = {
  migrateChapterPath: (oldPath: string, newPath: string) => void;
};

type Props = {
  bookFolderPath: string;
  chapterDocs: DocumentItem[];
  activePath: string | null;
  activeDirty: boolean;
  liveWordCount: number;
  deletingDocPath: string | null;
  confirmingDocPath: string | null;
  renamingDocPath: string | null;
  renameTitle: string;
  onRenameTitleChange: (title: string) => void;
  onOpenDoc: (doc: DocumentItem) => void;
  onDeleteDoc: (doc: DocumentItem) => void;
  onSubmitRename: (doc: DocumentItem) => void;
  onCancelRename: () => void;
  onConfirmDelete: (path: string) => void;
  onStartRenameChapter: (doc: DocumentItem) => void;
  panelRef?: React.RefObject<ChapterLibraryPanelHandle | null>;
  layoutVersion?: number;
};

const menuBtnStyle: CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  border: "none",
  background: "transparent",
  color: "var(--text)",
  padding: "6px 10px",
  fontSize: 11,
  cursor: "pointer",
  borderRadius: 6,
};

function DropSlot({
  dropKey,
  dropTarget,
  active,
  children,
  minHeight,
}: {
  dropKey: string;
  dropTarget: DropTarget;
  active: boolean;
  children: ReactNode;
  minHeight?: number;
}) {
  return (
    <div
      data-drop-key={dropKey}
      data-drop-target={JSON.stringify(dropTarget)}
      style={{
        minHeight: minHeight ?? undefined,
        borderRadius: 8,
        boxShadow: active ? "inset 0 2px 0 0 var(--accent)" : undefined,
        background: active ? "rgba(59,130,246,0.06)" : undefined,
      }}
    >
      {children}
    </div>
  );
}

export function ChapterLibraryPanel({
  bookFolderPath,
  chapterDocs,
  activePath,
  activeDirty,
  liveWordCount,
  deletingDocPath,
  confirmingDocPath,
  renamingDocPath,
  renameTitle,
  onRenameTitleChange,
  onOpenDoc,
  onDeleteDoc,
  onSubmitRename,
  onCancelRename,
  onConfirmDelete,
  onStartRenameChapter,
  panelRef,
  layoutVersion = 0,
}: Props) {
  const [layout, setLayout] = useState<ChapterLayout | null>(null);
  const [layoutLoading, setLayoutLoading] = useState(true);
  const [collapsedVolumes, setCollapsedVolumes] = useState<Set<string>>(
    () => new Set(),
  );
  const [renamingVolumeId, setRenamingVolumeId] = useState<string | null>(null);
  const [volumeRenameTitle, setVolumeRenameTitle] = useState("");
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [draggingChapterPath, setDraggingChapterPath] = useState<string | null>(
    null,
  );
  const [pointerDrag, setPointerDrag] = useState<DragPayload | null>(null);
  const persistTimerRef = useRef<number | null>(null);
  const layoutRef = useRef<ChapterLayout | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  const docByPath = useMemo(() => {
    const m = new Map<string, DocumentItem>();
    for (const d of chapterDocs) m.set(d.path, d);
    return m;
  }, [chapterDocs]);

  const chapterPaths = useMemo(
    () => chapterDocs.map((d) => d.path),
    [chapterDocs],
  );

  const persistLayout = useCallback(
    (next: ChapterLayout) => {
      setLayout(next);
      layoutRef.current = next;
      if (persistTimerRef.current !== null) {
        window.clearTimeout(persistTimerRef.current);
      }
      persistTimerRef.current = window.setTimeout(() => {
        void saveChapterLayout(bookFolderPath, next).catch((err) => {
          console.error("保存章节结构失败", err);
        });
      }, 120);
    },
    [bookFolderPath],
  );

  const applyLayoutChange = useCallback(
    (updater: (prev: ChapterLayout) => ChapterLayout) => {
      const base =
        layoutRef.current ?? fallbackChapterLayout(chapterPaths);
      persistLayout(updater(base));
    },
    [persistLayout, chapterPaths],
  );

  useImperativeHandle(
    panelRef,
    () => ({
      migrateChapterPath: (oldPath: string, newPath: string) => {
        applyLayoutChange((prev) =>
          migrateChapterPathInLayout(prev, oldPath, newPath),
        );
      },
    }),
    [applyLayoutChange],
  );

  const loadLayout = useCallback(async () => {
    try {
      setLayoutLoading(true);
      const next = await getChapterLayout(bookFolderPath, chapterPaths);
      setLayout(next);
      layoutRef.current = next;
    } catch (err) {
      console.error("加载章节结构失败", err);
      const fallback = fallbackChapterLayout(chapterPaths);
      setLayout(fallback);
      layoutRef.current = fallback;
    } finally {
      setLayoutLoading(false);
    }
  }, [bookFolderPath, chapterPaths]);

  useEffect(() => {
    void loadLayout();
  }, [loadLayout, layoutVersion]);

  useEffect(() => {
    return () => {
      if (persistTimerRef.current !== null) {
        window.clearTimeout(persistTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!contextMenu) return;

    const close = (e: Event) => {
      const target = e.target;
      if (
        target instanceof Node &&
        contextMenuRef.current?.contains(target)
      ) {
        return;
      }
      setContextMenu(null);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };

    const timer = window.setTimeout(() => {
      window.addEventListener("pointerdown", close, true);
      window.addEventListener("keydown", onKey);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [contextMenu]);

  const handleListContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ kind: "list", x: e.clientX, y: e.clientY });
  };

  const handleVolumeContextMenu = (volumeId: string, e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ kind: "volume", volumeId, x: e.clientX, y: e.clientY });
  };

  const handleAddVolume = (aboveChapterPath?: string) => {
    const title = defaultVolumeTitle(layoutRef.current?.volumes.length ?? 0);
    if (aboveChapterPath) {
      applyLayoutChange((prev) =>
        addVolumeAboveChapter(prev, aboveChapterPath, title),
      );
    } else {
      applyLayoutChange((prev) => addVolume(prev, title));
    }
    setContextMenu(null);
  };

  const handleChapterContextMenu = (doc: DocumentItem, e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      kind: "chapter",
      chapterPath: doc.path,
      x: e.clientX,
      y: e.clientY,
    });
  };

  const handleChapterDelete = (doc: DocumentItem) => {
    const ok = window.confirm(`确定删除「${doc.name}」吗？`);
    if (!ok) return;
    void onDeleteDoc(doc);
    setContextMenu(null);
  };

  const startRenameVolume = (volumeId: string) => {
    const vol = layout?.volumes.find((v) => v.id === volumeId);
    if (!vol) return;
    setRenamingVolumeId(volumeId);
    setVolumeRenameTitle(vol.title);
    setContextMenu(null);
  };

  const submitRenameVolume = () => {
    if (!renamingVolumeId) return;
    const trimmed = volumeRenameTitle.trim();
    if (trimmed) {
      applyLayoutChange((prev) => renameVolume(prev, renamingVolumeId, trimmed));
    }
    setRenamingVolumeId(null);
    setVolumeRenameTitle("");
  };

  const handleDeleteVolume = (volumeId: string) => {
    const vol = layout?.volumes.find((v) => v.id === volumeId);
    if (!vol) return;
    const ok = window.confirm(`删除卷「${vol.title}」？卷内章节将移到根列表。`);
    if (!ok) return;
    applyLayoutChange((prev) => deleteVolume(prev, volumeId));
    setContextMenu(null);
  };

  const applyPointerDrop = useCallback(
    (payload: DragPayload, target: DropTarget) => {
      if (payload.kind === "chapter") {
        applyLayoutChange((prev) => moveChapterTo(prev, payload.path, target));
        return;
      }
      if (payload.kind === "volume" && target.zone === "root") {
        applyLayoutChange((prev) =>
          moveVolumeInRoot(prev, payload.volumeId, target.index),
        );
      }
    },
    [applyLayoutChange],
  );

  const readDropTargetFromPoint = useCallback(
    (clientX: number, clientY: number) => {
      const el = document.elementFromPoint(clientX, clientY);
      const slot = el?.closest("[data-drop-target]") as HTMLElement | null;
      if (!slot?.dataset.dropTarget) return null;
      try {
        return JSON.parse(slot.dataset.dropTarget) as DropTarget;
      } catch {
        return null;
      }
    },
    [],
  );

  const readDropKeyFromPoint = useCallback((clientX: number, clientY: number) => {
    const el = document.elementFromPoint(clientX, clientY);
    const slot = el?.closest("[data-drop-key]") as HTMLElement | null;
    return slot?.dataset.dropKey ?? null;
  }, []);

  const startPointerDrag = useCallback(
    (payload: DragPayload) => (e: ReactPointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setPointerDrag(payload);
      if (payload.kind === "chapter") {
        setDraggingChapterPath(payload.path);
      }
    },
    [],
  );

  useEffect(() => {
    if (!pointerDrag) return;

    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";

    const onMove = (e: PointerEvent) => {
      const key = readDropKeyFromPoint(e.clientX, e.clientY);
      setDragOverKey(key);
      const target = readDropTargetFromPoint(e.clientX, e.clientY);
      if (target?.zone === "volume") {
        setCollapsedVolumes((prev) => {
          if (!prev.has(target.volumeId)) return prev;
          const next = new Set(prev);
          next.delete(target.volumeId);
          return next;
        });
      }
    };

    const finish = (e: PointerEvent) => {
      const target = readDropTargetFromPoint(e.clientX, e.clientY);
      if (target) {
        applyPointerDrop(pointerDrag, target);
      }
      setPointerDrag(null);
      setDraggingChapterPath(null);
      setDragOverKey(null);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [
    pointerDrag,
    applyPointerDrop,
    readDropKeyFromPoint,
    readDropTargetFromPoint,
  ]);

  const toggleVolumeCollapsed = useCallback((volumeId: string) => {
    setCollapsedVolumes((prev) => {
      const next = new Set(prev);
      if (next.has(volumeId)) next.delete(volumeId);
      else next.add(volumeId);
      return next;
    });
  }, []);

  const chapterWordCount = useCallback(
    (doc: DocumentItem) =>
      activePath === doc.path ? liveWordCount : doc.wordCount,
    [activePath, liveWordCount],
  );

  const renderChapterRow = (doc: DocumentItem, indent = 0) => {
    const active = activePath === doc.path;
    const deleting = deletingDocPath === doc.path;
    const confirming = confirmingDocPath === doc.path;
    const renaming = renamingDocPath === doc.path;
    const words = chapterWordCount(doc);

    return (
      <div
        key={doc.path}
        onContextMenu={(e) => handleChapterContextMenu(doc, e)}
        style={{
          display: "flex",
          gap: 5,
          paddingLeft: indent,
          opacity: draggingChapterPath === doc.path ? 0.45 : 1,
        }}
      >
        <div
          title="拖动排序"
          onPointerDown={
            renaming ? undefined : startPointerDrag({ kind: "chapter", path: doc.path })
          }
          style={{
            flexShrink: 0,
            width: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: renaming ? "default" : "grab",
            color: "var(--text-sub)",
            fontSize: 12,
            userSelect: "none",
            touchAction: "none",
          }}
        >
          ⠿
        </div>
        {renaming ? (
          <input
            autoFocus
            value={renameTitle}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onRenameTitleChange(e.target.value)}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void onSubmitRename(doc);
              }
              if (e.key === "Escape") {
                e.preventDefault();
                onCancelRename();
              }
            }}
            onBlur={() => void onSubmitRename(doc)}
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
            onContextMenu={(e) => handleChapterContextMenu(doc, e)}
            onClick={() => void onOpenDoc(doc)}
            style={{
              flex: 1,
              textAlign: "left",
              padding: "5px 7px",
              borderRadius: 8,
              border: "1px solid var(--btn-border)",
              background: active ? "rgba(59,130,246,0.12)" : "var(--btn-bg)",
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
              {active && activeDirty ? " *" : ""}
            </span>
            <span
              style={{
                flexShrink: 0,
                fontSize: 10,
                color: "var(--text-sub)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {words}
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            if (confirming) {
              void onDeleteDoc(doc);
              return;
            }
            onConfirmDelete(doc.path);
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
  };

  const displayLayout =
    layout ?? (layoutLoading ? null : fallbackChapterLayout(chapterPaths));

  const volumeTitleById = new Map(
    (displayLayout?.volumes ?? []).map((v) => [v.id, v.title]),
  );
  const hasAnyChapter = chapterDocs.length > 0;
  const hasVolumes = (displayLayout?.volumes.length ?? 0) > 0;

  const contextMenuPortal =
    contextMenu &&
    createPortal(
      <div
        ref={contextMenuRef}
        role="menu"
        onContextMenu={(e) => e.preventDefault()}
        style={{
          position: "fixed",
          left: contextMenu.x,
          top: contextMenu.y,
          zIndex: 10000,
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
          padding: 4,
          minWidth: 128,
        }}
      >
        {contextMenu.kind === "list" ? (
          <button
            type="button"
            onClick={() => handleAddVolume()}
            style={menuBtnStyle}
          >
            添加卷
          </button>
        ) : null}
        {contextMenu.kind === "chapter" ? (
          (() => {
            const doc = docByPath.get(contextMenu.chapterPath);
            if (!doc) return null;
            return (
              <>
                <button
                  type="button"
                  onClick={() => handleAddVolume(contextMenu.chapterPath)}
                  style={menuBtnStyle}
                >
                  添加卷
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onStartRenameChapter(doc);
                    setContextMenu(null);
                  }}
                  style={menuBtnStyle}
                >
                  重命名
                </button>
                <button
                  type="button"
                  onClick={() => handleChapterDelete(doc)}
                  style={menuBtnStyle}
                >
                  删除
                </button>
              </>
            );
          })()
        ) : null}
        {contextMenu.kind === "volume" ? (
          <>
            <button
              type="button"
              onClick={() => startRenameVolume(contextMenu.volumeId)}
              style={menuBtnStyle}
            >
              重命名卷
            </button>
            <button
              type="button"
              onClick={() => handleDeleteVolume(contextMenu.volumeId)}
              style={menuBtnStyle}
            >
              删除卷
            </button>
          </>
        ) : null}
      </div>,
      document.body,
    );

  return (
    <div
      onContextMenu={handleListContextMenu}
      style={{ display: "flex", flexDirection: "column", gap: 4, minHeight: 48 }}
    >
      {layoutLoading && !displayLayout ? (
        <div style={{ fontSize: 10, color: "var(--text-sub)" }}>加载结构…</div>
      ) : null}

      {displayLayout ? (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {!hasAnyChapter && !hasVolumes ? (
          <div
            style={{
              fontSize: 10,
              color: "var(--text-sub)",
              padding: "4px 2px",
            }}
          >
            暂无章节。可新建章节，或右键添加卷。
          </div>
        ) : null}

        {displayLayout.rootOrder.map((entry, rootIndex) => {
          if (entry.type === "chapter") {
            const doc = docByPath.get(entry.path);
            if (!doc) return null;
            const dropKey = `root-${rootIndex}`;
            return (
              <DropSlot
                key={`root-ch-${entry.path}`}
                dropKey={dropKey}
                dropTarget={{ zone: "root", index: rootIndex }}
                active={dragOverKey === dropKey}
              >
                {renderChapterRow(doc)}
              </DropSlot>
            );
          }

          const volumeId = entry.id;
          const title = volumeTitleById.get(volumeId) ?? "未命名卷";
          const collapsed = collapsedVolumes.has(volumeId);
          const paths = getVolumeDisplayPaths(
            displayLayout,
            volumeId,
            rootIndex,
          );
          const volDropKey = `vol-head-${volumeId}`;
          const volumeWordTotal = paths.reduce((sum, p) => {
            const d = docByPath.get(p);
            return d ? sum + chapterWordCount(d) : sum;
          }, 0);

          return (
            <DropSlot
              key={`vol-${volumeId}`}
              dropKey={`root-${rootIndex}`}
              dropTarget={{ zone: "root", index: rootIndex }}
              active={dragOverKey === `root-${rootIndex}`}
            >
              <DropSlot
                dropKey={volDropKey}
                dropTarget={{ zone: "volume", volumeId, index: 0 }}
                active={dragOverKey === volDropKey}
              >
                <div
                  onContextMenu={(e) => handleVolumeContextMenu(volumeId, e)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 6px",
                    borderRadius: 8,
                    border: "1px solid var(--btn-border)",
                    background: "var(--card)",
                  }}
                >
                <div
                  title="拖动卷"
                  onPointerDown={
                    renamingVolumeId === volumeId
                      ? undefined
                      : startPointerDrag({ kind: "volume", volumeId })
                  }
                  style={{
                    flexShrink: 0,
                    width: 14,
                    cursor: renamingVolumeId === volumeId ? "default" : "grab",
                    color: "var(--text-sub)",
                    fontSize: 12,
                    userSelect: "none",
                    touchAction: "none",
                  }}
                >
                  ⠿
                </div>
                <button
                  type="button"
                  aria-label={collapsed ? "展开卷内章节" : "折叠卷内章节"}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleVolumeCollapsed(volumeId);
                  }}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "var(--text-sub)",
                    cursor: "pointer",
                    padding: 0,
                    fontSize: 10,
                    width: 14,
                    flexShrink: 0,
                  }}
                >
                  {collapsed ? "▸" : "▾"}
                </button>
                {renamingVolumeId === volumeId ? (
                  <input
                    autoFocus
                    value={volumeRenameTitle}
                    onChange={(e) => setVolumeRenameTitle(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitRenameVolume();
                      if (e.key === "Escape") {
                        setRenamingVolumeId(null);
                        setVolumeRenameTitle("");
                      }
                    }}
                    onBlur={submitRenameVolume}
                    style={{
                      flex: 1,
                      padding: "2px 6px",
                      borderRadius: 6,
                      border: "1px solid var(--accent)",
                      fontSize: 11,
                      background: "rgba(59,130,246,0.12)",
                      color: "var(--text)",
                    }}
                  />
                ) : (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleVolumeCollapsed(volumeId)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleVolumeCollapsed(volumeId);
                      }
                    }}
                    style={{
                      flex: 1,
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--text)",
                      cursor: "pointer",
                      userSelect: "none",
                    }}
                  >
                    {title}
                  </span>
                )}
                <span
                  style={{
                    fontSize: 10,
                    color: "var(--text-sub)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                  title={collapsed ? "卷内总字数（已折叠）" : "卷内总字数"}
                >
                  {volumeWordTotal}
                </span>
                </div>
              </DropSlot>

              {!collapsed ? (
                <div
                  style={{
                    marginLeft: 10,
                    marginTop: 4,
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  {paths.map((path, volIndex) => {
                    const doc = docByPath.get(path);
                    if (!doc) return null;
                    const dropKey = `vol-${volumeId}-${volIndex}`;
                    return (
                      <DropSlot
                        key={path}
                        dropKey={dropKey}
                        dropTarget={{
                          zone: "volume",
                          volumeId,
                          index: volIndex,
                        }}
                        active={dragOverKey === dropKey}
                      >
                        {renderChapterRow(doc, 4)}
                      </DropSlot>
                    );
                  })}
                  <DropSlot
                    dropKey={`vol-${volumeId}-end`}
                    dropTarget={{
                      zone: "volume",
                      volumeId,
                      index: paths.length,
                    }}
                    active={dragOverKey === `vol-${volumeId}-end`}
                    minHeight={8}
                  >
                    {null}
                  </DropSlot>
                </div>
              ) : null}
            </DropSlot>
          );
        })}

        <DropSlot
          dropKey="root-end"
          dropTarget={{
            zone: "root",
            index: displayLayout.rootOrder.length,
          }}
          active={dragOverKey === "root-end"}
          minHeight={12}
        >
          {null}
        </DropSlot>
      </div>
      ) : null}

      {contextMenuPortal}
    </div>
  );
}
