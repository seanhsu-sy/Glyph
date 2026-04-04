import { create } from "zustand";

/** 沿用旧 key，避免用户设置丢失 */
const KEY = "glyph_ambience_typewriter_v1";

function readBool(fallback: boolean) {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "1") return true;
    if (v === "0") return false;
  } catch {
    /* ignore */
  }
  return fallback;
}

type TypewriterState = {
  enabled: boolean;
  setEnabled: (on: boolean) => void;
};

export const useTypewriterStore = create<TypewriterState>((set) => ({
  enabled: readBool(false),
  setEnabled: (on) => {
    try {
      localStorage.setItem(KEY, on ? "1" : "0");
    } catch {
      /* ignore */
    }
    set({ enabled: on });
  },
}));
