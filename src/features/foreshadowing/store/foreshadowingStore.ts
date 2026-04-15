import { create } from "zustand";

import type { ForeshadowDocKind, ForeshadowRecord } from "../types";
import {
  loadForeshadowingFile,
  migrateDocPath,
  removeRecordsForDocPath,
  saveForeshadowingFile,
} from "../services/foreshadowingPersistence";
import { reconcileRecordPositions } from "../services/foreshadowingResolve";

type ForeshadowingState = {
  bookFolderPath: string | null;
  records: ForeshadowRecord[];
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;

  loadBook: (folderPath: string) => Promise<void>;
  setRecords: (next: ForeshadowRecord[]) => void;
  persist: () => Promise<void>;

  addRecord: (input: {
    tag: string;
    docPath: string;
    docName: string;
    docKind: ForeshadowDocKind;
    from: number;
    to: number;
    excerpt: string;
  }) => Promise<void>;

  /** 虚拟 Untitled 保存为真实路径后迁移 */
  migrateUntitledPath: (fromPath: string, toPath: string, newDocName: string) => Promise<void>;

  removeRecordsForDeletedDoc: (docPath: string) => Promise<void>;

  renameDocPath: (
    oldPath: string,
    newPath: string,
    newDocName: string,
  ) => Promise<void>;

  /** 当前文档内容变化后，对属于该路径的记录写回校准后的位置（debounce 由调用方控制） */
  reconcileDoc: (docPath: string, content: string) => Promise<void>;
};

export const useForeshadowingStore = create<ForeshadowingState>((set, get) => ({
  bookFolderPath: null,
  records: [],
  status: "idle",
  error: null,

  loadBook: async (folderPath: string) => {
    set({ status: "loading", error: null, bookFolderPath: folderPath });
    try {
      const records = await loadForeshadowingFile(folderPath);
      set({ records, status: "ready" });
    } catch (e) {
      set({
        status: "error",
        error: String(e),
        records: [],
      });
    }
  },

  setRecords: (next: ForeshadowRecord[]) => set({ records: next }),

  persist: async () => {
    const { bookFolderPath, records } = get();
    if (!bookFolderPath) return;
    await saveForeshadowingFile(bookFolderPath, records);
  },

  addRecord: async (input) => {
    const tag = input.tag.trim();
    if (!tag) return;

    const { bookFolderPath, records } = get();
    if (!bookFolderPath) return;

    const rec: ForeshadowRecord = {
      id: crypto.randomUUID(),
      tag,
      docPath: input.docPath,
      docName: input.docName,
      docKind: input.docKind,
      from: input.from,
      to: input.to,
      excerpt: input.excerpt,
      createdAt: new Date().toISOString(),
      positionUncertain: false,
    };

    const next = [...records, rec];
    set({ records: next });
    await saveForeshadowingFile(bookFolderPath, next);
  },

  migrateUntitledPath: async (fromPath, toPath, newDocName) => {
    const { bookFolderPath, records } = get();
    if (!bookFolderPath) return;
    const next = migrateDocPath(records, fromPath, toPath, newDocName);
    set({ records: next });
    await saveForeshadowingFile(bookFolderPath, next);
  },

  removeRecordsForDeletedDoc: async (docPath: string) => {
    const { bookFolderPath, records } = get();
    if (!bookFolderPath) return;
    const next = removeRecordsForDocPath(records, docPath);
    if (next.length === records.length) return;
    set({ records: next });
    await saveForeshadowingFile(bookFolderPath, next);
  },

  renameDocPath: async (oldPath, newPath, newDocName) => {
    const { bookFolderPath, records } = get();
    if (!bookFolderPath) return;
    const next = migrateDocPath(records, oldPath, newPath, newDocName);
    set({ records: next });
    await saveForeshadowingFile(bookFolderPath, next);
  },

  reconcileDoc: async (docPath: string, content: string) => {
    const { bookFolderPath, records } = get();
    if (!bookFolderPath) return;

    let changed = false;
    const next = records.map((r) => {
      if (r.docPath !== docPath) return r;
      const patched = reconcileRecordPositions(content, r);
      if (
        patched.from !== r.from ||
        patched.to !== r.to ||
        patched.positionUncertain !== r.positionUncertain
      ) {
        changed = true;
        return patched;
      }
      return r;
    });

    if (changed) {
      set({ records: next });
      await saveForeshadowingFile(bookFolderPath, next);
    }
  },
}));
