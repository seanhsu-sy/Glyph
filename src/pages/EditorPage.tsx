import React from "react";

import { useEditorStore } from "../app/store/editorStore";
import { MarkdownEditor } from "../features/editor/components/MarkdownEditor";
import { Toolbar } from "../features/editor/components/Toolbar";
import { MarkdownPreview } from "../features/preview/components/MarkdownPreview";

export function EditorPage() {
  const content = useEditorStore((s) => s.content);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
      }}
    >
      <Toolbar />
      <div
        style={{
          display: "flex",
          flex: 1,
          minHeight: 0,
        }}
      >
        <div
          style={{
            flex: 1,
            borderRight: "1px solid #e2e2e2",
          }}
        >
          <MarkdownEditor />
        </div>
        <div
          style={{
            flex: 1,
            padding: "0 12px",
            overflow: "auto",
          }}
        >
          <MarkdownPreview content={content} />
        </div>
      </div>
    </div>
  );
}

