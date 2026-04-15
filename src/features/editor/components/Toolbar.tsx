import { useEffect } from "react";

import { useEditorStore } from "../../../app/store/editorStore";
import { getMarkdownEditorHandle } from "./MarkdownEditor";
import { useFileActions } from "../../files/hooks/useFileActions";

type ToolbarMode = "global" | "editor";

type ToolbarProps = {
  mode: ToolbarMode;
  /** 选区批注（仅 editor 模式） */
  onAnnotateSelection?: () => void;
  /** 新建便签（仅 editor 模式） */
  onAddSticky?: () => void;
  /** 选区添加伏笔 tag（仅 editor 模式） */
  onAddForeshadow?: () => void;
};

function getSaveStatusText(status: string, isDirty: boolean) {
  if (status === "saving") return "saving...";
  if (status === "saved" && !isDirty) return "saved";
  if (status === "unsaved" || isDirty) return "unsaved";
  return "idle";
}

const buttonStyle: React.CSSProperties = {
  border: "1px solid var(--btn-border)",
  background: "var(--btn-bg)",
  color: "var(--text)",
  borderRadius: 8,
  cursor: "pointer",
  padding: "6px 10px",
  fontSize: 11,
  lineHeight: 1.2,
};

const smallButtonStyle: React.CSSProperties = {
  border: "1px solid var(--btn-border)",
  background: "var(--btn-bg)",
  color: "var(--text)",
  borderRadius: 8,
  cursor: "pointer",
  padding: "5px 8px",
  fontSize: 11,
  lineHeight: 1.2,
};

export function Toolbar({
  mode,
  onAnnotateSelection,
  onAddSticky,
  onAddForeshadow,
}: ToolbarProps) {
  const { openFile, saveFile, saveFileAs } = useFileActions();

  const fileName = useEditorStore((s) => s.fileName);
  const isDirty = useEditorStore((s) => s.isDirty);
  const saveStatus = useEditorStore((s) => s.saveStatus);

  const fontFamily = useEditorStore((s) => s.fontFamily);
  const setFontFamily = useEditorStore((s) => s.setFontFamily);
  const fontSize = useEditorStore((s) => s.fontSize);
  const setFontSize = useEditorStore((s) => s.setFontSize);

  const toolRailOpen = useEditorStore((s) => s.toolRailOpen);
  const sidePanelOpen = useEditorStore((s) => s.sidePanelOpen);
  const toggleToolRail = useEditorStore((s) => s.toggleToolRail);
  const closeSidePanel = useEditorStore((s) => s.closeSidePanel);

  useEffect(() => {
    if (mode !== "global") return;

    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveFile();
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "o") {
        e.preventDefault();
        void openFile();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, openFile, saveFile]);

  if (mode === "editor") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderBottom: "1px solid var(--border)",
          background: "var(--toolbar-bg)",
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={() => getMarkdownEditorHandle()?.undo()}
          style={smallButtonStyle}
        >
          ↶
        </button>

        <button
          type="button"
          onClick={() => getMarkdownEditorHandle()?.redo()}
          style={smallButtonStyle}
        >
          ↷
        </button>

        <button
          type="button"
          onClick={() => getMarkdownEditorHandle()?.applyCommand("h1")}
          style={smallButtonStyle}
        >
          H1
        </button>

        <button
          type="button"
          onClick={() => getMarkdownEditorHandle()?.applyCommand("bold")}
          style={smallButtonStyle}
        >
          B
        </button>

        <button
          type="button"
          onClick={() => getMarkdownEditorHandle()?.applyCommand("italic")}
          style={smallButtonStyle}
        >
          I
        </button>

        <select
          value={fontFamily}
          onChange={(e) => setFontFamily(e.currentTarget.value)}
          style={{
            ...smallButtonStyle,
            padding: "5px 8px",
          }}
        >
          <option value='"Noto Sans SC", system-ui, sans-serif'>思源黑体</option>
          <option value='"Noto Serif SC", serif'>思源宋体</option>
          <option value='"LXGW WenKai", serif'>霞鹜文楷</option>
          <option value='"Inter", system-ui, sans-serif'>Inter</option>
          <option value='"JetBrains Mono", monospace'>JetBrains Mono</option>
        </select>

        <button
          type="button"
          onClick={() => setFontSize(Math.max(12, fontSize - 1))}
          style={smallButtonStyle}
        >
          A-
        </button>

        <button
          type="button"
          onClick={() => setFontSize(Math.min(32, fontSize + 1))}
          style={smallButtonStyle}
        >
          A+
        </button>

        {onAnnotateSelection ? (
          <button
            type="button"
            onClick={onAnnotateSelection}
            style={smallButtonStyle}
            title="先选中一段文字，再点此添加批注（正文内高亮）"
          >
            批注
          </button>
        ) : null}

        {onAddSticky ? (
          <button
            type="button"
            onClick={onAddSticky}
            style={smallButtonStyle}
            title="在右下角添加半透明便签，可勾选「跨书」在跨书关联页查看"
          >
            便签
          </button>
        ) : null}

        {onAddForeshadow ? (
          <button
            type="button"
            onClick={onAddForeshadow}
            style={smallButtonStyle}
            title="选中一段文字后点此，输入伏笔标签（侧栏「伏笔」可统计）"
          >
            伏笔
          </button>
        ) : null}
      </div>
    );
  }

  const toolActive = toolRailOpen || sidePanelOpen;

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "8px 12px",
        borderBottom: "1px solid var(--border)",
        background: "var(--toolbar-bg)",
        gap: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          minWidth: 0,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: "0.01em",
          }}
        >
          Glyph
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            gap: 1,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--text)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: 220,
            }}
            title={fileName}
          >
            {fileName}
            {isDirty ? " *" : ""}
          </div>

          <div
            style={{
              fontSize: 10,
              color: "var(--text-sub)",
            }}
          >
            {getSaveStatusText(saveStatus, isDirty)}
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexWrap: "wrap",
          justifyContent: "flex-end",
        }}
      >
        <button type="button" onClick={() => void openFile()} style={buttonStyle}>
          打开
        </button>

        <button type="button" onClick={() => void saveFile()} style={buttonStyle}>
          保存
        </button>

        <button
          type="button"
          onClick={() => void saveFileAs()}
          style={buttonStyle}
        >
          另存为
        </button>

        <button
          type="button"
          onClick={() => {
            if (sidePanelOpen) {
              closeSidePanel();
            }
            toggleToolRail();
          }}
          style={{
            ...buttonStyle,
            background: toolActive ? "rgba(59,130,246,0.12)" : "var(--btn-bg)",
          }}
        >
          工具
        </button>
      </div>
    </div>
  );
}