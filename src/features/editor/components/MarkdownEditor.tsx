import { useEffect, useMemo, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorSelection, StateField } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  keymap,
  highlightActiveLine,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  redo,
  undo,
} from "@codemirror/commands";

import { useEditorStore } from "../../../app/store/editorStore";
import { useEditorActions } from "../hooks/useEditorActions";

type MarkdownCommand = "h1" | "bold" | "italic";

type MarkdownEditorHandle = {
  applyCommand: (type: MarkdownCommand) => void;
  scrollToIndex: (index: number) => void;
  highlightBlockAtIndex: (index: number) => void;
  undo: () => void;
  redo: () => void;
};

let editorHandle: MarkdownEditorHandle | null = null;

export function getMarkdownEditorHandle() {
  return editorHandle;
}

function handleSmartEnter(view: EditorView) {
  const { state } = view;
  const selection = state.selection.main;

  if (!selection.empty) {
    return false;
  }

  const line = state.doc.lineAt(selection.from);
  const lineText = line.text;
  const beforeCursor = lineText.slice(0, selection.from - line.from);

  const listMatch = beforeCursor.match(/^(\s*)-\s+(.*)$/);
  if (listMatch) {
    const indent = listMatch[1] ?? "";
    const content = listMatch[2] ?? "";

    if (content.trim() === "") {
      view.dispatch({
        changes: {
          from: line.from,
          to: line.to,
          insert: indent,
        },
        selection: {
          anchor: line.from + indent.length,
        },
      });
      return true;
    }

    const insert = `\n${indent}- `;
    view.dispatch({
      changes: {
        from: selection.from,
        to: selection.to,
        insert,
      },
      selection: {
        anchor: selection.from + insert.length,
      },
    });
    return true;
  }

  const quoteMatch = beforeCursor.match(/^(\s*)>\s?(.*)$/);
  if (quoteMatch) {
    const indent = quoteMatch[1] ?? "";
    const content = quoteMatch[2] ?? "";

    if (content.trim() === "") {
      view.dispatch({
        changes: {
          from: line.from,
          to: line.to,
          insert: indent,
        },
        selection: {
          anchor: line.from + indent.length,
        },
      });
      return true;
    }

    const insert = `\n${indent}> `;
    view.dispatch({
      changes: {
        from: selection.from,
        to: selection.to,
        insert,
      },
      selection: {
        anchor: selection.from + insert.length,
      },
    });
    return true;
  }

  return false;
}

const tagDecoration = Decoration.mark({
  class: "cm-tag",
});

function buildTagDecorations(state: EditorView["state"]) {
  const ranges: ReturnType<typeof tagDecoration.range>[] = [];
  const regex = /#[\w\u4e00-\u9fa5/]+/g;

  for (let i = 1; i <= state.doc.lines; i += 1) {
    const line = state.doc.line(i);
    regex.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = regex.exec(line.text)) !== null) {
      const start = line.from + match.index;
      const end = start + match[0].length;
      ranges.push(tagDecoration.range(start, end));
    }
  }

  return Decoration.set(ranges, true);
}

