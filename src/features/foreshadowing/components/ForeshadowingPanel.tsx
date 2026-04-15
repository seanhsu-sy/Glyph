import { useMemo, useState } from "react";

import type { ForeshadowRecord } from "../types";
import { aggregateByTag, type TagSummary } from "../services/foreshadowingStats";

type ForeshadowingPanelProps = {
  records: ForeshadowRecord[];
  onJumpToRecord: (rec: ForeshadowRecord) => void;
};

function kindLabel(kind: ForeshadowRecord["docKind"]): string {
  return kind === "outline" ? "大纲" : "章节";
}

export function ForeshadowingPanel({
  records,
  onJumpToRecord,
}: ForeshadowingPanelProps) {
  const summaries = useMemo(() => aggregateByTag(records), [records]);
  const [openTag, setOpenTag] = useState<string | null>(null);

  if (summaries.length === 0) {
    return (
      <div style={{ fontSize: 11, color: "var(--text-sub)", lineHeight: 1.5 }}>
        暂无伏笔。在编辑区选中一段文字，点击工具栏「伏笔」并输入标签名即可添加；数据保存在本书
        <code style={{ fontSize: 10 }}>.glyph/foreshadowing.json</code>。
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        minHeight: 0,
        overflow: "auto",
      }}
    >
      {summaries.map((s) => (
        <TagBlock
          key={s.tag}
          summary={s}
          expanded={openTag === s.tag}
          onToggle={() =>
            setOpenTag((prev) => (prev === s.tag ? null : s.tag))
          }
          onJumpToRecord={onJumpToRecord}
        />
      ))}
    </div>
  );
}

function TagBlock({
  summary,
  expanded,
  onToggle,
  onJumpToRecord,
}: {
  summary: TagSummary;
  expanded: boolean;
  onToggle: () => void;
  onJumpToRecord: (rec: ForeshadowRecord) => void;
}) {
  const { tag, occurrenceCount, distinctDocCount, lastDocName, entries } =
    summary;

  return (
    <div
      style={{
        border: "1px solid var(--btn-border)",
        borderRadius: 8,
        background: "var(--btn-bg)",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%",
          textAlign: "left",
          border: "none",
          background: "transparent",
          color: "var(--text)",
          padding: "8px 10px",
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 12 }}>{tag}</span>
          <span style={{ fontSize: 10, color: "var(--text-sub)" }}>
            {occurrenceCount} 处 · {distinctDocCount} 篇
          </span>
        </div>
        <div style={{ fontSize: 10, color: "var(--text-sub)" }}>
          最近：{lastDocName}
        </div>
      </button>

      {expanded ? (
        <div
          style={{
            borderTop: "1px solid var(--border)",
            padding: "6px 8px 8px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {entries.map((rec) => (
            <button
              key={rec.id}
              type="button"
              onClick={() => onJumpToRecord(rec)}
              style={{
                textAlign: "left",
                border: "1px solid var(--border)",
                borderRadius: 6,
                background: "var(--card)",
                color: "var(--text)",
                padding: "6px 8px",
                cursor: "pointer",
                fontSize: 10,
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 6,
                  color: "var(--text-sub)",
                }}
              >
                <span>
                  {kindLabel(rec.docKind)} · {rec.docName}
                </span>
                {rec.positionUncertain ? (
                  <span title="正文已改动，位置可能已变动">⚠ 位置待确认</span>
                ) : null}
              </div>
              <div
                style={{
                  color: "var(--text)",
                  lineHeight: 1.45,
                  maxHeight: 72,
                  overflow: "hidden",
                }}
              >
                {rec.excerpt || "（空摘录）"}
              </div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
