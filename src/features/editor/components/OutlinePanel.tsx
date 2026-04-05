import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { readFile, saveFileContent } from "../../../shared/lib/tauri";
import type { DocumentItem } from "../../../shared/lib/tauri";

const OUTLINE_FONT_KEY = "glyph_outline_font_px";
const OUTLINE_FONT_MIN = 9;
const OUTLINE_FONT_MAX = 18;
const OUTLINE_FONT_DEFAULT = 11;

function readOutlineFont(): number {
  const raw = localStorage.getItem(OUTLINE_FONT_KEY);
  const n = raw ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return OUTLINE_FONT_DEFAULT;
  return Math.min(
    OUTLINE_FONT_MAX,
    Math.max(OUTLINE_FONT_MIN, Math.round(n)),
  );
}

type OutlinePanelProps = {
  docs: DocumentItem[];
  /** 当前主编辑区打开的文件路径；与侧栏选中的大纲一致时，右侧大纲与中间编辑器共用同一份内容 */
  currentFilePath: string | null;
  editorContent: string;
  onEditorContentChange: (content: string) => void;
  /** 主编辑区是否有未保存修改（用于侧栏换篇前与左侧一致：先提示保存） */
  editorDirty: boolean;
  /** 在侧栏列表中点选大纲时，在主编辑区打开该文件（与左侧列表行为一致） */
  onOpenOutlineInEditor: (doc: DocumentItem) => void | Promise<void>;
};

