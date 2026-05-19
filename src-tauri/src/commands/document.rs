use crate::services::chapter_layout_service;
use crate::services::chapter_layout_service::ChapterLayout;
use crate::services::document_service;
use crate::services::document_service::DocumentItem;

#[tauri::command]
pub fn list_documents(book_path: String) -> Result<Vec<DocumentItem>, String> {
    document_service::list_documents(book_path)
}

#[tauri::command]
pub fn create_document(
    book_path: String,
    title: String,
    kind: String,
) -> Result<DocumentItem, String> {
    document_service::create_document(book_path, title, kind)
}

#[tauri::command]
pub fn delete_document(path: String) -> Result<(), String> {
    document_service::delete_document(path)
}

#[tauri::command]
pub fn rename_document(path: String, new_title: String) -> Result<DocumentItem, String> {
    document_service::rename_document(path, new_title)
}

#[tauri::command]
pub fn get_chapter_layout(
    book_path: String,
    chapter_paths: Vec<String>,
) -> Result<ChapterLayout, String> {
    chapter_layout_service::get_chapter_layout(book_path, chapter_paths)
}

#[tauri::command]
pub fn save_chapter_layout(book_path: String, layout: ChapterLayout) -> Result<(), String> {
    chapter_layout_service::save_chapter_layout(book_path, layout)
}