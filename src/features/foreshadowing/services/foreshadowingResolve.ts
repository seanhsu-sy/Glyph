import type { ForeshadowAnchor, ForeshadowRecord } from "../types";

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * 根据当前正文为单条记录解析用于高亮的范围；优先校验 from/to 与 excerpt 一致，否则全文搜索 excerpt。
 */
export function resolveOneRecordInContent(
  content: string,
  r: ForeshadowRecord,
): ForeshadowAnchor & { positionUncertain: boolean } {
  const len = content.length;
  let from = clamp(r.from, 0, len);
  let to = clamp(r.to, from, len);
  const slice = content.slice(from, to);
  if (r.excerpt && slice === r.excerpt) {
    return { id: r.id, from, to, positionUncertain: false };
  }
  if (r.excerpt) {
    const idx = content.indexOf(r.excerpt);
    if (idx !== -1) {
      return {
        id: r.id,
        from: idx,
        to: idx + r.excerpt.length,
        positionUncertain: false,
      };
    }
  }
  return { id: r.id, from, to, positionUncertain: true };
}

export function reconcileRecordPositions(
  content: string,
  r: ForeshadowRecord,
): ForeshadowRecord {
  const resolved = resolveOneRecordInContent(content, r);
  return {
    ...r,
    from: resolved.from,
    to: resolved.to,
    positionUncertain: resolved.positionUncertain,
  };
}

export function anchorsForDocumentPath(
  content: string,
  records: ForeshadowRecord[],
  docPath: string | null,
): ForeshadowAnchor[] {
  if (!docPath) return [];
  const out: ForeshadowAnchor[] = [];
  for (const r of records) {
    if (r.docPath !== docPath) continue;
    const { id, from, to, positionUncertain: _u } = resolveOneRecordInContent(
      content,
      r,
    );
    if (to > from) {
      out.push({ id, from, to });
    }
  }
  return out;
}
