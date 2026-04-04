const STORAGE_KEY = "glyph_associations_v1";

export type AssociationScope = "book" | "global";
export type AssociationKind = "anchor" | "sticky";

export type AssociationRecord = {
  id: string;
  bookId: string;
  /** 锚点批注必填；便签可为 null（本书/全局悬浮） */
  docPath: string | null;
  from: number;
  to: number;
  quote: string;
  body: string;
  scope: AssociationScope;
  kind: AssociationKind;
  /** 便签关闭后保留数据，仅隐藏 */
  dismissed?: boolean;
};

export function loadAssociations(): AssociationRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is AssociationRecord =>
        typeof x === "object" &&
        x !== null &&
        typeof (x as AssociationRecord).id === "string" &&
        typeof (x as AssociationRecord).bookId === "string",
    );
  } catch {
    return [];
  }
}

export function saveAssociations(items: AssociationRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* ignore quota */
  }
}

export function upsertAssociation(
  items: AssociationRecord[],
  rec: AssociationRecord,
): AssociationRecord[] {
  const i = items.findIndex((a) => a.id === rec.id);
  if (i === -1) return [...items, rec];
  const next = items.slice();
  next[i] = rec;
  return next;
}

export function removeAssociation(
  items: AssociationRecord[],
  id: string,
): AssociationRecord[] {
  return items.filter((a) => a.id !== id);
}

export function patchAssociation(
  items: AssociationRecord[],
  id: string,
  patch: Partial<AssociationRecord>,
): AssociationRecord[] {
  return items.map((a) => (a.id === id ? { ...a, ...patch } : a));
}

export type AssocAnchor = { id: string; from: number; to: number };

export function anchorsForDocument(
  items: AssociationRecord[],
  bookId: string,
  docPath: string | null,
): AssocAnchor[] {
  if (!docPath) return [];
  return items
    .filter(
      (a) =>
        a.kind === "anchor" &&
        a.bookId === bookId &&
        a.docPath === docPath &&
        a.from >= 0 &&
        a.to > a.from,
    )
    .map((a) => ({ id: a.id, from: a.from, to: a.to }));
}

export function stickiesVisible(
  items: AssociationRecord[],
  bookId: string,
): AssociationRecord[] {
  return items.filter(
    (a) =>
      a.kind === "sticky" &&
      !a.dismissed &&
      (a.scope === "global" || a.bookId === bookId),
  );
}

/** 标记为「跨书」的全部记录（批注 + 便签） */
export function filterCrossBookAssociations(
  items: AssociationRecord[],
): AssociationRecord[] {
  return items.filter((a) => a.scope === "global");
}

/** 侧栏「本书」列表：本书下未关闭的锚点批注与便签 */
export function associationRecordsForBook(
  items: AssociationRecord[],
  bookId: string,
): AssociationRecord[] {
  return items.filter(
    (a) =>
      a.bookId === bookId &&
      (a.kind === "anchor" ||
        (a.kind === "sticky" && !a.dismissed)),
  );
}

export function fileNameFromPath(path: string | null): string {
  if (!path) return "—";
  if (path.startsWith("glyph:untitled:")) return "Untitled.md";
  const parts = path.split(/[/\\]/);
  const last = parts[parts.length - 1];
  return last || path;
}

export function migrateAssociationDocPath(
  items: AssociationRecord[],
  bookId: string,
  fromPath: string,
  toPath: string,
): AssociationRecord[] {
  return items.map((a) =>
    a.bookId === bookId && a.docPath === fromPath ? { ...a, docPath: toPath } : a,
  );
}
