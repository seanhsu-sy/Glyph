import { create } from "zustand";
import type {
  DailyStat,
  DailyWritingSummary,
  PeriodStat,
  StatsOverview,
} from "../../shared/lib/stats";

type WritingStatsState = {
  selectedBookId: string | null;

  today: DailyWritingSummary | null;
  overview: StatsOverview | null;
  dailyStats: DailyStat[];
  weeklyStats: PeriodStat[];
  monthlyStats: PeriodStat[];

  loading: boolean;
  error: string | null;

  setSelectedBookId: (bookId: string | null) => void;

  setTodaySummary: (summary: DailyWritingSummary) => void;
  clearTodaySummary: () => void;

  setOverview: (overview: StatsOverview | null) => void;
  setDailyStats: (stats: DailyStat[]) => void;
  setWeeklyStats: (stats: PeriodStat[]) => void;
  setMonthlyStats: (stats: PeriodStat[]) => void;

  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  clearAllStats: () => void;
};

export const useWritingStatsStore = create<WritingStatsState>((set) => ({
  selectedBookId: null,

  today: null,
  overview: null,
  dailyStats: [],
  weeklyStats: [],
  monthlyStats: [],

  loading: false,
  error: null,

  setSelectedBookId: (bookId) => {
    set({ selectedBookId: bookId });
  },

  setTodaySummary: (summary) => {
    set({ today: summary });
  },

  clearTodaySummary: () => {
    set({ today: null });
  },

  setOverview: (overview) => {
    set({ overview });
  },

  setDailyStats: (stats) => {
    set({ dailyStats: stats });
  },

  setWeeklyStats: (stats) => {
    set({ weeklyStats: stats });
  },

  setMonthlyStats: (stats) => {
    set({ monthlyStats: stats });
  },

  setLoading: (loading) => {
    set({ loading });
  },

  setError: (error) => {
    set({ error });
  },

  clearAllStats: () => {
    set({
      today: null,
      overview: null,
      dailyStats: [],
      weeklyStats: [],
      monthlyStats: [],
      loading: false,
      error: null,
    });
  },
}));