

mod commands;
mod models;
mod services;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::file::open_file_by_dialog,
            commands::file::save_file_content,
            commands::file::save_file_as
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
