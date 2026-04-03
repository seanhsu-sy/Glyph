import type { Book } from "../../../shared/lib/tauri";
import { createBook, deleteBook, listBooks } from "../../../shared/lib/tauri";

export async function getBooks(): Promise<Book[]> {
  return await listBooks();
}

export async function createNewBook(title: string): Promise<Book> {
  return await createBook(title);
}

export async function deleteExistingBook(folderPath: string): Promise<void> {
  await deleteBook(folderPath);
}