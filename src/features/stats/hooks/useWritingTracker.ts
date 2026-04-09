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
  /** 参照分屏打开的文档（可选） */
  referenceFilePath?: string | null;
  referenceWordCount?: number;
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

function touchSession(
  sessionsRef: { current: Record<string, Session> },
  docPath: string,
  wordCount: number,
  now: number,
  flushSession: (docPath: string) => Promise<void>,
) {
  const session = sessionsRef.current[docPath];

  if (!session) {
    sessionsRef.current[docPath] = {
      startTime: now,
      lastTime: now,
      startWordCount: wordCount,
      lastWordCount: wordCount,
    };
    return;
  }

  if (now - session.lastTime > IDLE_THRESHOLD) {
    void flushSession(docPath);

    sessionsRef.current[docPath] = {
      startTime: now,
      lastTime: now,
      startWordCount: wordCount,
      lastWordCount: wordCount,
    };
    return;
  }

  session.lastTime = now;
  session.lastWordCount = wordCount;
}

export function useWritingTracker({
  bookId,
  filePath,
  wordCount,
  referenceFilePath = null,
  referenceWordCount = 0,
}: Params): {
  displayWords: number;
  displayDurationMs: number;
} {
  const today = useWritingStatsStore((s) => s.today);
  const sessionsRef = useRef<Record<string, Session>>({});
  const prevRef = useRef({
    filePath,
    wordCount,
    referenceFilePath,
    referenceWordCount,
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

  const flushSessionRef = useRef<(docPath: string) => Promise<void>>(
    async () => {},
  );

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

  flushSessionRef.current = flushSession;

  useEffect(() => {
    void refreshTodaySummary();
  }, [refreshTodaySummary]);

  useEffect(() => {
    const prev = prevRef.current;

    if (prev.filePath && prev.filePath !== filePath) {
      void flushSession(prev.filePath);
    }
    if (
      prev.referenceFilePath &&
      prev.referenceFilePath !== referenceFilePath
    ) {
      void flushSession(prev.referenceFilePath);
    }

    prevRef.current = {
      filePath,
      wordCount,
      referenceFilePath,
      referenceWordCount,
    };
  }, [filePath, wordCount, referenceFilePath, referenceWordCount]);

  useEffect(() => {
    const now = Date.now();

    if (filePath) {
      touchSession(sessionsRef, filePath, wordCount, now, flushSession);
    }
    if (referenceFilePath) {
      touchSession(
        sessionsRef,
        referenceFilePath,
        referenceWordCount,
        now,
        flushSession,
      );
    }
  }, [
    filePath,
    wordCount,
    referenceFilePath,
    referenceWordCount,
  ]);

  useEffect(() => {
    if (!filePath && !referenceFilePath) {
      setLiveExtra({ words: 0, durationMs: 0 });
      return;
    }
    const tick = () => {
      let words = 0;
      let durationMs = 0;

      if (filePath) {
        const s = sessionsRef.current[filePath];
        if (s) {
          words += Math.max(0, s.lastWordCount - s.startWordCount);
          durationMs = Math.max(durationMs, Date.now() - s.startTime);
        }
      }
      if (referenceFilePath) {
        const s = sessionsRef.current[referenceFilePath];
        if (s) {
          words += Math.max(0, s.lastWordCount - s.startWordCount);
          durationMs = Math.max(durationMs, Date.now() - s.startTime);
        }
      }

      setLiveExtra({ words, durationMs });
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [filePath, referenceFilePath]);

  useEffect(() => {
    return () => {
      Object.keys(sessionsRef.current).forEach((docPath) => {
        void flushSessionRef.current(docPath);
      });
    };
  }, []);

  const displayWords = (today?.totalWords ?? 0) + liveExtra.words;
  const displayDurationMs = (today?.totalDurationMs ?? 0) + liveExtra.durationMs;

  return { displayWords, displayDurationMs };
}
