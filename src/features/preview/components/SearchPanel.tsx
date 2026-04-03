import { useMemo, useState } from "react";

import { useEditorStore } from "../../../app/store/editorStore";
import { getMarkdownEditorHandle } from "../../editor/components/MarkdownEditor";

type SearchItem = {
  index: number;
  excerpt: string;
};

function buildSearchResults(content: string, query: string): SearchItem[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const lines = content.split("\n");
  const results: SearchItem[] = [];

  let globalOffset = 0;
  const lowerQuery = trimmed.toLowerCase();

  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    const found = lowerLine.indexOf(lowerQuery);

    if (found !== -1) {
      results.push({
        index: globalOffset + found,
        excerpt: line.trim() || trimmed,
      });
    }

    globalOffset += line.length + 1;
  }

  return results;
}

export function SearchPanel() {
  const content = useEditorStore((s) => s.content);
  const setActiveBlockIndex = useEditorStore((s) => s.setActiveBlockIndex);

  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    return buildSearchResults(content, query);
  }, [content, query]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <input
        type="text"
        placeholder="搜索当前文档"
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "8px 10px",
          border: "1px solid #ddd",
          borderRadius: 8,
          fontSize: 14,
          outline: "none",
        }}
      />

      {query.trim() === "" ? (
        <div style={{ color: "#888", fontSize: 14 }}>输入关键词开始搜索</div>
      ) : results.length === 0 ? (
        <div style={{ color: "#888", fontSize: 14 }}>没有找到结果</div>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {results.map((item, i) => (
            <div
              key={`${item.index}-${i}`}
              onClick={() => {
                setActiveBlockIndex(item.index);
                getMarkdownEditorHandle()?.highlightBlockAtIndex(item.index);
              }}
              style={{
                padding: "8px 10px",
                border: "1px solid #ddd",
                borderRadius: 8,
                background: "#fff",
                fontSize: 13,
                cursor: "pointer",
                color: "#222",
              }}
            >
              {item.excerpt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}