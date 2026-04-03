import { useEffect, useMemo, useState } from "react";
import { readFile, saveFileContent } from "../../../shared/lib/tauri";
import type { DocumentItem } from "../../../shared/lib/tauri";

type OutlinePanelProps = {
  docs: DocumentItem[];
  currentFilePath: string | null;
};

export function OutlinePanel({ docs }: OutlinePanelProps) {
  const outlineDocs = useMemo(
    () => docs.filter((doc) => doc.kind === "outline"),
    [docs],
  );

  const [viewMode, setViewMode] = useState<"list" | "detail">("list");
  const [selectedOutlinePath, setSelectedOutlinePath] = useState<string | null>(null);
  const [outlineContent, setOutlineContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const [note, setNote] = useState("");
  const [editingNote, setEditingNote] = useState(false);

  const selectedOutline =
    outlineDocs.find((doc) => doc.path === selectedOutlinePath) ?? null;

  useEffect(() => {
    if (outlineDocs.length === 0) {
      setSelectedOutlinePath(null);
      setOutlineContent("");
      setNote("");
      setViewMode("list");
      return;
    }

    if (
      selectedOutlinePath &&
      !outlineDocs.some((doc) => doc.path === selectedOutlinePath)
    ) {
      setSelectedOutlinePath(null);
      setOutlineContent("");
      setNote("");
      setViewMode("list");
    }
  }, [outlineDocs, selectedOutlinePath]);

  useEffect(() => {
    let cancelled = false;

    const loadOutline = async () => {
      if (!selectedOutlinePath || viewMode !== "detail") return;

      try {
        setLoading(true);

        const text = await readFile(selectedOutlinePath);
        if (cancelled) return;

        setOutlineContent(text);
        setSaveState("idle");

        const saved = localStorage.getItem(`outline_note_${selectedOutlinePath}`);
        setNote(saved || "可在右侧直接修改");
        setEditingNote(false);
      } catch (err) {
        console.error("读取大纲失败", err);
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
  }, [selectedOutlinePath, viewMode]);

  useEffect(() => {
    if (!selectedOutlinePath || viewMode !== "detail") return;

    const timer = window.setTimeout(async () => {
      try {
        setSaveState("saving");
        await saveFileContent(selectedOutlinePath, outlineContent);
        setSaveState("saved");
      } catch (err) {
        console.error("保存大纲失败", err);
        setSaveState("error");
      }
    }, 500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [selectedOutlinePath, outlineContent, viewMode]);

  useEffect(() => {
    if (!selectedOutlinePath || viewMode !== "detail") return;
    localStorage.setItem(`outline_note_${selectedOutlinePath}`, note);
  }, [note, selectedOutlinePath, viewMode]);

  if (viewMode === "list") {
    return (
      <div
        style={{
          minHeight: "100%",
          background: "var(--panel-bg)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "8px 10px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--text-sub)",
              lineHeight: 1.2,
            }}
          >
            大纲列表
          </div>
        </div>

        <div
          style={{
            padding: "8px 10px",
            display: "flex",
            flexDirection: "column",
            gap: 5,
          }}
        >
          {outlineDocs.length === 0 ? (
            <div
              style={{
                fontSize: 10,
                color: "var(--text-sub)",
              }}
            >
              还没有大纲
            </div>
          ) : (
            outlineDocs.map((doc) => (
              <button
                key={doc.path}
                type="button"
                onClick={() => {
                  setSelectedOutlinePath(doc.path);
                  setViewMode("detail");
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
                    fontSize: 11,
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
    <div
      style={{
        minHeight: "100%",
        height: "100%",
        background: "var(--panel-bg)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "8px 10px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          gap: 5,
          minWidth: 0,
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
              fontSize: 12,
              fontWeight: 700,
              color: "var(--text)",
              lineHeight: 1.2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
            }}
            title={selectedOutline?.name ?? "未选择大纲"}
          >
            {selectedOutline?.name ?? "未选择大纲"}
          </div>

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
    fontSize: 11,
    lineHeight: 1,
    padding: 0,
    flexShrink: 0,
  }}
>
  ←
</button>
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
              fontSize: 10,
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
              fontSize: 10,
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
          padding: "8px 10px 14px",
          overflow: "auto",
        }}
      >
        {loading ? (
          <div
            style={{
              fontSize: 10,
              color: "var(--text-sub)",
            }}
          >
            读取中…
          </div>
        ) : selectedOutline ? (
          <textarea
            value={outlineContent}
            onChange={(e) => setOutlineContent(e.currentTarget.value)}
            placeholder="写下结构、节奏、设定、备注……"
            style={{
              width: "100%",
              minHeight: 360,
              resize: "none",
              border: "none",
              outline: "none",
              background: "transparent",
              color: "var(--text)",
              fontSize: 11,
              lineHeight: 1.7,
              fontFamily: "inherit",
              padding: 0,
            }}
          />
        ) : (
          <div
            style={{
              fontSize: 10,
              color: "var(--text-sub)",
            }}
          >
            当前没有可用大纲。
          </div>
        )}
      </div>

      <div
        style={{
          borderTop: "1px solid var(--border)",
          padding: "5px 10px",
          fontSize: 10,
          color: "var(--text-sub)",
        }}
      >
        {saveState === "saving"
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