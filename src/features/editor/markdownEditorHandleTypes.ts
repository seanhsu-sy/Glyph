export type MarkdownCommand = "h1" | "bold" | "italic";

export type MarkdownEditorHandle = {
  applyCommand: (type: MarkdownCommand) => void;
  scrollToIndex: (index: number) => void;
  highlightBlockAtIndex: (index: number) => void;
  getSelection: () => { from: number; to: number; text: string } | null;
  undo: () => void;
  redo: () => void;
};
