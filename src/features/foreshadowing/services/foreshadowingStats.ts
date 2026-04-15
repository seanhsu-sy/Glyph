import type { ForeshadowRecord } from "../types";

export type TagSummary = {
  tag: string;
  occurrenceCount: number;
  distinctDocCount: number;
  lastCreatedAt: string;
  lastDocPath: string;
  lastDocName: string;
  entries: ForeshadowRecord[];
};

function maxCreated(a: string, b: string): boolean {
  return a >= b;
}

/**
 * 按标签聚合（标签名区分大小写；可先 trim 再存）。
 */
export function aggregateByTag(records: ForeshadowRecord[]): TagSummary[] {
  const byTag = new Map<string, ForeshadowRecord[]>();
  for (const r of records) {
    const t = r.tag.trim();
    if (!t) continue;
    const list = byTag.get(t) ?? [];
    list.push(r);
    byTag.set(t, list);
  }

  const summaries: TagSummary[] = [];
  for (const [tag, entries] of byTag) {
    const paths = new Set(entries.map((e) => e.docPath));
    let last = entries[0];
    for (const e of entries) {
      if (maxCreated(e.createdAt, last.createdAt)) {
        last = e;
      }
    }
    summaries.push({
      tag,
      occurrenceCount: entries.length,
      distinctDocCount: paths.size,
      lastCreatedAt: last.createdAt,
      lastDocPath: last.docPath,
      lastDocName: last.docName,
      entries: entries.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    });
  }

  summaries.sort((a, b) => {
    if (b.occurrenceCount !== a.occurrenceCount) {
      return b.occurrenceCount - a.occurrenceCount;
    }
    return a.tag.localeCompare(b.tag, "zh-Hans-CN");
  });

  return summaries;
}
