import { create } from "zustand";

import type { TagItem } from "../../features/editor/hooks/useEditorActions";

function countWords(text: string): number {
  if (!text.trim()) return 0;
  const cjk = text.match(/[\u4E00-\u9FFF\u3400-\u4DBF]/g) ?? [];
  const latin = text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) ?? [];
  return cjk.length + latin.length;
}

type ReferencePaneState = {
  filePath: string | null;
  fileName: string;
  content: string;
  isDirty: boolean;
  wordCount: number;
  tags: TagItem[];
  setFile: (payload: {
    filePath: string | null;
    fileName: string;
    content: string;
  }) => void;
  setContent: (content: string) => void;
  setTags: (tags: TagItem[]) => void;
  markSaved: () => void;
  clear: () => void;
};

export const useReferencePaneStore = create<ReferencePaneState>((set, get) => ({
  filePath: null,
  fileName: "",
  content: "",
  isDirty: false,
  wordCount: 0,
  tags: [],
  setFile: ({ filePath, fileName, content }) =>
    set({
      filePath,
      fileName,
      content,
      isDirty: false,
      wordCount: countWords(content),
      tags: [],
    }),
  setContent: (content: string) => {
    if (content === get().content) {
      set({ wordCount: countWords(content) });
      return;
    }
    set({
      content,
      isDirty: true,
      wordCount: countWords(content),
    });
  },
  setTags: (tags) => set({ tags }),
  markSaved: () => set({ isDirty: false }),
  clear: () =>
    set({
      filePath: null,
      fileName: "",
      content: "",
      isDirty: false,
      wordCount: 0,
      tags: [],
    }),
}));
