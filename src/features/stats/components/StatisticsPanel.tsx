import { useEffect, useMemo, useState } from "react";
import {
  getDailyStats,
  getMonthlyStats,
  getStatsOverview,
  getWeeklyStats,
  getWritingLogsByDate,
  type WritingLog,
} from "../../../shared/lib/stats";
import type { Book } from "../../../shared/lib/tauri";

type StatisticsPanelProps = {
  books: Book[];
};

type PeriodMode = "week" | "month";

type DailyStat = {
  date: string;
  totalWords: number;
  totalDurationMs: number;
  sessions: number;
};

type PeriodStat = {
  label: string;
  totalWords: number;
  totalDurationMs: number;
  sessions: number;
  activeDays: number;
};

type StatsOverview = {
  totalWords: number;
  totalDurationMs: number;
  totalSessions: number;
  totalWritingDays: number;
  currentStreakDays: number;
  longestStreakDays: number;
  averageWordsPerDay: number;
};

type CalendarCell = {
  date: string;
  totalWords: number;
  totalDurationMs: number;
  sessions: number;
};

type DetailDocItem = {
  docPath: string;
  docName: string;
  totalWords: number;
  totalDurationMs: number;
  sessions: number;
};

function formatMinutes(ms: number) {
  return Math.round(ms / 60000);
}

function formatHours(ms: number) {
  return (ms / 3600000).toFixed(1);
}

function formatSpeed(words: number, durationMs: number) {
  if (!durationMs || durationMs <= 0) return 0;
  return Math.round((words / durationMs) * 1000 * 60 * 60);
}

function getIntensity(words: number) {
  if (words >= 2000) return "level-4";
  if (words >= 1200) return "level-3";
  if (words >= 500) return "level-2";
  if (words > 0) return "level-1";
  return "level-0";
}

function getTargetStorageKey(scope: string) {
  return `writing_target_${scope}`;
}

function formatLocalDateKey(date: Date) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getTodayLocalDateString() {
  return formatLocalDateKey(new Date());
}

function buildDailyRangeMap(stats: DailyStat[]) {
  const map = new Map<string, DailyStat>();
  for (const item of stats) {
    map.set(item.date, item);
  }
  return map;
}

function buildLastNDays(stats: DailyStat[], days: number) {
  const map = buildDailyRangeMap(stats);
  const result: DailyStat[] = [];
  const today = new Date();

  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const key = formatLocalDateKey(date);

    result.push(
      map.get(key) ?? {
        date: key,
        totalWords: 0,
        totalDurationMs: 0,
        sessions: 0,
      },
    );
  }

  return result;
}

function startOfWeekMonday(date: Date) {
  const copy = new Date(date);
  const day = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - day);
  copy.setHours(12, 0, 0, 0);
  return copy;
}


function buildTwelveMonthCalendar(stats: DailyStat[]) {
  const map = buildDailyRangeMap(stats);
  const today = new Date();

  // 让今天大致在中间：
  // 左边 26 周，右边 25 周，总共 52 周
  const todayWeekStart = startOfWeekMonday(today);

  const firstWeekStart = new Date(todayWeekStart);
  firstWeekStart.setDate(todayWeekStart.getDate() - 26 * 7);

  const columns: CalendarCell[][] = [];
  const monthLabels: string[] = [];

  let cursor = new Date(firstWeekStart);

  for (let weekIndex = 0; weekIndex < 52; weekIndex += 1) {
    const monthAnchor = new Date(cursor);
    const monthLabel =
      monthAnchor.getDate() <= 7
        ? monthAnchor.toLocaleString("en-US", { month: "short" })
        : "";

    monthLabels.push(monthLabel);

    const column: CalendarCell[] = [];

    for (let row = 0; row < 7; row += 1) {
      const cellDate = new Date(cursor);
      cellDate.setDate(cursor.getDate() + row);
      const key = formatLocalDateKey(cellDate);

      const item =
        map.get(key) ?? {
          date: key,
          totalWords: 0,
          totalDurationMs: 0,
          sessions: 0,
        };

      column.push(item);
    }

    columns.push(column);

    cursor = new Date(cursor);
    cursor.setDate(cursor.getDate() + 7);
  }

  let lastShownMonth = "";
  const dedupedLabels = monthLabels.map((label) => {
    if (!label) return "";
    if (label === lastShownMonth) return "";
    lastShownMonth = label;
    return label;
  });

  return {
    columns,
    monthLabels: dedupedLabels,
  };
}

