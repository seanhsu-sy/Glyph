mod commands;
mod models;
mod services;

use commands::document::*;
use commands::file::*;
use commands::library::*;
use commands::stats::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
        open_file_by_dialog,
        read_file,
        save_file_content,
        save_untitled_in_book,
        save_file_as,
        list_books,
        create_book,
        delete_book,
        rename_book,
        list_documents,
        create_document,
        delete_document,
        rename_document,
        append_writing_log,
        get_writing_summary_by_date,
        get_writing_logs_by_date,
        get_daily_stats,
        get_stats_overview,
        get_weekly_stats,
        get_monthly_stats
    ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}