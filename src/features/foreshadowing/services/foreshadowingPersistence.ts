import { readFile, writeFileEnsuringParent } from "../../../shared/lib/tauri";
import type { ForeshadowFileV1, ForeshadowRecord } from "../types";
import { foreshadowingJsonPath } from "./foreshadowingPaths";

function emptyFile(): ForeshadowFileV1 {
  return { version: 1, records: [] };
}

function parseFile(raw: string): ForeshadowFileV1 {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      (parsed as ForeshadowFileV1).version === 1 &&
      Array.isArray((parsed as ForeshadowFileV1).records)
    ) {
      return {
        version: 1,
        records: ((parsed as ForeshadowFileV1).records as unknown[]).filter(
          isForeshadowRecord,
        ),
      };
    }
  } catch {
    /* ignore */
  }
  return emptyFile();
}

function isForeshadowRecord(x: unknown): x is ForeshadowRecord {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.tag === "string" &&
    typeof o.docPath === "string" &&
    typeof o.docName === "string" &&
    (o.docKind === "chapter" || o.docKind === "outline") &&
    typeof o.from === "number" &&
    typeof o.to === "number" &&
    typeof o.excerpt === "string" &&
    typeof o.createdAt === "string" &&
    typeof o.positionUncertain === "boolean"
  );
}

export async function loadForeshadowingFile(
  bookFolderPath: string,
): Promise<ForeshadowRecord[]> {
  const path = foreshadowingJsonPath(bookFolderPath);
  try {
    const raw = await readFile(path);
    return parseFile(raw).records;
  } catch {
    return [];
  }
}

export async function saveForeshadowingFile(
  bookFolderPath: string,
  records: ForeshadowRecord[],
): Promise<void> {
  const path = foreshadowingJsonPath(bookFolderPath);
  const payload: ForeshadowFileV1 = { version: 1, records };
  await writeFileEnsuringParent(path, JSON.stringify(payload, null, 2));
}

export function migrateDocPath(
  records: ForeshadowRecord[],
  fromPath: string,
  toPath: string,
  newDocName: string,
): ForeshadowRecord[] {
  return records.map((r) =>
    r.docPath === fromPath
      ? { ...r, docPath: toPath, docName: newDocName }
      : r,
  );
}

export function removeRecordsForDocPath(
  records: ForeshadowRecord[],
  docPath: string,
): ForeshadowRecord[] {
  return records.filter((r) => r.docPath !== docPath);
}
