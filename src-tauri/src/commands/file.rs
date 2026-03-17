use crate::models::file_model::OpenedFile;
use crate::services::file_service;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn open_file_by_dialog(app: AppHandle) -> Result<Option<OpenedFile>, String> {
    let (tx, rx) = std::sync::mpsc::channel();

    app.dialog()
        .file()
        .add_filter("Markdown", &["md", "markdown", "txt"])
        .pick_file(move |file_path| {
            let _ = tx.send(file_path);
        });

    let selected = rx.recv().map_err(|_| "Dialog canceled".to_string())?;

    let Some(file_path) = selected else {
        return Ok(None);
    };

    let path_buf = file_path
        .into_path()
        .map_err(|_| "Failed to resolve path".to_string())?;

    let path = path_buf.to_string_lossy().to_string();
    let name = file_service::file_name_from_path(&path);
    let content = file_service::read_file(&path)?;

    Ok(Some(OpenedFile {
        path,
        name,
        content,
    }))
}

#[tauri::command]
pub fn save_file_content(path: String, content: String) -> Result<(), String> {
    file_service::write_file(&path, &content)
}

#[tauri::command]
pub async fn save_file_as(app: AppHandle, content: String) -> Result<Option<OpenedFile>, String> {
    let (tx, rx) = std::sync::mpsc::channel();

    app.dialog().file().save_file(move |file_path| {
        let _ = tx.send(file_path);
    });

    let selected = rx.recv().map_err(|_| "Dialog canceled".to_string())?;

    let Some(file_path) = selected else {
        return Ok(None);
    };

    let path_buf = file_path
        .into_path()
        .map_err(|_| "Failed to resolve path".to_string())?;

    let path = path_buf.to_string_lossy().to_string();
    let name = file_service::file_name_from_path(&path);

    file_service::write_file(&path, &content)?;

    Ok(Some(OpenedFile { path, name, content }))
}