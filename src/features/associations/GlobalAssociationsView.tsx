import { useEffect, useMemo, useState } from "react";

import {
  filterCrossBookAssociations,
  loadAssociations,
  removeAssociation,
  saveAssociations,
  fileNameFromPath,
  type AssociationRecord,
} from "../../shared/lib/associations";
import { listBooks } from "../../shared/lib/tauri";
import type { Book } from "../../shared/lib/tauri";

type Props = {
  onClose: () => void;
  /** 全屏页用 page；编辑器内浮层用 overlay */
  variant: "page" | "overlay";
};

function kindLabel(a: AssociationRecord) {
  if (a.kind === "sticky") return "便签";
  return "批注";
}

export function GlobalAssociationsView({ onClose, variant }: Props) {
  const [items, setItems] = useState<AssociationRecord[]>(() =>
    loadAssociations(),
  );
  const [books, setBooks] = useState<Book[]>([]);

  const globalItems = useMemo(
    () => filterCrossBookAssociations(items),
    [items],
  );

  const bookTitleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of books) {
      m.set(b.id, b.title);
    }
    return m;
  }, [books]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await listBooks();
        if (!cancelled) setBooks(list);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = (next: AssociationRecord[]) => {
    setItems(next);
    saveAssociations(next);
  };

  const shell =
    variant === "overlay"
      ? {
          position: "fixed" as const,
          inset: 0,
          zIndex: 40,
          background: "rgba(15,23,42,0.45)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
        }
      : {
          flex: 1,
          minHeight: 0,
          overflowY: "auto" as const,
          WebkitOverflowScrolling: "touch" as const,
          background: "var(--bg)",
          color: "var(--text)",
        };

  const cardMaxW = variant === "overlay" ? 560 : 720;

  return (
    <div style={shell}>
      <div
        style={
          variant === "overlay"
            ? {
                width: "100%",
                maxWidth: cardMaxW,
                maxHeight: "min(88vh, 720px)",
                borderRadius: 14,
                border: "1px solid var(--border)",
                background: "var(--card)",
                boxShadow: "0 20px 50px rgba(0,0,0,0.2)",
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
                overflow: "hidden",
              }
            : {
                maxWidth: cardMaxW,
                margin: "0 auto",
                padding: "24px 24px 48px",
                width: "100%",
                boxSizing: "border-box",
              }
        }
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: variant === "overlay" ? 0 : 18,
            padding: variant === "overlay" ? "14px 16px" : 0,
            borderBottom:
              variant === "overlay" ? "1px solid var(--border)" : undefined,
            background: variant === "overlay" ? "var(--toolbar-bg)" : undefined,
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>跨书关联</div>
            <div style={{ fontSize: 11, color: "var(--text-sub)", marginTop: 4 }}>
              所有标记为「跨书」的批注与便签（存于本机）
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: "1px solid var(--btn-border)",
              borderRadius: 8,
              background: "var(--btn-bg)",
              color: "var(--text)",
              padding: "6px 12px",
              cursor: "pointer",
              fontSize: 12,
              flexShrink: 0,
            }}
          >
            {variant === "overlay" ? "关闭" : "返回"}
          </button>
        </div>

        <div
          style={{
            flex: variant === "overlay" ? 1 : undefined,
            minHeight: 0,
            overflowY: "auto",
            padding: variant === "overlay" ? "12px 16px 16px" : 0,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {globalItems.length === 0 ? (
            <div
              style={{
                fontSize: 13,
                color: "var(--text-sub)",
                lineHeight: 1.6,
                padding: variant === "page" ? 8 : 4,
              }}
            >
              暂无跨书记录。在编辑器中为批注或便签勾选「跨书」后，会出现在这里。
            </div>
          ) : (
            globalItems.map((a) => (
              <div
                key={a.id}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: 12,
                  background: "var(--btn-bg)",
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
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: "var(--accent)",
                      textTransform: "none",
                    }}
                  >
                    {kindLabel(a)}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        !window.confirm("确定删除这条跨书记录？此操作不可撤销。")
                      ) {
                        return;
                      }
                      persist(removeAssociation(items, a.id));
                    }}
                    style={{
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
                <div style={{ fontSize: 11, color: "var(--text-sub)" }}>
                  {bookTitleById.get(a.bookId) ?? "未知书籍"} ·{" "}
                  {fileNameFromPath(a.docPath)}
                </div>
                {a.kind === "anchor" && a.quote ? (
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text)",
                      lineHeight: 1.5,
                      borderLeft: "3px solid var(--accent-soft)",
                      paddingLeft: 8,
                    }}
                  >
                    {a.quote}
                  </div>
                ) : null}
                <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--text)" }}>
                  {a.body || "（无正文）"}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
