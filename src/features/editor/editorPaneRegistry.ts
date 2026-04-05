import type { MarkdownEditorHandle } from "./markdownEditorHandleTypes";

let primaryHandle: MarkdownEditorHandle | null = null;

export function setMarkdownPaneHandle(handle: MarkdownEditorHandle | null) {
  primaryHandle = handle;
}

export function getMarkdownEditorHandle(): MarkdownEditorHandle | null {
  return primaryHandle;
}
