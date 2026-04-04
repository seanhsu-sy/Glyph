use crate::services::book_service;
use crate::services::book_service::BookItem;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

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

#[tauri::command]
pub fn set_book_group(book_folder_path: String, group: String) -> Result<(), String> {
    book_service::set_book_group(book_folder_path, group)
}

#[tauri::command]
pub fn clear_book_cover(book_folder_path: String) -> Result<(), String> {
    book_service::clear_book_cover(book_folder_path)
}

#[tauri::command]
pub fn get_book_cover_data_url(book_folder_path: String) -> Result<Option<String>, String> {
    book_service::get_cover_data_url(book_folder_path)
}

#[tauri::command]
pub async fn pick_and_set_book_cover(
    app: AppHandle,
    book_folder_path: String,
) -> Result<Option<String>, String> {
    let book_dir = std::path::PathBuf::from(&book_folder_path);
    if !book_dir.is_dir() {
        return Err("书籍不存在".to_string());
    }

    let (tx, rx) = std::sync::mpsc::channel();

    app.dialog()
        .file()
        .add_filter(
            "Image",
            &[
                "png", "jpg", "jpeg", "webp", "gif", "bmp",
            ],
        )
        .pick_file(move |file_path| {
            let _ = tx.send(file_path);
        });

    let selected = rx.recv().map_err(|_| "Dialog canceled".to_string())?;

    let Some(file_path) = selected else {
        return Ok(None);
    };

    let path_buf = file_path
        .into_path()
        .map_err(|_| "Failed to resolve selected file path".to_string())?;

    let src = path_buf
        .to_str()
        .ok_or("Invalid source path".to_string())?
        .to_string();

    let out = book_service::set_cover_from_file(book_folder_path, src)?;
    Ok(Some(out))
}