function getDocNameFromPath(docPath: string) {
  const normalized = docPath.replace(/\\/g, "/");
  const raw = normalized.split("/").pop() ?? docPath;
  return raw.replace(/\.md$/i, "");
}

function groupLogsByDoc(logs: WritingLog[]): DetailDocItem[] {
  const map = new Map<string, DetailDocItem>();

  for (const log of logs) {
    const prev = map.get(log.docPath);
    if (prev) {
      prev.totalWords += log.wordDelta;
      prev.totalDurationMs += log.durationMs;
      prev.sessions += 1;
    } else {
      map.set(log.docPath, {
        docPath: log.docPath,
        docName: getDocNameFromPath(log.docPath),
        totalWords: log.wordDelta,
        totalDurationMs: log.durationMs,
        sessions: 1,
      });
    }
  }

  return [...map.values()].sort((a, b) => {
    if (b.totalWords !== a.totalWords) return b.totalWords - a.totalWords;
    return a.docName.localeCompare(b.docName, "zh-Hans-CN");
  });
}

export function StatisticsPanel({ books }: StatisticsPanelProps) {
  const [selectedBookId, setSelectedBookId] = useState<string>("all");

  const [overview, setOverview] = useState<StatsOverview | null>(null);
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [weeklyStats, setWeeklyStats] = useState<PeriodStat[]>([]);
  const [monthlyStats, setMonthlyStats] = useState<PeriodStat[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [periodMode, setPeriodMode] = useState<PeriodMode>("week");
  const [dailyTarget, setDailyTarget] = useState(2000);
  const [targetInput, setTargetInput] = useState("2000");

  const [selectedDate, setSelectedDate] = useState<string>(getTodayLocalDateString());

  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [hoveredLogs, setHoveredLogs] = useState<WritingLog[]>([]);
  const [hoverLoading, setHoverLoading] = useState(false);
  const [hoverTooltip, setHoverTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
  }>({
    visible: false,
    x: 0,
    y: 0,
  });

  const scopeKey = selectedBookId === "all" ? "all" : selectedBookId;

  useEffect(() => {
    const saved = localStorage.getItem(getTargetStorageKey(scopeKey));
    const parsed = saved ? Number(saved) : NaN;
    const nextTarget = Number.isFinite(parsed) && parsed > 0 ? parsed : 2000;

    setDailyTarget(nextTarget);
    setTargetInput(String(nextTarget));
  }, [scopeKey]);

  useEffect(() => {
    let cancelled = false;

    const loadAll = async () => {
      try {
        setLoading(true);
        setError(null);

        const bookId = selectedBookId === "all" ? undefined : selectedBookId;

        const [overviewData, dailyData, weeklyData, monthlyData] = await Promise.all([
          getStatsOverview(bookId),
          getDailyStats(bookId),
          getWeeklyStats(bookId),
          getMonthlyStats(bookId),
        ]);

        if (cancelled) return;

        setOverview(overviewData);
        setDailyStats(dailyData);
        setWeeklyStats(weeklyData);
        setMonthlyStats(monthlyData);
      } catch (err) {
        if (!cancelled) {
          setError(String(err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadAll();

    return () => {
      cancelled = true;
    };
  }, [selectedBookId]);

  const currentPeriodStats = useMemo(
    () => (periodMode === "week" ? weeklyStats : monthlyStats),
    [periodMode, weeklyStats, monthlyStats],
  );

  const recentPeriodStats = useMemo(
    () => currentPeriodStats.slice(-8).reverse(),
    [currentPeriodStats],
  );

  const trendStats = useMemo(() => buildLastNDays(dailyStats, 14), [dailyStats]);
  const calendarSourceStats = useMemo(() => buildLastNDays(dailyStats, 365), [dailyStats]);
  const calendarData = useMemo(() => buildTwelveMonthCalendar(dailyStats), [dailyStats]);

  const todayKey = getTodayLocalDateString();
  const todayStat = dailyStats.find((item) => item.date === todayKey) ?? null;

  const todayWords = todayStat?.totalWords ?? 0;
  const todayDurationMs = todayStat?.totalDurationMs ?? 0;

  const progressPercent =
    dailyTarget > 0 ? Math.min(100, Math.round((todayWords / dailyTarget) * 100)) : 0;
  const remainingWords = Math.max(0, dailyTarget - todayWords);

  const applyTarget = () => {
    const parsed = Number(targetInput.trim());

    if (!Number.isFinite(parsed) || parsed <= 0) {
      setTargetInput(String(dailyTarget));
      return;
    }

    const nextTarget = Math.round(parsed);
    setDailyTarget(nextTarget);
    setTargetInput(String(nextTarget));
    localStorage.setItem(getTargetStorageKey(scopeKey), String(nextTarget));
  };

  const maxTrendWords = Math.max(...trendStats.map((item) => item.totalWords), 1);
  const activeCalendarDays = calendarSourceStats.filter((item) => item.totalWords > 0);
  const bestDay =
    activeCalendarDays.length > 0
      ? activeCalendarDays.reduce((best, current) =>
          current.totalWords > best.totalWords ? current : best,
        )
      : null;

  const totalActiveWords = activeCalendarDays.reduce((sum, item) => sum + item.totalWords, 0);
  const totalActiveDuration = activeCalendarDays.reduce(
    (sum, item) => sum + item.totalDurationMs,
    0,
  );
  const averageWords =
    activeCalendarDays.length > 0
      ? Math.round(totalActiveWords / activeCalendarDays.length)
      : 0;
  const averageMinutes =
    activeCalendarDays.length > 0
      ? Math.round(totalActiveDuration / activeCalendarDays.length / 60000)
      : 0;

  const selectedSummary =
    dailyStats.find((item) => item.date === selectedDate) ?? {
      date: selectedDate,
      totalWords: 0,
      totalDurationMs: 0,
      sessions: 0,
    };

  const hoveredDocItems = useMemo(() => groupLogsByDoc(hoveredLogs), [hoveredLogs]);

  const handleDayMouseEnter = async (
    e: React.MouseEvent<HTMLDivElement>,
    date: string,
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();

    setHoverTooltip({
      visible: true,
      x: rect.right + 12,
      y: rect.top - 4,
    });
    setHoveredDate(date);
    setHoverLoading(true);

    try {
      const logs = await getWritingLogsByDate(
        date,
        selectedBookId === "all" ? undefined : selectedBookId,
      );
      setHoveredLogs(logs);
    } catch (err) {
      console.error("读取悬浮明细失败", err);
      setHoveredLogs([]);
    } finally {
      setHoverLoading(false);
    }
  };

  const handleDayMouseLeave = () => {
    setHoverTooltip((prev) => ({
      ...prev,
      visible: false,
    }));
    setHoveredDate(null);
    setHoveredLogs([]);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        minHeight: "100%",
      }}
    >
      <style>
        {`
          .stats-card {
            border: 1px solid var(--border);
            border-radius: 14px;
            background: var(--card);
            padding: 14px;
          }

          .stats-card-title {
            font-size: 11px;
            color: var(--text-sub);
            margin-bottom: 10px;
            letter-spacing: 0.02em;
          }

          .stats-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
          }

          .stats-metric {
            border: 1px solid var(--border);
            border-radius: 12px;
            background: var(--btn-bg);
            padding: 10px;
          }

          .stats-metric-label {
            font-size: 10px;
            color: var(--text-sub);
            margin-bottom: 6px;
          }

          .stats-metric-value {
            font-size: 18px;
            line-height: 1.1;
            font-weight: 700;
            color: var(--text);
          }

          .stats-metric-sub {
            margin-top: 4px;
            font-size: 10px;
            color: var(--text-sub);
          }

          .stats-day {
            width: 16px;
            height: 16px;
            border: 1px solid rgba(148,163,184,0.22);
            transition: transform 0.1s ease, box-shadow 0.1s ease, border-color 0.1s ease, background 0.1s ease;
            cursor: pointer;
            box-sizing: border-box;
          }

          .stats-day:hover {
            transform: scale(1.08);
          }

          .stats-day.level-0 {
            background: rgba(148, 163, 184, 0.10);
          }

          .stats-day.level-1 {
            background: rgba(96, 165, 250, 0.34);
          }

          .stats-day.level-2 {
            background: rgba(96, 165, 250, 0.52);
          }

          .stats-day.level-3 {
            background: rgba(96, 165, 250, 0.72);
          }

          .stats-day.level-4 {
            background: rgba(96, 165, 250, 0.95);
          }

          .stats-day.today {
            border-color: rgba(59,130,246,0.95);
            box-shadow: 0 0 0 1px rgba(59,130,246,0.24);
          }

          .stats-day.selected {
            outline: 2px solid rgba(59,130,246,0.95);
            outline-offset: 1px;
          }

          .stats-segment-switch {
            display: inline-flex;
            gap: 4px;
            padding: 4px;
            border: 1px solid var(--border);
            border-radius: 10px;
            background: var(--btn-bg);
          }

          .stats-segment-btn {
            border: none;
            border-radius: 8px;
            padding: 6px 10px;
            cursor: pointer;
            font-size: 11px;
            color: var(--text);
            background: transparent;
          }

          .stats-segment-btn.active {
            background: rgba(59,130,246,0.12);
            box-shadow: inset 0 0 0 1px rgba(59,130,246,0.18);
          }

          .stats-period-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          .stats-period-row {
            display: grid;
            grid-template-columns: 92px 1fr auto;
            gap: 10px;
            align-items: center;
          }

          .stats-period-label {
            font-size: 11px;
            color: var(--text-sub);
            white-space: nowrap;
          }

          .stats-period-bar-wrap {
            width: 100%;
            height: 10px;
            border-radius: 999px;
            background: rgba(148,163,184,0.14);
            overflow: hidden;
          }

          .stats-period-bar {
            height: 100%;
            border-radius: 999px;
            background: rgba(59,130,246,0.72);
          }

          .stats-period-value {
            font-size: 11px;
            color: var(--text);
            white-space: nowrap;
            font-variant-numeric: tabular-nums;
          }
        `}
      </style>

      <section className="stats-card">
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div className="stats-card-title" style={{ marginBottom: 6 }}>
              筛选
            </div>
            <select
              value={selectedBookId}
              onChange={(e) => setSelectedBookId(e.currentTarget.value)}
              style={{
                minWidth: 220,
                boxSizing: "border-box",
                padding: "8px 10px",
                border: "1px solid var(--btn-border)",
                borderRadius: 10,
                background: "var(--btn-bg)",
                color: "var(--text)",
                outline: "none",
                fontSize: 12,
              }}
            >
              <option value="all">全部书籍</option>
              {books.map((book) => (
                <option key={book.id} value={book.id}>
                  {book.title}
                </option>
              ))}
            </select>
          </div>

          <div
            style={{
              fontSize: 11,
              color: "var(--text-sub)",
            }}
          >
            当前范围：
            {selectedBookId === "all"
              ? "全部书籍"
              : books.find((book) => book.id === selectedBookId)?.title ?? "当前书籍"}
          </div>
        </div>
      </section>

      {loading ? (
        <div style={{ fontSize: 11, color: "var(--text-sub)" }}>统计加载中…</div>
      ) : null}

      {error ? (
        <div style={{ fontSize: 11, color: "#ef4444" }}>{error}</div>
      ) : null}

      <section className="stats-card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            marginBottom: 10,
            flexWrap: "wrap",
          }}
        >
          <div className="stats-card-title" style={{ marginBottom: 0 }}>
            今日
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontSize: 10, color: "var(--text-sub)" }}>目标</span>

            <input
              type="number"
              min={1}
              step={100}
              value={targetInput}
              onChange={(e) => setTargetInput(e.currentTarget.value)}
              onBlur={applyTarget}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyTarget();
              }}
              style={{
                width: 86,
                boxSizing: "border-box",
                padding: "6px 8px",
                border: "1px solid var(--btn-border)",
                borderRadius: 8,
                background: "var(--btn-bg)",
                color: "var(--text)",
                outline: "none",
                fontSize: 11,
              }}
            />

            <button
              type="button"
              onClick={applyTarget}
              style={{
                border: "1px solid var(--btn-border)",
                borderRadius: 8,
                background: "var(--btn-bg)",
                color: "var(--text)",
                padding: "6px 10px",
                cursor: "pointer",
                fontSize: 11,
                lineHeight: 1.2,
              }}
            >
              保存
            </button>
          </div>
        </div>

        <div
          style={{
            marginBottom: 14,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 11,
              color: "var(--text-sub)",
            }}
          >
            <span>今日进度</span>
            <span>
              {todayWords} / {dailyTarget}
            </span>
          </div>

          <div
            style={{
              width: "100%",
              height: 10,
              borderRadius: 999,
              background: "rgba(148,163,184,0.2)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${progressPercent}%`,
                height: "100%",
                background:
                  progressPercent >= 100
                    ? "linear-gradient(90deg,#22c55e,#4ade80)"
                    : "linear-gradient(90deg,#3b82f6,#60a5fa)",
                transition: "width 0.3s ease",
              }}
            />
          </div>

          <div style={{ fontSize: 10, color: "var(--text-sub)" }}>
            完成度 {progressPercent}%
          </div>
        </div>

        <div className="stats-grid">
          <div className="stats-metric">
            <div className="stats-metric-label">今日字数</div>
            <div className="stats-metric-value">{todayWords}</div>
            <div className="stats-metric-sub">words</div>
          </div>

          <div className="stats-metric">
            <div className="stats-metric-label">今日时长</div>
            <div className="stats-metric-value">{formatMinutes(todayDurationMs)}</div>
            <div className="stats-metric-sub">分钟</div>
          </div>

          <div className="stats-metric">
            <div className="stats-metric-label">写作速度</div>
            <div className="stats-metric-value">{formatSpeed(todayWords, todayDurationMs)}</div>
            <div className="stats-metric-sub">字 / 小时</div>
          </div>

          <div className="stats-metric">
            <div className="stats-metric-label">剩余目标</div>
            <div className="stats-metric-value">{remainingWords}</div>
            <div className="stats-metric-sub">字</div>
          </div>
        </div>
      </section>

      <section className="stats-card">
        <div className="stats-card-title">总览</div>

        <div className="stats-grid">
          <div className="stats-metric">
            <div className="stats-metric-label">总字数</div>
            <div className="stats-metric-value">{overview?.totalWords ?? 0}</div>
            <div className="stats-metric-sub">累计产出</div>
          </div>

          <div className="stats-metric">
            <div className="stats-metric-label">总时长</div>
            <div className="stats-metric-value">
              {formatHours(overview?.totalDurationMs ?? 0)}
            </div>
            <div className="stats-metric-sub">小时</div>
          </div>

          <div className="stats-metric">
            <div className="stats-metric-label">当前连续</div>
            <div className="stats-metric-value">{overview?.currentStreakDays ?? 0}</div>
            <div className="stats-metric-sub">天</div>
          </div>

          <div className="stats-metric">
            <div className="stats-metric-label">最长连续</div>
            <div className="stats-metric-value">{overview?.longestStreakDays ?? 0}</div>
            <div className="stats-metric-sub">天</div>
          </div>

          <div className="stats-metric">
            <div className="stats-metric-label">写作天数</div>
            <div className="stats-metric-value">{overview?.totalWritingDays ?? 0}</div>
            <div className="stats-metric-sub">活跃天</div>
          </div>

          <div className="stats-metric">
            <div className="stats-metric-label">日均字数</div>
            <div className="stats-metric-value">{overview?.averageWordsPerDay ?? 0}</div>
            <div className="stats-metric-sub">字 / 天</div>
          </div>
        </div>
      </section>

      <section className="stats-card">
        <div className="stats-card-title">近 14 天趋势</div>

        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 8,
            height: 180,
            paddingTop: 10,
          }}
        >
          {trendStats.map((item) => {
            const barHeight = Math.max(
              6,
              Math.round((item.totalWords / maxTrendWords) * 150),
            );

            return (
              <div
                key={item.date}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                  minWidth: 0,
                }}
                title={`${item.date}
${item.totalWords} 字
${formatMinutes(item.totalDurationMs)} 分钟`}
              >
                <div
                  style={{
                    width: "100%",
                    height: barHeight,
                    borderRadius: 8,
                    background:
                      item.totalWords > 0
                        ? "linear-gradient(180deg, rgba(59,130,246,0.78), rgba(96,165,250,0.48))"
                        : "rgba(148,163,184,0.14)",
                    border: "1px solid var(--border)",
                  }}
                />

                <div
                  style={{
                    fontSize: 10,
                    color: "var(--text-sub)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.date.slice(5)}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="stats-card">
        <div className="stats-card-title">码字日历</div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          <div
            style={{
              overflowX: "auto",
              paddingBottom: 6,
              position: "relative",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `40px repeat(${calendarData.columns.length}, 16px)`,
                gridTemplateRows: "30px repeat(7, 16px)",
                columnGap: 4,
                rowGap: 4,
                width: "max-content",
                alignItems: "center",
                margin: "0 auto",
              }}
            >
              {calendarData.monthLabels.map((label, i) => (
                <div
                  key={`month-${i}`}
                  style={{
                    gridColumn: i + 2,
                    gridRow: 1,
                    fontSize: 11,
                    color: "var(--text-sub)",
                    lineHeight: 1,
                    textAlign: "left",
                    whiteSpace: "nowrap",
                    height: 30,
                  }}
                >
                  {label}
                </div>
              ))}

              {["一", "二", "三", "四", "五", "六", "日"].map((label, rowIndex) => (
                <div
                  key={`weekday-${label}`}
                  style={{
                    gridColumn: 1,
                    gridRow: rowIndex + 2,
                    fontSize: 11,
                    color: "var(--text-sub)",
                    lineHeight: 1,
                    height: 16,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {label}
                </div>
              ))}

              {[0, 1, 2, 3, 4, 5, 6].flatMap((rowIndex) =>
                calendarData.columns.map((column, colIndex) => {
                  const item = column[rowIndex];
                  const isToday = item.date === todayKey;
                  const isSelected = item.date === selectedDate;

                  return (
                    <div
                      key={`${colIndex}-${rowIndex}-${item.date}`}
                      className={`stats-day ${getIntensity(item.totalWords)} ${
                        isToday ? "today" : ""
                      } ${isSelected ? "selected" : ""}`}
                      style={{
                        gridColumn: colIndex + 2,
                        gridRow: rowIndex + 2,
                      }}
                      onClick={() => {
                        setSelectedDate(item.date);
                      }}
                      onMouseEnter={(e) => {
                        void handleDayMouseEnter(e, item.date);
                      }}
                      onMouseLeave={handleDayMouseLeave}
                    />
                  );
                }),
              )}
            </div>

            {hoverTooltip.visible ? (
              <div
                style={{
                  position: "fixed",
                  left: hoverTooltip.x,
                  top: hoverTooltip.y,
                  zIndex: 50,
                  minWidth: 220,
                  maxWidth: 320,
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  background: "var(--card)",
                  boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
                  padding: 12,
                  pointerEvents: "none",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-sub)",
                    marginBottom: 6,
                  }}
                >
                  {hoveredDate ?? "—"}
                </div>

                {hoverLoading ? (
                  <div style={{ fontSize: 11, color: "var(--text-sub)" }}>读取中…</div>
                ) : hoveredDocItems.length === 0 ? (
                  <div style={{ fontSize: 11, color: "var(--text-sub)" }}>
                    这一天没有写作记录
                  </div>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    {hoveredDocItems.map((item) => (
                      <div
                        key={item.docPath}
                        style={{
                          border: "1px solid var(--border)",
                          borderRadius: 10,
                          padding: "8px 10px",
                          background: "var(--btn-bg)",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: "var(--text)",
                            marginBottom: 4,
                            wordBreak: "break-word",
                          }}
                        >
                          {item.docName}
                        </div>

                        <div
                          style={{
                            display: "flex",
                            gap: 10,
                            flexWrap: "wrap",
                            fontSize: 10,
                            color: "var(--text-sub)",
                          }}
                        >
                          <span>{item.totalWords} 字</span>
                          <span>{formatMinutes(item.totalDurationMs)} 分钟</span>
                          <span>{item.sessions} 场</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 10,
                color: "var(--text-sub)",
                marginTop: 12,
                justifyContent: "center",
              }}
            >
              <span>少</span>
              <div className="stats-day level-0" />
              <div className="stats-day level-1" />
              <div className="stats-day level-2" />
              <div className="stats-day level-3" />
              <div className="stats-day level-4" />
              <span>多</span>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 12,
            }}
          >
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 12,
                background: "var(--btn-bg)",
                padding: 12,
              }}
            >
              <div style={{ fontSize: 10, color: "var(--text-sub)", marginBottom: 6 }}>
                选中日期
              </div>
              <div
                style={{
                  fontSize: 16,
                  lineHeight: 1.2,
                  fontWeight: 700,
                  color: "var(--text)",
                  marginBottom: 8,
                }}
              >
                {selectedDate}
              </div>

              {selectedSummary.totalWords > 0 ? (
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                    fontSize: 10,
                    color: "var(--text-sub)",
                  }}
                >
                  <span>{selectedSummary.totalWords} 字</span>
                  <span>{formatMinutes(selectedSummary.totalDurationMs)} 分钟</span>
                  <span>{selectedSummary.sessions} 场</span>
                </div>
              ) : (
                <div style={{ fontSize: 11, color: "var(--text-sub)" }}>
                  这一天没有写作记录
                </div>
              )}
            </div>

            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 12,
                background: "var(--btn-bg)",
                padding: 12,
              }}
            >
              <div style={{ fontSize: 10, color: "var(--text-sub)", marginBottom: 6 }}>
                近 365 天活跃天数
              </div>
              <div
                style={{
                  fontSize: 22,
                  lineHeight: 1.1,
                  fontWeight: 700,
                  color: "var(--text)",
                }}
              >
                {activeCalendarDays.length}
              </div>
            </div>

            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 12,
                background: "var(--btn-bg)",
                padding: 12,
              }}
            >
              <div style={{ fontSize: 10, color: "var(--text-sub)", marginBottom: 6 }}>
                最佳单日
              </div>
              <div
                style={{
                  fontSize: 16,
                  lineHeight: 1.2,
                  fontWeight: 700,
                  color: "var(--text)",
                  marginBottom: 4,
                }}
              >
                {bestDay?.totalWords ?? 0} 字
              </div>
              <div style={{ fontSize: 10, color: "var(--text-sub)" }}>
                {bestDay?.date ?? "暂无"}
              </div>
            </div>

            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 12,
                background: "var(--btn-bg)",
                padding: 12,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
              }}
            >
              <div>
                <div style={{ fontSize: 10, color: "var(--text-sub)", marginBottom: 6 }}>
                  活跃日均字数
                </div>
                <div
                  style={{
                    fontSize: 16,
                    lineHeight: 1.2,
                    fontWeight: 700,
                    color: "var(--text)",
                  }}
                >
                  {averageWords}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 10, color: "var(--text-sub)", marginBottom: 6 }}>
                  活跃日均时长
                </div>
                <div
                  style={{
                    fontSize: 16,
                    lineHeight: 1.2,
                    fontWeight: 700,
                    color: "var(--text)",
                  }}
                >
                  {averageMinutes} 分
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="stats-card">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 10,
            flexWrap: "wrap",
          }}
        >
          <div className="stats-card-title" style={{ marginBottom: 0 }}>
            周 / 月统计
          </div>

          <div className="stats-segment-switch">
            <button
              type="button"
              className={`stats-segment-btn ${periodMode === "week" ? "active" : ""}`}
              onClick={() => setPeriodMode("week")}
            >
              周
            </button>
            <button
              type="button"
              className={`stats-segment-btn ${periodMode === "month" ? "active" : ""}`}
              onClick={() => setPeriodMode("month")}
            >
              月
            </button>
          </div>
        </div>

        {recentPeriodStats.length === 0 ? (
          <div style={{ fontSize: 11, color: "var(--text-sub)" }}>暂无数据</div>
        ) : (
          <div className="stats-period-list">
            {recentPeriodStats.map((item) => {
              const maxWords = Math.max(...recentPeriodStats.map((stat) => stat.totalWords), 1);
              const widthPercent = Math.max(8, Math.round((item.totalWords / maxWords) * 100));

              return (
                <div key={item.label} className="stats-period-row">
                  <div className="stats-period-label">{item.label}</div>

                  <div className="stats-period-bar-wrap">
                    <div className="stats-period-bar" style={{ width: `${widthPercent}%` }} />
                  </div>

                  <div className="stats-period-value">{item.totalWords} 字</div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}