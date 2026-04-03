use crate::services::book_service;
use crate::services::book_service::BookItem;

#[tauri::command]
pub fn list_books() -> Result<Vec<BookItem>, String> {
    book_service::list_books()
}

#[tauri::command]
pub fn create_book(title: String) -> Result<BookItem, String> {
    book_service::create_book(title)
}

#[tauri::command]
pub fn delete_book(folder_path: String) -> Result<(), String> {
    book_service::delete_book(folder_path)
}

#[tauri::command]
pub fn rename_book(folder_path: String, new_title: String) -> Result<bool, String> {
    book_service::rename_book(folder_path, new_title)
}