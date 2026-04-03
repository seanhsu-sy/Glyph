import { create } from "zustand";

export type Tab = {
  id: string;
  filePath: string;
  fileName: string;
  content: string;
  isDirty: boolean;
};

type TabStore = {
  tabs: Tab[];
  activeTabId: string | null;

  openTab: (payload: {
    filePath: string;
    fileName: string;
    content: string;
  }) => void;

  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;

  updateTabContent: (
    tabId: string,
    payload: {
      content: string;
      isDirty: boolean;
      fileName?: string;
      filePath?: string;
    },
  ) => void;

  renameTabByPath: (
    oldPath: string,
    payload: {
      newPath: string;
      newFileName: string;
    },
  ) => void;

  removeTabByPath: (filePath: string) => void;

  clearTabs: () => void;
};

export const useTabStore = create<TabStore>((set, get) => ({
  tabs: [],
  activeTabId: null,

  openTab: ({ filePath, fileName, content }) => {
    const { tabs } = get();

    const existing = tabs.find((t) => t.filePath === filePath);
    if (existing) {
      set({
        activeTabId: existing.id,
        tabs: tabs.map((t) =>
          t.filePath === filePath
            ? {
                ...t,
                fileName,
              }
            : t,
        ),
      });
      return;
    }

    const id = crypto.randomUUID();

    set({
      tabs: [
        ...tabs,
        {
          id,
          filePath,
          fileName,
          content,
          isDirty: false,
        },
      ],
      activeTabId: id,
    });
  },

  closeTab: (tabId) => {
    const { tabs, activeTabId } = get();
    const closingIndex = tabs.findIndex((t) => t.id === tabId);
    const nextTabs = tabs.filter((t) => t.id !== tabId);

    let nextActive = activeTabId;

    if (activeTabId === tabId) {
      const fallback =
        nextTabs[closingIndex] ??
        nextTabs[closingIndex - 1] ??
        null;

      nextActive = fallback ? fallback.id : null;
    }

    set({
      tabs: nextTabs,
      activeTabId: nextActive,
    });
  },

  setActiveTab: (tabId) => {
    set({ activeTabId: tabId });
  },

  updateTabContent: (tabId, payload) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              content: payload.content,
              isDirty: payload.isDirty,
              fileName: payload.fileName ?? tab.fileName,
              filePath: payload.filePath ?? tab.filePath,
            }
          : tab,
      ),
    }));
  },

  renameTabByPath: (oldPath, { newPath, newFileName }) => {
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.filePath === oldPath
          ? {
              ...tab,
              filePath: newPath,
              fileName: newFileName,
            }
          : tab,
      ),
    }));
  },

  removeTabByPath: (filePath) => {
    const { tabs, activeTabId } = get();
    const removing = tabs.find((t) => t.filePath === filePath);
    if (!removing) return;

    const removingIndex = tabs.findIndex((t) => t.filePath === filePath);
    const nextTabs = tabs.filter((t) => t.filePath !== filePath);

    let nextActive = activeTabId;

    if (activeTabId === removing.id) {
      const fallback =
        nextTabs[removingIndex] ??
        nextTabs[removingIndex - 1] ??
        null;
      nextActive = fallback ? fallback.id : null;
    }

    set({
      tabs: nextTabs,
      activeTabId: nextActive,
    });
  },

  clearTabs: () => {
    set({
      tabs: [],
      activeTabId: null,
    });
  },
}));