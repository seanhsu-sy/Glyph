import { useCallback, useEffect, useRef, useState } from "react";
import {
  appendWritingLog,
  getWritingSummaryByDate,
} from "../../../shared/lib/stats";
import { useWritingStatsStore } from "../../../app/store/writingStatsStore";

type Params = {
  bookId: string;
  filePath: string | null;
  wordCount: number;
};

type Session = {
  startTime: number;
  lastTime: number;
  startWordCount: number;
  lastWordCount: number;
};

const IDLE_THRESHOLD = 30_000;
const MIN_DURATION = 3_000;
/** Tauri invoke 异常卡住时避免 Promise 永久挂起 */
const STATS_RPC_TIMEOUT_MS = 12_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => {
      reject(new Error(`stats: timeout after ${ms}ms`));
    }, ms);
    promise.then(
      (v) => {
        window.clearTimeout(t);
        resolve(v);
      },
      (e) => {
        window.clearTimeout(t);
        reject(e);
      },
    );
  });
}

function todayStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = `${now.getMonth() + 1}`.padStart(2, "0");
  const d = `${now.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function useWritingTracker({ bookId, filePath, wordCount }: Params): {
  displayWords: number;
  displayDurationMs: number;
} {
  const today = useWritingStatsStore((s) => s.today);
  const sessionsRef = useRef<Record<string, Session>>({});
  const prevRef = useRef<{ filePath: string | null; wordCount: number }>({
    filePath,
    wordCount,
  });

  const setTodaySummary = useWritingStatsStore((s) => s.setTodaySummary);

  const refreshTodaySummary = useCallback(async () => {
    try {
      const summary = await withTimeout(
        getWritingSummaryByDate(todayStr(), bookId),
        STATS_RPC_TIMEOUT_MS,
      );
      setTodaySummary(summary);
    } catch (err) {
      console.error("refreshTodaySummary failed", err);
    }
  }, [bookId, setTodaySummary]);

  const refreshTodaySummaryAndNotify = useCallback(async () => {
    await refreshTodaySummary();
    window.dispatchEvent(new CustomEvent("writing-stats-invalidate"));
  }, [refreshTodaySummary]);

  const [liveExtra, setLiveExtra] = useState({ words: 0, durationMs: 0 });

  async function flushSession(docPath: string) {
    const session = sessionsRef.current[docPath];
    if (!session) return;

    const duration = session.lastTime - session.startTime;
    const wordDelta = session.lastWordCount - session.startWordCount;

    if (duration < MIN_DURATION || wordDelta === 0) {
      delete sessionsRef.current[docPath];
      return;
    }

    try {
      await withTimeout(
        appendWritingLog({
          bookId,
          docPath,
          date: todayStr(),
          startTime: session.startTime,
          endTime: session.lastTime,
          durationMs: duration,
          wordDelta,
        }),
        STATS_RPC_TIMEOUT_MS,
      );
      delete sessionsRef.current[docPath];
      await refreshTodaySummaryAndNotify();
    } catch (err) {
      console.error("appendWritingLog failed", err);
      delete sessionsRef.current[docPath];
    }
  }

  useEffect(() => {
    void refreshTodaySummary();
  }, [refreshTodaySummary]);

  useEffect(() => {
    const prev = prevRef.current;

    if (prev.filePath && prev.filePath !== filePath) {
      void flushSession(prev.filePath);
    }

    prevRef.current = { filePath, wordCount };
  }, [filePath, wordCount]);

  useEffect(() => {
    if (!filePath) return;

    const now = Date.now();
    const session = sessionsRef.current[filePath];

    if (!session) {
      sessionsRef.current[filePath] = {
        startTime: now,
        lastTime: now,
        startWordCount: wordCount,
        lastWordCount: wordCount,
      };
      return;
    }

    if (now - session.lastTime > IDLE_THRESHOLD) {
      void flushSession(filePath);

      sessionsRef.current[filePath] = {
        startTime: now,
        lastTime: now,
        startWordCount: wordCount,
        lastWordCount: wordCount,
      };
      return;
    }

    session.lastTime = now;
    session.lastWordCount = wordCount;
  }, [wordCount, filePath]);

  useEffect(() => {
    if (!filePath) {
      setLiveExtra({ words: 0, durationMs: 0 });
      return;
    }
    const tick = () => {
      const session = sessionsRef.current[filePath];
      if (!session) {
        setLiveExtra({ words: 0, durationMs: 0 });
        return;
      }
      const words = Math.max(0, session.lastWordCount - session.startWordCount);
      const durationMs = Date.now() - session.startTime;
      setLiveExtra({ words, durationMs });
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [filePath]);

  useEffect(() => {
    return () => {
      Object.keys(sessionsRef.current).forEach((docPath) => {
        void flushSession(docPath);
      });
    };
  }, []);

  const displayWords = (today?.totalWords ?? 0) + liveExtra.words;
  const displayDurationMs = (today?.totalDurationMs ?? 0) + liveExtra.durationMs;

  return { displayWords, displayDurationMs };
}
