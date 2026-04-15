use std::fs;
use std::path::Path;

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
        .map_err(|_| "Failed to resolve selected file path".to_string())?;

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

/// 将未命名草稿直接写入当前书籍文件夹（Untitled.md，若已存在则 Untitled-2.md …），不弹系统对话框。
#[tauri::command]
pub fn save_untitled_in_book(book_folder_path: String, content: String) -> Result<String, String> {
    let base = Path::new(&book_folder_path);
    if !base.is_dir() {
        return Err("书籍目录无效或不存在".to_string());
    }

    for i in 0..1000 {
        let name = if i == 0 {
            "Untitled.md".to_string()
        } else {
            format!("Untitled-{}.md", i + 1)
        };
        let path = base.join(&name);
        if !path.exists() {
            let path_str = path.to_string_lossy().to_string();
            file_service::write_file(&path_str, &content)?;
            return Ok(path_str);
        }
    }

    Err("无法在书籍目录中创建 Untitled 文件".to_string())
}

#[tauri::command]
pub async fn save_file_as(app: AppHandle, content: String) -> Result<Option<String>, String> {
    let (tx, rx) = std::sync::mpsc::channel();

    app.dialog()
        .file()
        .add_filter("Markdown", &["md", "markdown", "txt"])
        .set_file_name("Untitled.md")
        .save_file(move |file_path| {
            let _ = tx.send(file_path);
        });

    let selected = rx.recv().map_err(|_| "Dialog canceled".to_string())?;

    let Some(file_path) = selected else {
        return Ok(None);
    };

    let path_buf = file_path
        .into_path()
        .map_err(|_| "Failed to resolve selected save path".to_string())?;

    let path = path_buf.to_string_lossy().to_string();

    file_service::write_file(&path, &content)?;

    Ok(Some(path))
}
#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("读取文件失败: {}", e))?;

    Ok(content)
}

/// 写入前确保父目录存在（用于 `.glyph/` 下配置文件等）。
#[tauri::command]
pub fn write_file_ensuring_parent(path: String, content: String) -> Result<(), String> {
    let p = Path::new(&path);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
    }
    file_service::write_file(&path, &content)
}