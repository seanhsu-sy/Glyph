import React, { useEffect } from "react";

import { useEditorStore } from "../../../app/store/editorStore";
import { useFileActions } from "../../files/hooks/useFileActions";

function renderSaveStatus(status: "idle" | "saving" | "saved" | "unsaved") {
  switch (status) {
    case "saving":
      return "Saving...";
    case "saved":
      return "Saved";
    case "unsaved":
      return "Unsaved";
    case "idle":
    default:
      return "";
  }
}

export function Toolbar() {
  const { openFile, saveFile } = useFileActions();
  const saveStatus = useEditorStore((s) => s.saveStatus);
  const wordCount = useEditorStore((s) => s.wordCount);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveFile();
      }

      if (e.metaKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        void openFile();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [openFile, saveFile]);

  const statusText = renderSaveStatus(saveStatus);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 16px",
        borderBottom: "1px solid #ddd",
        background: "#f7f7f7",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          minWidth: 0,
        }}
      >
        <strong style={{ fontSize: 18 }}>Markdown Writer</strong>

        {statusText ? (
          <span style={{ fontSize: 14, color: "#555" }}>{statusText}</span>
        ) : null}

        <span style={{ fontSize: 14, color: "#555" }}>Words: {wordCount}</span>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <button type="button" onClick={() => void openFile()}>
          Open
        </button>
        <button type="button" onClick={() => void saveFile()}>
          Save
        </button>
      </div>
    </div>
  );
}