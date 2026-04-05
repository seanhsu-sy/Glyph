import { create, type StateCreator } from "zustand";

export type SaveStatus = "idle" | "saving" | "saved" | "unsaved";
export type SidePanelMode =
  | "preview"
  | "outline"
  | "references"
  | "search"
  | "stats"
  | "backlinks"
  | "info"
  | null;

function countWords(text: string): number {
  if (!text.trim()) return 0;

  const cjk = text.match(/[\u4E00-\u9FFF\u3400-\u4DBF]/g) ?? [];
  const latin = text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) ?? [];

  return cjk.length + latin.length;
}

type TagItem = {
  tag: string;
  index: number;
};

type EditorStore = {
  filePath: string | null;
  fileName: string;
  content: string;
  isDirty: boolean;
  wordCount: number;
  saveStatus: SaveStatus;
  fontFamily: string;
  fontSize: number;
  history: string[];
  historyIndex: number;

  toolRailOpen: boolean;
  sidePanelOpen: boolean;
  sidePanelMode: SidePanelMode;

  tags: TagItem[];
  activeBlockIndex: number | null;

  /** 当前写作页所属书籍根目录（仅编辑器内有效），用于内存 Untitled 无对话框保存 */
  bookFolderPath: string | null;

  setFile: (payload: {
    filePath: string | null;
    fileName: string;
    content: string;
  }) => void;
  setContent: (content: string) => void;
  setDirty: (dirty: boolean) => void;
  setWordCount: (count: number) => void;
  setSaveStatus: (status: SaveStatus) => void;
  setFontFamily: (font: string) => void;
  setFontSize: (size: number) => void;
  setTags: (tags: TagItem[]) => void;
  setActiveBlockIndex: (index: number | null) => void;
  setBookFolderPath: (path: string | null) => void;

  undo: () => void;
  redo: () => void;

  openToolRail: () => void;
  closeToolRail: () => void;
  toggleToolRail: () => void;

  openSidePanel: (mode: Exclude<SidePanelMode, null>) => void;
  closeSidePanel: () => void;
  toggleSidePanel: (mode: Exclude<SidePanelMode, null>) => void;
};

/** 当前文档编辑区状态 */
const createEditorStoreSlice: StateCreator<EditorStore> = (set, get) => ({
  filePath: null,
  fileName: "Untitled.md",
  content: "",
  isDirty: false,
  wordCount: 0,
  saveStatus: "idle",
  fontFamily: '"Noto Sans SC", system-ui, sans-serif',
  fontSize: 18,
  history: [""],
  historyIndex: 0,

  toolRailOpen: false,
  sidePanelOpen: false,
  sidePanelMode: null,

  tags: [],
  activeBlockIndex: null,

  bookFolderPath: null,

  setFile: ({
    filePath,
    fileName,
    content,
  }: {
    filePath: string | null;
    fileName: string;
    content: string;
  }) =>
    set({
      filePath,
      fileName,
      content,
      isDirty: false,
      wordCount: countWords(content),
      saveStatus: "saved",
      history: [content],
      historyIndex: 0,
      activeBlockIndex: null,
    }),

  setContent: (content: string) =>
    set((state) => {
      // 内容完全没变时，不要重新标脏
      if (content === state.content) {
        return {
          content,
          wordCount: countWords(content),
        };
      }

      const current = state.history[state.historyIndex] ?? state.content;
      const nextWordCount = countWords(content);

      // 如果和当前历史节点相同，就只同步内容和字数，不追加历史
      if (content === current) {
        return {
          content,
          isDirty: true,
          wordCount: nextWordCount,
          saveStatus: "unsaved" as SaveStatus,
        };
      }

      const baseHistory = state.history.slice(0, state.historyIndex + 1);
      const nextHistory = [...baseHistory, content];

      return {
        content,
        isDirty: true,
        wordCount: nextWordCount,
        saveStatus: "unsaved" as SaveStatus,
        history: nextHistory,
        historyIndex: nextHistory.length - 1,
      };
    }),

  setDirty: (dirty: boolean) =>
    set((state) => ({
      isDirty: dirty,
      saveStatus: dirty ? "unsaved" : state.saveStatus,
    })),

  setWordCount: (count: number) => set({ wordCount: count }),
  setSaveStatus: (status: SaveStatus) => set({ saveStatus: status }),
  setFontFamily: (font: string) => set({ fontFamily: font }),
  setFontSize: (size: number) => set({ fontSize: size }),
  setTags: (tags: TagItem[]) => set({ tags }),
  setActiveBlockIndex: (index: number | null) =>
    set({ activeBlockIndex: index }),

  setBookFolderPath: (path: string | null) => set({ bookFolderPath: path }),

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex <= 0) return;

    const nextIndex = historyIndex - 1;
    const nextContent = history[nextIndex] ?? "";

    set({
      historyIndex: nextIndex,
      content: nextContent,
      isDirty: true,
      wordCount: countWords(nextContent),
      saveStatus: "unsaved",
    });
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 1) return;

    const nextIndex = historyIndex + 1;
    const nextContent = history[nextIndex] ?? "";

    set({
      historyIndex: nextIndex,
      content: nextContent,
      isDirty: true,
      wordCount: countWords(nextContent),
      saveStatus: "unsaved",
    });
  },

  openToolRail: () => set({ toolRailOpen: true }),
  closeToolRail: () => set({ toolRailOpen: false }),
  toggleToolRail: () =>
    set((state) => ({
      toolRailOpen: !state.toolRailOpen,
    })),

  openSidePanel: (mode) =>
    set({
      sidePanelOpen: true,
      sidePanelMode: mode,
    }),

  closeSidePanel: () =>
    set({
      sidePanelOpen: false,
      sidePanelMode: null,
    }),

  toggleSidePanel: (mode) =>
    set((state) => {
      if (state.sidePanelOpen && state.sidePanelMode === mode) {
        return {
          sidePanelOpen: false,
          sidePanelMode: null,
        };
      }

      return {
        sidePanelOpen: true,
        sidePanelMode: mode,
      };
    }),
});

export const useEditorStore = create<EditorStore>(createEditorStoreSlice);