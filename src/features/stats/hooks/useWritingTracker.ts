import { useCallback, useEffect, useRef } from "react";
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

function todayStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = `${now.getMonth() + 1}`.padStart(2, "0");
  const d = `${now.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function useWritingTracker({ bookId, filePath, wordCount }: Params) {
  const sessionsRef = useRef<Record<string, Session>>({});
  const prevRef = useRef<{ filePath: string | null; wordCount: number }>({
    filePath,
    wordCount,
  });

  const setTodaySummary = useWritingStatsStore((s) => s.setTodaySummary);

  const refreshTodaySummary = useCallback(async () => {
    try {
      const summary = await getWritingSummaryByDate(todayStr(), bookId);
      setTodaySummary(summary);
    } catch (err) {
      console.error("refreshTodaySummary failed", err);
    }
  }, [bookId, setTodaySummary]);

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
      await appendWritingLog({
        bookId,
        docPath,
        date: todayStr(),
        startTime: session.startTime,
        endTime: session.lastTime,
        durationMs: duration,
        wordDelta,
      });
    } catch (err) {
      console.error("appendWritingLog failed", err);
    } finally {
      delete sessionsRef.current[docPath];
      await refreshTodaySummary();
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
    return () => {
      Object.keys(sessionsRef.current).forEach((docPath) => {
        void flushSession(docPath);
      });
    };
  }, []);
}