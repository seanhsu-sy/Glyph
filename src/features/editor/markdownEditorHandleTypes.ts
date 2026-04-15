export type MarkdownCommand = "h1" | "bold" | "italic";

export type MarkdownEditorHandle = {
  applyCommand: (type: MarkdownCommand) => void;
  scrollToIndex: (index: number) => void;
  highlightBlockAtIndex: (index: number) => void;
  /** 选中并滚动到可见区域（用于伏笔等跳转） */
  selectRange: (from: number, to: number) => void;
  getSelection: () => { from: number; to: number; text: string } | null;
  undo: () => void;
  redo: () => void;
};
