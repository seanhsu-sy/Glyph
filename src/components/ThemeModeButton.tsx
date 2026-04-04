import { useEffect, useRef, useState } from "react";

import {
  themeLabel,
  type ThemeId,
  useThemeStore,
} from "../app/store/themeStore";

const btnStyle: React.CSSProperties = {
  border: "1px solid var(--btn-border)",
  borderRadius: 9,
  background: "var(--btn-bg)",
  color: "var(--text)",
  padding: "8px 12px",
  cursor: "pointer",
  fontSize: 12,
  lineHeight: 1.2,
  minWidth: 72,
};

const menuStyle: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  right: 0,
  marginTop: 6,
  minWidth: 120,
  padding: 6,
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--card)",
  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
  zIndex: 50,
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const themes: ThemeId[] = ["light", "dark", "eye", "pink", "paper"];

export function ThemeModeButton() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={btnStyle}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {themeLabel[theme]}
      </button>
      {open ? (
        <div style={menuStyle} role="listbox">
          {themes.map((id) => (
            <button
              key={id}
              type="button"
              role="option"
              aria-selected={theme === id}
              onClick={() => {
                setTheme(id);
                setOpen(false);
              }}
              style={{
                border: "none",
                borderRadius: 8,
                background:
                  theme === id ? "var(--accent-soft)" : "transparent",
                color: "var(--text)",
                padding: "8px 10px",
                cursor: "pointer",
                fontSize: 12,
                textAlign: "left",
              }}
            >
              {themeLabel[id]}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
