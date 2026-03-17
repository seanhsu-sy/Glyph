import React from "react";

import { useEditorStore } from "../../../app/store/editorStore";
import { useEditorActions } from "../hooks/useEditorActions";

export function MarkdownEditor() {
  const content = useEditorStore((s) => s.content);
  const { updateContent } = useEditorActions();

  return (
    <textarea
      className="markdown-editor"
      placeholder="Write your markdown here..."
      value={content}
      onChange={(e) => updateContent(e.target.value)}
      spellCheck={false}
      style={{
        width: "100%",
        height: "100%",
        resize: "none",
        boxSizing: "border-box",
      }}
    />
  );
}

