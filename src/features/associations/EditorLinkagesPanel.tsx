import { useMemo, useState, type Dispatch, type SetStateAction } from "react";

import { ReferencesPanel } from "../preview/components/ReferencesPanel";
import {
  associationRecordsForBook,
  fileNameFromPath,
  removeAssociation,
  saveAssociations,
  type AssociationRecord,
} from "../../shared/lib/associations";
import type { Book } from "../../shared/lib/tauri";

type Props = {
  book: Book;
  associations: AssociationRecord[];
  setAssociations: Dispatch<SetStateAction<AssociationRecord[]>>;
  onOpenCrossBook: () => void;
};

function kindLabel(a: AssociationRecord) {
  if (a.kind === "sticky") return "便签";
  return "批注";
}

/** 避免「引用」与「正文」重复显示（如两遍「你好」） */
function anchorQuoteAndBody(a: AssociationRecord): {
  quote: string | null;
  body: string;
} {
  if (a.kind !== "anchor") {
    return { quote: null, body: a.body.trim() || "（空）" };
  }
  const q = a.quote.trim();
  const b = a.body.trim();
  if (!q) {
    return { quote: null, body: b || "（空）" };
  }
  if (!b) {
    return { quote: null, body: q };
  }
  if (b === q) {
    return { quote: null, body: b };
  }
  const punct = ["。", ".", "，", ",", "；", ";", "！", "!", "？", "?"];
  for (const p of punct) {
    if (b === q + p) {
      return { quote: null, body: b };
    }
  }
  if (b.startsWith(q) && b.length <= q.length + 2) {
    return { quote: null, body: b };
  }
  return { quote: q, body: b };
}

export function EditorLinkagesPanel({
  book,
  associations,
  setAssociations,
  onOpenCrossBook,
}: Props) {
  const [showHelp, setShowHelp] = useState(false);

  const bookRows = useMemo(
    () => associationRecordsForBook(associations, book.id),
    [associations, book.id],
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        minHeight: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: 8,
        }}
      >
        <button
          type="button"
          onClick={() => setShowHelp((v) => !v)}
          style={{
            border: "none",
            background: "transparent",
            color: "var(--text-sub)",
            fontSize: 11,
            cursor: "pointer",
            padding: "2px 4px",
            textDecoration: showHelp ? "underline" : "none",
          }}
        >
          {showHelp ? "隐藏说明" : "显示说明"}
        </button>
      </div>

      <section>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--text-sub)",
            marginBottom: showHelp ? 8 : 6,
          }}
        >
          标签互文
        </div>
        {showHelp ? (
          <div
            style={{
              fontSize: 11,
              color: "var(--text-sub)",
              lineHeight: 1.5,
              marginBottom: 8,
            }}
          >
            根据正文标签（#tag）在文中查找同名关键词，用于人物/设定互文。
          </div>
        ) : null}
        <ReferencesPanel />
      </section>

      <section>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--text-sub)",
            marginBottom: showHelp ? 8 : 6,
          }}
        >
          批注与便签
        </div>
        {showHelp ? (
          <div
            style={{
              fontSize: 11,
              color: "var(--text-sub)",
              lineHeight: 1.5,
              marginBottom: 10,
            }}
          >
            工具栏「批注 / 便签」写入；勾选「跨书」后可在跨书页面统一查看。
          </div>
        ) : null}

        {bookRows.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--text-faint)" }}>
            本书暂无批注或便签。
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {bookRows.map((a) => {
              const { quote, body } = anchorQuoteAndBody(a);
              return (
                <div
                  key={a.id}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    padding: 10,
                    background: "var(--bg)",
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
                      gap: 8,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: "var(--text-sub)",
                      }}
                    >
                      {kindLabel(a)}
                      {a.scope === "global" ? " · 跨书" : ""}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setAssociations((prev) => {
                          const next = removeAssociation(prev, a.id);
                          saveAssociations(next);
                          return next;
                        });
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
                  <div style={{ fontSize: 10, color: "var(--text-sub)" }}>
                    {fileNameFromPath(a.docPath)}
                  </div>
                  {quote ? (
                    <div
                      style={{
                        fontSize: 11,
                        lineHeight: 1.45,
                        color: "var(--text)",
                        borderLeft: "2px solid var(--border)",
                        paddingLeft: 8,
                      }}
                    >
                      {quote}
                    </div>
                  ) : null}
                  <div
                    style={{
                      fontSize: 12,
                      lineHeight: 1.5,
                      color: "var(--text)",
                    }}
                  >
                    {body}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <button
        type="button"
        onClick={onOpenCrossBook}
        style={{
          marginTop: 4,
          width: "100%",
          border: "1px dashed var(--border)",
          borderRadius: 10,
          background: "var(--btn-bg)",
          color: "var(--text)",
          padding: "10px 12px",
          cursor: "pointer",
          fontSize: 12,
          lineHeight: 1.3,
        }}
      >
        打开跨书关联页…
      </button>
    </div>
  );
}