const tagField = StateField.define<DecorationSet>({
  create(state) {
    return buildTagDecorations(state);
  },
  update(decorations, tr) {
    if (tr.docChanged) {
      return buildTagDecorations(tr.state);
    }
    return decorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export function MarkdownEditor() {
  const content = useEditorStore((s) => s.content);
  const fontFamily = useEditorStore((s) => s.fontFamily);
  const fontSize = useEditorStore((s) => s.fontSize);

  const { updateContent } = useEditorActions();

  const viewRef = useRef<EditorView | null>(null);

  const editorTheme = useMemo(
    () => `
      .cm-editor {
        height: 100%;
        width: 100%;
        background: var(--bg);
        color: var(--text);
        font-family: ${fontFamily};
        font-size: ${fontSize}px;
      }

      .cm-scroller {
        height: 100%;
        overflow: auto;
        font-family: ${fontFamily};
        font-size: ${fontSize}px;
        line-height: 1.8;
        background: var(--bg);
        color: var(--text);
        box-sizing: border-box;
      }

      .cm-content {
        min-height: 100%;
        box-sizing: border-box;
        font-family: ${fontFamily};
        font-size: ${fontSize}px;
        line-height: 1.8;
        padding: 20px 24px 48px;
        caret-color: var(--text);
        color: var(--text);
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        word-break: break-word;
      }

      .cm-focused {
        outline: none;
      }

      .cm-line {
        padding: 0;
      }

      .cm-activeLine {
        background: rgba(59, 130, 246, 0.08);
      }

      .cm-tag {
        color: var(--accent);
        font-weight: 600;
      }

      .cm-gutters {
        background: var(--bg);
        color: var(--text-sub);
        border-right: 1px solid var(--border);
      }

      .cm-cursor,
      .cm-dropCursor {
        border-left-color: var(--text);
      }

      .cm-selectionBackground,
      .cm-content ::selection {
        background: rgba(59, 130, 246, 0.25);
      }
    `,
    [fontFamily, fontSize],
  );

  useEffect(() => {
    editorHandle = {
      applyCommand: (type: MarkdownCommand) => {
        const view = viewRef.current;
        if (!view) return;

        const { state } = view;
        const selection = state.selection.main;
        const selectedText = state.doc.sliceString(selection.from, selection.to);

        let insert = selectedText;
        let anchor = selection.from;

        if (type === "h1") {
          const line = state.doc.lineAt(selection.from);
          const lineText = line.text;
          const alreadyHeading = /^#\s+/.test(lineText);

          if (selection.empty) {
            if (alreadyHeading) return;

            insert = `# ${lineText}`;
            view.dispatch({
              changes: {
                from: line.from,
                to: line.to,
                insert,
              },
              selection: {
                anchor: line.from + insert.length,
              },
            });
            view.focus();
            return;
          }

          const text = selectedText || "标题";
          insert = `# ${text}`;
          anchor = selection.from + insert.length;
        }

        if (type === "bold") {
          const text = selectedText || "加粗";
          insert = `**${text}**`;
          anchor = selection.from + insert.length;
        }

        if (type === "italic") {
          const text = selectedText || "斜体";
          insert = `*${text}*`;
          anchor = selection.from + insert.length;
        }

        view.dispatch({
          changes: {
            from: selection.from,
            to: selection.to,
            insert,
          },
          selection: EditorSelection.cursor(anchor),
        });

        view.focus();
      },

      scrollToIndex: (index: number) => {
        const view = viewRef.current;
        if (!view) return;

        const safeIndex = Math.max(0, Math.min(index, view.state.doc.length));

        view.dispatch({
          selection: EditorSelection.cursor(safeIndex),
          scrollIntoView: true,
        });

        view.focus();
      },

      highlightBlockAtIndex: (index: number) => {
        const view = viewRef.current;
        if (!view) return;

        const safeIndex = Math.max(0, Math.min(index, view.state.doc.length));

        view.dispatch({
          selection: EditorSelection.cursor(safeIndex),
          scrollIntoView: true,
        });

        view.focus();
      },

      undo: () => {
        const view = viewRef.current;
        if (!view) return;
        undo(view);
        view.focus();
      },

      redo: () => {
        const view = viewRef.current;
        if (!view) return;
        redo(view);
        view.focus();
      },
    };

    return () => {
      editorHandle = null;
    };
  }, []);

  return (
    <div
      style={{
        height: "100%",
        width: "100%",
        minHeight: 0,
        minWidth: 0,
        overflow: "hidden",
        background: "var(--bg)",
      }}
    >
      <CodeMirror
        value={content}
        height="100%"
        extensions={[
          markdown(),
          history(),
          highlightActiveLine(),
          EditorView.lineWrapping,
          keymap.of([
            {
              key: "Enter",
              run: handleSmartEnter,
            },
            ...historyKeymap,
            ...defaultKeymap,
          ]),
          tagField,
        ]}
        onCreateEditor={(view) => {
          viewRef.current = view;
        }}
        onChange={(value) => {
          updateContent(value);
        }}
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
          highlightActiveLineGutter: false,
          searchKeymap: true,
        }}
        theme="light"
        style={{
          height: "100%",
          width: "100%",
        }}
      />

      <style>{editorTheme}</style>
    </div>
  );
}