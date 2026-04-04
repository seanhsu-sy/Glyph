import { invoke } from "@tauri-apps/api/core";

export type OpenedFile = {
  path: string;
  name: string;
  content: string;
};

export type Book = {
  id: string;
  title: string;
  description?: string;
  folderName: string;
  folderPath: string;
  updatedAt: string;
  documentCount: number;
};

export type DocumentItem = {
  name: string;
  path: string;
  wordCount: number;
  kind: "chapter" | "outline";
};

export async function openFileByDialog(): Promise<OpenedFile | null> {
  return await invoke<OpenedFile | null>("open_file_by_dialog");
}

export async function saveFileContent(path: string, content: string): Promise<void> {
  await invoke<void>("save_file_content", { path, content });
}

/** 无对话框，直接写入书籍目录下的 Untitled.md（或 Untitled-2.md …） */
export async function saveUntitledInBook(
  bookFolderPath: string,
  content: string,
): Promise<string> {
  return await invoke<string>("save_untitled_in_book", { bookFolderPath, content });
}

export async function saveFileAsByDialog(content: string): Promise<string | null> {
  return await invoke<string | null>("save_file_as", { content });
}

export async function listBooks(): Promise<Book[]> {
  return await invoke<Book[]>("list_books");
}

export async function createBook(title: string): Promise<Book> {
  return await invoke<Book>("create_book", { title });
}

export async function deleteBook(folderPath: string): Promise<void> {
  await invoke<void>("delete_book", { folderPath });
}

export async function renameBook(
  folderPath: string,
  newTitle: string,
): Promise<boolean> {
  return await invoke<boolean>("rename_book", { folderPath, newTitle });
}

export async function listDocuments(bookPath: string): Promise<DocumentItem[]> {
  return await invoke<DocumentItem[]>("list_documents", { bookPath });
}

export async function readFile(path: string): Promise<string> {
  return await invoke<string>("read_file", { path });
}

export async function createDocument(
  bookPath: string,
  title: string,
  kind: "chapter" | "outline",
): Promise<DocumentItem> {
  return await invoke<DocumentItem>("create_document", {
    bookPath,
    title,
    kind,
  });
}

export async function deleteDocument(path: string): Promise<void> {
  await invoke<void>("delete_document", { path });
}

export async function renameDocument(
  path: string,
  newTitle: string,
): Promise<DocumentItem> {
  return await invoke<DocumentItem>("rename_document", { path, newTitle });
}