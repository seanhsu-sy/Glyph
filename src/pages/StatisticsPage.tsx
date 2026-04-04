import { useEffect, useRef, useState } from "react";

import { ThemeModeButton } from "../components/ThemeModeButton";
import { StatisticsPanel } from "../features/stats/components/StatisticsPanel";
import { listBooks } from "../shared/lib/tauri";
import type { Book } from "../shared/lib/tauri";

type Props = {
  onBack: () => void;
};

const DEFAULT_SUBTITLE = "日历、趋势、目标、按书筛选";
const SUBTITLE_STORAGE_KEY = "statistics-page-subtitle";

export function StatisticsPage({ onBack }: Props) {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);

  const [subtitle, setSubtitle] = useState(DEFAULT_SUBTITLE);
  const [editingSubtitle, setEditingSubtitle] = useState(false);
  const [draftSubtitle, setDraftSubtitle] = useState(DEFAULT_SUBTITLE);
  const subtitleInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadBooks = async () => {
      try {
        setLoading(true);
        const data = await listBooks();
        if (!cancelled) {
          setBooks(data);
        }
      } catch (err) {
        console.error("读取书籍失败", err);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadBooks();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const savedSubtitle = window.localStorage.getItem(SUBTITLE_STORAGE_KEY);
    if (savedSubtitle && savedSubtitle.trim()) {
      setSubtitle(savedSubtitle);
      setDraftSubtitle(savedSubtitle);
    }
  }, []);

  useEffect(() => {
    if (editingSubtitle && subtitleInputRef.current) {
      subtitleInputRef.current.focus();
      subtitleInputRef.current.select();
    }
  }, [editingSubtitle]);

  const startEditingSubtitle = () => {
    setDraftSubtitle(subtitle);
    setEditingSubtitle(true);
  };

  const saveSubtitle = () => {
    const nextValue = draftSubtitle.trim() || DEFAULT_SUBTITLE;
    setSubtitle(nextValue);
    setDraftSubtitle(nextValue);
    window.localStorage.setItem(SUBTITLE_STORAGE_KEY, nextValue);
    setEditingSubtitle(false);
  };

  const cancelSubtitleEdit = () => {
    setDraftSubtitle(subtitle);
    setEditingSubtitle(false);
  };

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        width: "100%",
        background: "var(--bg)",
        color: "var(--text)",
      }}
    >
      <div
        style={{
          maxWidth: 1080,
          margin: "0 auto",
          padding: "24px 24px 40px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 24,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                marginBottom: 6,
              }}
            >
              统计中心
            </div>

            {editingSubtitle ? (
              <input
                ref={subtitleInputRef}
                type="text"
                value={draftSubtitle}
                onChange={(e) => setDraftSubtitle(e.target.value)}
                onBlur={saveSubtitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    saveSubtitle();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    cancelSubtitleEdit();
                  }
                }}
                style={{
                  fontSize: 13,
                  color: "var(--text-sub)",
                  lineHeight: 1.6,
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  background: "var(--card)",
                  padding: "4px 8px",
                  outline: "none",
                  minWidth: 260,
                  width: "min(520px, 100%)",
                }}
              />
            ) : (
              <div
                onClick={startEditingSubtitle}
                title="点击编辑"
                style={{
                  fontSize: 13,
                  color: "var(--text-sub)",
                  lineHeight: 1.6,
                  cursor: "text",
                  display: "inline-block",
                  minHeight: 24,
                  padding: "4px 0",
                  borderRadius: 6,
                }}
              >
                {subtitle}
              </div>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <ThemeModeButton />
            <button
              type="button"
              onClick={onBack}
              style={{
                border: "1px solid var(--btn-border)",
                borderRadius: 9,
                background: "var(--btn-bg)",
                color: "var(--text)",
                padding: "8px 12px",
                cursor: "pointer",
                fontSize: 12,
                lineHeight: 1.2,
              }}
            >
              返回书籍库
            </button>
          </div>
        </div>

        {loading ? (
          <div
            style={{
              padding: 18,
              border: "1px solid var(--border)",
              borderRadius: 14,
              background: "var(--card)",
              color: "var(--text-sub)",
              fontSize: 12,
            }}
          >
            正在读取统计数据…
          </div>
        ) : (
          <StatisticsPanel books={books} />
        )}
      </div>
    </div>
  );
}