const rootShell: CSSProperties = {
  flex: 1,
  minHeight: 0,
  width: "100%",
  height: "100%",
  background: "var(--panel-bg)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const KIND_LABEL = "大纲";

export function OutlinePanel({
  docs,
  currentFilePath,
  editorContent,
  onEditorContentChange,
  editorDirty,
  onOpenOutlineInEditor,
}: OutlinePanelProps) {
  const panelDocs = useMemo(
    () => docs.filter((doc) => doc.kind === "outline"),
    [docs],
  );

  const noteKey = (path: string) => `outline_note_${path}`;

  const [viewMode, setViewMode] = useState<"list" | "detail">("list");
  const [selectedOutlinePath, setSelectedOutlinePath] = useState<string | null>(null);
  const [outlineContent, setOutlineContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const [note, setNote] = useState("");
  const [editingNote, setEditingNote] = useState(false);

  const [fontPx, setFontPx] = useState(() => readOutlineFont());

  const isLinked = useMemo(() => {
    if (!currentFilePath || !selectedOutlinePath) return false;
    if (selectedOutlinePath !== currentFilePath) return false;
    return panelDocs.some((d) => d.path === currentFilePath);
  }, [currentFilePath, selectedOutlinePath, panelDocs]);

  /** 仅当主编辑区「换到」某大纲路径时对齐侧栏，避免 loadDocs 刷新列表时把用户从列表视图拽回详情 */
  const lastSyncedCenterOutlineRef = useRef<string | null>(null);

  const bumpFont = (delta: number) => {
    setFontPx((prev) => {
      const next = Math.min(
        OUTLINE_FONT_MAX,
        Math.max(OUTLINE_FONT_MIN, prev + delta),
      );
      localStorage.setItem(OUTLINE_FONT_KEY, String(next));
      return next;
    });
  };

  const selectedOutline =
    panelDocs.find((doc) => doc.path === selectedOutlinePath) ?? null;

  useEffect(() => {
    if (!currentFilePath) {
      lastSyncedCenterOutlineRef.current = null;
      return;
    }
    const panelDoc = panelDocs.find((d) => d.path === currentFilePath);
    if (!panelDoc) {
      lastSyncedCenterOutlineRef.current = null;
      return;
    }
    if (lastSyncedCenterOutlineRef.current === currentFilePath) {
      return;
    }
    lastSyncedCenterOutlineRef.current = currentFilePath;
    setSelectedOutlinePath(currentFilePath);
    setViewMode("detail");
  }, [currentFilePath, panelDocs]);

  useEffect(() => {
    if (panelDocs.length === 0) {
      setSelectedOutlinePath(null);
      setOutlineContent("");
      setNote("");
      setViewMode("list");
      return;
    }

    if (
      selectedOutlinePath &&
      !panelDocs.some((doc) => doc.path === selectedOutlinePath)
    ) {
      setSelectedOutlinePath(null);
      setOutlineContent("");
      setNote("");
      setViewMode("list");
    }
  }, [panelDocs, selectedOutlinePath]);

  useEffect(() => {
    let cancelled = false;

    const loadOutline = async () => {
      if (!selectedOutlinePath || viewMode !== "detail") return;

      if (isLinked) {
        setLoading(false);
        const saved = localStorage.getItem(noteKey(selectedOutlinePath));
        setNote(saved || "可在右侧直接修改");
        setEditingNote(false);
        return;
      }

      try {
        setLoading(true);

        const text = await readFile(selectedOutlinePath);
        if (cancelled) return;

        setOutlineContent(text);
        setSaveState("idle");

        const saved = localStorage.getItem(noteKey(selectedOutlinePath));
        setNote(saved || "可在右侧直接修改");
        setEditingNote(false);
      } catch (err) {
        console.error(`读取${KIND_LABEL}失败`, err);
        if (!cancelled) {
          setOutlineContent("");
          setSaveState("error");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadOutline();

    return () => {
      cancelled = true;
    };
  }, [selectedOutlinePath, viewMode, isLinked]);

  useEffect(() => {
    if (!selectedOutlinePath || viewMode !== "detail") return;
    if (isLinked) return;

    const timer = window.setTimeout(async () => {
      try {
        setSaveState("saving");
        await saveFileContent(selectedOutlinePath, outlineContent);
        setSaveState("saved");
      } catch (err) {
        console.error(`保存${KIND_LABEL}失败`, err);
        setSaveState("error");
      }
    }, 500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [selectedOutlinePath, outlineContent, viewMode, isLinked]);

  useEffect(() => {
    if (!selectedOutlinePath || viewMode !== "detail") return;
    localStorage.setItem(noteKey(selectedOutlinePath), note);
  }, [note, selectedOutlinePath, viewMode]);

  if (viewMode === "list") {
    return (
      <div style={rootShell}>
        <div
          style={{
            padding: "8px 10px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontSize: fontPx,
              fontWeight: 700,
              color: "var(--text-sub)",
              lineHeight: 1.2,
            }}
          >
            {KIND_LABEL}列表
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button
              type="button"
              onClick={() => bumpFont(-1)}
              disabled={fontPx <= OUTLINE_FONT_MIN}
              aria-label={`缩小${KIND_LABEL}字号`}
              style={{
                border: "1px solid var(--btn-border)",
                background: "var(--btn-bg)",
                color: "var(--text)",
                borderRadius: 6,
                padding: "2px 6px",
                cursor: fontPx <= OUTLINE_FONT_MIN ? "not-allowed" : "pointer",
                fontSize: 10,
                lineHeight: 1,
                opacity: fontPx <= OUTLINE_FONT_MIN ? 0.45 : 1,
              }}
            >
              A−
            </button>
            <button
              type="button"
              onClick={() => bumpFont(1)}
              disabled={fontPx >= OUTLINE_FONT_MAX}
              aria-label={`放大${KIND_LABEL}字号`}
              style={{
                border: "1px solid var(--btn-border)",
                background: "var(--btn-bg)",
                color: "var(--text)",
                borderRadius: 6,
                padding: "2px 6px",
                cursor: fontPx >= OUTLINE_FONT_MAX ? "not-allowed" : "pointer",
                fontSize: 10,
                lineHeight: 1,
                opacity: fontPx >= OUTLINE_FONT_MAX ? 0.45 : 1,
              }}
            >
              A+
            </button>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: "auto",
            padding: "8px 10px",
            display: "flex",
            flexDirection: "column",
            gap: 5,
          }}
        >
          {panelDocs.length === 0 ? (
            <div
              style={{
                fontSize: fontPx,
                color: "var(--text-sub)",
              }}
            >
              还没有{KIND_LABEL}
            </div>
          ) : (
            panelDocs.map((doc) => (
              <button
                key={doc.path}
                type="button"
                onClick={() => {
                  void (async () => {
                    if (currentFilePath === doc.path) {
                      setSelectedOutlinePath(doc.path);
                      setViewMode("detail");
                      return;
                    }
                    if (editorDirty) {
                      void onOpenOutlineInEditor(doc);
                      return;
                    }
                    await onOpenOutlineInEditor(doc);
                    setSelectedOutlinePath(doc.path);
                    setViewMode("detail");
                  })();
                }}
                style={{
                  width: "100%",
                  border: "1px solid var(--btn-border)",
                  background: "var(--btn-bg)",
                  color: "var(--text)",
                  borderRadius: 8,
                  padding: "6px 8px",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span
                  style={{
                    display: "block",
                    fontSize: fontPx,
                    fontWeight: 500,
                    lineHeight: 1.2,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {doc.name}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={rootShell}>
      <div
        style={{
          padding: "8px 10px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          gap: 5,
          minWidth: 0,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontSize: fontPx,
              fontWeight: 700,
              color: "var(--text)",
              lineHeight: 1.2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
            }}
            title={selectedOutline?.name ?? `未选择${KIND_LABEL}`}
          >
            {selectedOutline?.name ?? `未选择${KIND_LABEL}`}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => bumpFont(-1)}
              disabled={fontPx <= OUTLINE_FONT_MIN}
              aria-label={`缩小${KIND_LABEL}字号`}
              style={{
                border: "1px solid var(--btn-border)",
                background: "var(--btn-bg)",
                color: "var(--text)",
                borderRadius: 6,
                padding: "2px 6px",
                cursor: fontPx <= OUTLINE_FONT_MIN ? "not-allowed" : "pointer",
                fontSize: 10,
                lineHeight: 1,
                opacity: fontPx <= OUTLINE_FONT_MIN ? 0.45 : 1,
              }}
            >
              A−
            </button>
            <button
              type="button"
              onClick={() => bumpFont(1)}
              disabled={fontPx >= OUTLINE_FONT_MAX}
              aria-label={`放大${KIND_LABEL}字号`}
              style={{
                border: "1px solid var(--btn-border)",
                background: "var(--btn-bg)",
                color: "var(--text)",
                borderRadius: 6,
                padding: "2px 6px",
                cursor: fontPx >= OUTLINE_FONT_MAX ? "not-allowed" : "pointer",
                fontSize: 10,
                lineHeight: 1,
                opacity: fontPx >= OUTLINE_FONT_MAX ? 0.45 : 1,
              }}
            >
              A+
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode("list");
                setEditingNote(false);
              }}
              title="返回列表"
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                border: "1px solid var(--btn-border)",
                background: "var(--btn-bg)",
                color: "var(--text)",
                cursor: "pointer",
                display: "grid",
                placeItems: "center",
                fontSize: 10,
                lineHeight: 1,
                padding: 0,
                flexShrink: 0,
              }}
            >
              ←
            </button>
          </div>
        </div>

        {editingNote ? (
          <input
            value={note}
            onChange={(e) => setNote(e.currentTarget.value)}
            onBlur={() => setEditingNote(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") {
                setEditingNote(false);
              }
            }}
            autoFocus
            style={{
              width: "100%",
              padding: 0,
              border: "none",
              outline: "none",
              background: "transparent",
              color: "var(--text-sub)",
              fontSize: fontPx,
              lineHeight: 1.3,
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingNote(true)}
            style={{
              border: "none",
              background: "transparent",
              color: "var(--text-sub)",
              padding: 0,
              textAlign: "left",
              cursor: "text",
              fontSize: fontPx,
              lineHeight: 1.3,
              width: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={note || "可在右侧直接修改"}
          >
            {note || "可在右侧直接修改"}
          </button>
        )}
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          padding: "8px 10px 0",
        }}
      >
        {loading ? (
          <div
            style={{
              fontSize: fontPx,
              color: "var(--text-sub)",
            }}
          >
            读取中…
          </div>
        ) : selectedOutline ? (
          <textarea
            value={isLinked ? editorContent : outlineContent}
            onChange={(e) => {
              const v = e.currentTarget.value;
              if (isLinked) {
                onEditorContentChange(v);
              } else {
                setOutlineContent(v);
              }
            }}
            placeholder="写下结构、节奏、设定、备注……"
            style={{
              flex: 1,
              minHeight: 0,
              width: "100%",
              resize: "none",
              border: "none",
              outline: "none",
              background: "transparent",
              color: "var(--text)",
              fontSize: fontPx,
              lineHeight: 1.7,
              fontFamily: "inherit",
              padding: 0,
              overflow: "auto",
              boxSizing: "border-box",
            }}
          />
        ) : (
          <div
            style={{
              fontSize: fontPx,
              color: "var(--text-sub)",
            }}
          >
            当前没有可用{KIND_LABEL}。
          </div>
        )}
      </div>

      <div
        style={{
          borderTop: "1px solid var(--border)",
          padding: "5px 10px",
          fontSize: fontPx,
          color: "var(--text-sub)",
          flexShrink: 0,
        }}
      >
        {isLinked
          ? "与主编辑区同步（⌘S 保存）"
          : saveState === "saving"
            ? "保存中…"
            : saveState === "saved"
              ? "已保存"
              : saveState === "error"
                ? "保存失败"
                : "idle"}
      </div>
    </div>
  );
}
