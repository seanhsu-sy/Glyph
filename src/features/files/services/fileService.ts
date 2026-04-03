import type { OpenedFile } from "../../../shared/lib/tauri";
import { openFileByDialog, saveFileAsByDialog, saveFileContent } from "../../../shared/lib/tauri";

export async function openMarkdownFile(): Promise<OpenedFile | null> {
  const file = await openFileByDialog();
  return file;
}

export async function saveMarkdownFile(path: string, content: string): Promise<void> {
  await saveFileContent(path, content);
}

export async function saveFileAs(content: string): Promise<string | null> {
  const path = await saveFileAsByDialog(content);
  return path;
}

