import { create } from "zustand";

/** 界面配色；按钮文案见 themeLabel */
export type ThemeId = "light" | "dark" | "eye" | "pink" | "paper";

const STORAGE_KEY = "glyph_theme_id_v1";

function readStoredTheme(): ThemeId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (
      raw === "light" ||
      raw === "dark" ||
      raw === "eye" ||
      raw === "pink" ||
      raw === "paper"
    ) {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return "light";
}

export const themeLabel: Record<ThemeId, string> = {
  light: "浅色",
  dark: "深色",
  eye: "护眼",
  pink: "粉色",
  paper: "浅咖",
};

type ThemeState = {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
};

export const useThemeStore = create<ThemeState>((set) => ({
  theme: readStoredTheme(),
  setTheme: (theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
    set({ theme });
  },
}));
