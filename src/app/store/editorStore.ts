import { create } from "zustand";

export type SaveStatus = "idle" | "saving" | "saved" | "unsaved";

function countWords(text: string): number {
  if (!text.trim()) return 0;

  const cjk = text.match(/[\u4E00-\u9FFF\u3400-\u4DBF]/g) ?? [];
  const latin = text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) ?? [];

  return cjk.length + latin.length;
}

type EditorStore = {
  filePath: string | null;
  fileName: string;
  content: string;
  isDirty: boolean;
  wordCount: number;
  saveStatus: SaveStatus;
  setFile: (payload: {
    filePath: string | null;
    fileName: string;
    content: string;
  }) => void;
  setContent: (content: string) => void;
  setDirty: (dirty: boolean) => void;
  setWordCount: (count: number) => void;
  setSaveStatus: (status: SaveStatus) => void;
};

export const useEditorStore = create<EditorStore>((set) => ({
  filePath: null,
  fileName: "Untitled.md",
  content: "",
  isDirty: false,
  wordCount: 0,
  saveStatus: "idle",

  setFile: ({ filePath, fileName, content }) =>
    set({
      filePath,
      fileName,
      content,
      isDirty: false,
      wordCount: countWords(content),
      saveStatus: "saved",
    }),

  setContent: (content) =>
    set({
      content,
      isDirty: true,
      wordCount: countWords(content),
    }),

  setDirty: (dirty) => set({ isDirty: dirty }),
  setWordCount: (count) => set({ wordCount: count }),
  setSaveStatus: (status) => set({ saveStatus: status }),
}));