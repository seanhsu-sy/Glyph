import { invoke } from "@tauri-apps/api/core";

export type OpenedFile = {
  path: string;
  name: string;
  content: string;
};

export async function openFileByDialog(): Promise<OpenedFile | null> {
  const result = await invoke<OpenedFile | null>("open_file_by_dialog");
  return result;
}

export async function saveFileContent(path: string, content: string): Promise<void> {
  await invoke<void>("save_file_content", { path, content });
}

export async function saveFileAsByDialog(content: string): Promise<OpenedFile | null> {
  const result = await invoke<OpenedFile | null>("save_file_as", { content });
  return result;
}

