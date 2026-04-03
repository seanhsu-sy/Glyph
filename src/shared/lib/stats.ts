import { invoke } from "@tauri-apps/api/core";

export type WritingLogInput = {
  bookId: string;
  docPath: string;
  date: string;
  startTime: number;
  endTime: number;
  durationMs: number;
  wordDelta: number;
};

export type WritingLog = {
  id: string;
  bookId: string;
  docPath: string;
  date: string;
  startTime: number;
  endTime: number;
  durationMs: number;
  wordDelta: number;
};

export type DailyWritingSummary = {
  date: string;
  totalWords: number;
  totalDurationMs: number;
  sessions: number;
};

export type DailyStat = {
  date: string;
  totalWords: number;
  totalDurationMs: number;
  sessions: number;
};

export type StatsOverview = {
  totalWords: number;
  totalDurationMs: number;
  totalSessions: number;
  totalWritingDays: number;
  currentStreakDays: number;
  longestStreakDays: number;
  averageWordsPerDay: number;
};

export type PeriodStat = {
  label: string;
  totalWords: number;
  totalDurationMs: number;
  sessions: number;
  activeDays: number;
};

export async function appendWritingLog(input: WritingLogInput): Promise<void> {
  await invoke<void>("append_writing_log", { input });
}

export async function getWritingSummaryByDate(
  date: string,
): Promise<DailyWritingSummary> {
  return await invoke<DailyWritingSummary>("get_writing_summary_by_date", {
    date,
  });
}

export async function getWritingLogsByDate(
  date: string,
  bookId?: string,
): Promise<WritingLog[]> {
  return await invoke<WritingLog[]>("get_writing_logs_by_date", {
    date,
    bookId: bookId ?? null,
  });
}

export async function getDailyStats(bookId?: string): Promise<DailyStat[]> {
  return await invoke<DailyStat[]>("get_daily_stats", {
    bookId: bookId ?? null,
  });
}

export async function getStatsOverview(bookId?: string): Promise<StatsOverview> {
  return await invoke<StatsOverview>("get_stats_overview", {
    bookId: bookId ?? null,
  });
}

export async function getWeeklyStats(bookId?: string): Promise<PeriodStat[]> {
  return await invoke<PeriodStat[]>("get_weekly_stats", {
    bookId: bookId ?? null,
  });
}

export async function getMonthlyStats(bookId?: string): Promise<PeriodStat[]> {
  return await invoke<PeriodStat[]>("get_monthly_stats", {
    bookId: bookId ?? null,
  });
}