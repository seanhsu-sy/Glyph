import { useEffect, useMemo, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorSelection, Facet, StateField } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  keymap,
  highlightActiveLine,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  redo,
  undo,
} from "@codemirror/commands";

import { useTypewriterStore } from "../../../app/store/typewriterStore";
import { useThemeStore } from "../../../app/store/themeStore";
import { useEditorStore } from "../../../app/store/editorStore";
import { playTypewriterClick } from "../../typewriter/webAudio";
import type { AssocAnchor } from "../../../shared/lib/associations";
import { useEditorActions } from "../hooks/useEditorActions";

type MarkdownCommand = "h1" | "bold" | "italic";

export type MarkdownEditorHandle = {
  applyCommand: (type: MarkdownCommand) => void;
  scrollToIndex: (index: number) => void;
  highlightBlockAtIndex: (index: number) => void;
  getSelection: () => { from: number; to: number; text: string } | null;
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

const associationFacet = Facet.define<AssocAnchor[], AssocAnchor[]>({
  combine: (values) => values[values.length - 1] ?? [],
});

const associationMark = Decoration.mark({
  class: "cm-association",
});

function buildAssociationDecorations(
  state: EditorView["state"],
  anchors: AssocAnchor[],
) {
  const len = state.doc.length;
  const ranges: ReturnType<typeof associationMark.range>[] = [];
  for (const a of anchors) {
    const from = Math.max(0, Math.min(a.from, len));
    const to = Math.max(from, Math.min(a.to, len));
    if (to > from) {
      ranges.push(associationMark.range(from, to));
    }
  }
  return Decoration.set(ranges, true);
}

const selectionCountPlugin = ViewPlugin.fromClass(
  class {
    dom = document.createElement("div");
    private view!: EditorView;
    private raf = 0;
    private readonly onScroll = () => this.schedule();
    private readonly onMouseUp = () => this.schedule();

    constructor(view: EditorView) {
      this.view = view;
      this.dom.className = "cm-selection-count-tooltip";
      this.dom.style.display = "none";
      this.dom.style.position = "fixed";
      this.dom.style.zIndex = "2147483647";
      this.dom.style.pointerEvents = "none";
      document.body.appendChild(this.dom);
      view.scrollDOM.addEventListener("scroll", this.onScroll, { passive: true });
      view.dom.addEventListener("mouseup", this.onMouseUp);
      this.schedule();
    }

    schedule() {
      cancelAnimationFrame(this.raf);
      this.raf = requestAnimationFrame(() => {
        this.view.requestMeasure();
        requestAnimationFrame(() => this.updateDOM());
      });
    }

    update(update: ViewUpdate) {
      if (!update.selectionSet && !update.docChanged && !update.viewportChanged) {
        return;
      }
      this.schedule();
    }

    updateDOM() {
      const view = this.view;
      const sel = view.state.selection.main;
      if (sel.empty) {
        this.dom.style.display = "none";
        return;
      }
      const text = view.state.doc.sliceString(sel.from, sel.to);
      const n = text.length;
      this.dom.textContent = `${n} 字`;

      const coords =
        view.coordsAtPos(sel.to, 1) ??
        view.coordsAtPos(sel.head, 1) ??
        view.coordsAtPos(sel.from, -1);

      if (!coords) {
        this.dom.style.display = "none";
        return;
      }

      this.dom.style.display = "block";
      this.dom.style.left = `${coords.left}px`;
      this.dom.style.top = `${coords.top - 28}px`;
    }

    destroy() {
      cancelAnimationFrame(this.raf);
      this.view.scrollDOM.removeEventListener("scroll", this.onScroll);
      this.view.dom.removeEventListener("mouseup", this.onMouseUp);
      this.dom.remove();
    }
  },
);

const associationField = StateField.define<DecorationSet>({
  create(state) {
    return buildAssociationDecorations(state, state.facet(associationFacet));
  },
  update(_decorations, tr) {
    return buildAssociationDecorations(
      tr.state,
      tr.state.facet(associationFacet),
    );
  },
  provide: (field) => EditorView.decorations.from(field),
});

type MarkdownEditorProps = {
  associationAnchors?: AssocAnchor[];
};

export function MarkdownEditor({
  associationAnchors = [],
}: MarkdownEditorProps) {
  const content = useEditorStore((s) => s.content);
  const fontFamily = useEditorStore((s) => s.fontFamily);
  const fontSize = useEditorStore((s) => s.fontSize);
  const themeId = useThemeStore((s) => s.theme);
  const typewriterEnabled = useTypewriterStore((s) => s.enabled);

  const { updateContent } = useEditorActions();

  const cmTheme = themeId === "dark" ? "dark" : "light";

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
        background: var(--cm-active-line);
      }

      .cm-tag {
        color: var(--accent);
        font-weight: 600;
      }

      .cm-association {
        background: var(--cm-annotate-bg);
        border-bottom: 1px solid var(--cm-annotate-border);
      }

      .cm-association ::selection {
        background: var(--cm-annotate-selection);
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

      .cm-selectionBackground {
        background: var(--selection-bg) !important;
      }

      .cm-content ::selection {
        background: var(--selection-bg);
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

      getSelection: () => {
        const view = viewRef.current;
        if (!view) return null;
        const sel = view.state.selection.main;
        return {
          from: sel.from,
          to: sel.to,
          text: view.state.doc.sliceString(sel.from, sel.to),
        };
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

  const extensions = useMemo(
    () => [
      markdown(),
      history(),
      highlightActiveLine(),
      EditorView.lineWrapping,
      associationFacet.of(associationAnchors),
      associationField,
      keymap.of([
        {
          key: "Enter",
          run: handleSmartEnter,
        },
        ...historyKeymap,
        ...defaultKeymap,
      ]),
      tagField,
      selectionCountPlugin,
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        const userType = update.transactions.some((tr) =>
          tr.isUserEvent("input.type"),
        );
        if (!userType) return;
        if (!useTypewriterStore.getState().enabled) return;
        playTypewriterClick(0.22);
      }),
    ],
    [associationAnchors, typewriterEnabled],
  );

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
        extensions={extensions}
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
        theme={cmTheme}
        style={{
          height: "100%",
          width: "100%",
        }}
      />

      <style>{editorTheme}</style>
    </div>
  );
}