import { useMemo } from "react";

import { useEditorStore } from "../../../app/store/editorStore";
import { getMarkdownEditorHandle } from "../../editor/components/MarkdownEditor";

type ReferenceItem = {
  keyword: string;
  index: number;
  excerpt: string;
};

function getKeywordsFromTags(tags: { tag: string; index: number }[]) {
  const set = new Set<string>();

  for (const item of tags) {
    const parts = item.tag
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length === 0) continue;

    // 优先使用最后一级，例如 角色/主角 -> 主角
    const leaf = parts[parts.length - 1];
    if (leaf) set.add(leaf);
  }

  return Array.from(set);
}

function getTagRangesInLine(lineText: string) {
  const ranges: { start: number; end: number }[] = [];
  const regex = /#[^\s]+/g;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(lineText)) !== null) {
    ranges.push({
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  return ranges;
}

function isInsideRanges(index: number, ranges: { start: number; end: number }[]) {
  return ranges.some((range) => index >= range.start && index < range.end);
}

function buildReferences(
  content: string,
  tags: { tag: string; index: number }[],
): ReferenceItem[] {
  const keywords = getKeywordsFromTags(tags);
  if (keywords.length === 0) return [];

  const lines = content.split("\n");
  const result: ReferenceItem[] = [];

  let globalOffset = 0;

  for (const line of lines) {
    const tagRanges = getTagRangesInLine(line);

    for (const keyword of keywords) {
      let searchIndex = 0;

      while (searchIndex < line.length) {
        const found = line.indexOf(keyword, searchIndex);
        if (found === -1) break;

        const globalIndex = globalOffset + found;

        // 如果这个命中在 tag 本身里，就跳过
        if (!isInsideRanges(found, tagRanges)) {
          result.push({
            keyword,
            index: globalIndex,
            excerpt: line.trim() || keyword,
          });
        }

        searchIndex = found + keyword.length;
      }
    }

    globalOffset += line.length + 1;
  }

  return result;
}

function groupReferencesByKeyword(items: ReferenceItem[]) {
  const grouped: Record<string, ReferenceItem[]> = {};

  for (const item of items) {
    if (!grouped[item.keyword]) {
      grouped[item.keyword] = [];
    }
    grouped[item.keyword].push(item);
  }

  return grouped;
}

export function ReferencesPanel() {
  const content = useEditorStore((s) => s.content);
  const tags = useEditorStore((s) => s.tags);
  const setActiveBlockIndex = useEditorStore((s) => s.setActiveBlockIndex);

  const grouped = useMemo(() => {
    const references = buildReferences(content, tags);
    return groupReferencesByKeyword(references);
  }, [content, tags]);

  const keywords = Object.keys(grouped);

  if (keywords.length === 0) {
    return <div style={{ color: "#888", fontSize: 14 }}>暂无关联</div>;
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {keywords.map((keyword) => (
        <div key={keyword}>
          <div
            style={{
              fontWeight: 700,
              fontSize: 15,
              marginBottom: 6,
            }}
          >
            {keyword}
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {grouped[keyword].map((item, i) => (
              <div
                key={`${keyword}-${item.index}-${i}`}
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
        </div>
      ))}
    </div>
  );
}