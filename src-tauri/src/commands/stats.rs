use chrono::{Datelike, Duration, Local, NaiveDate};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

use crate::services::book_service;
use crate::services::document_service;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WritingLog {
    pub id: String,
    pub book_id: String,
    pub doc_path: String,
    pub date: String, // YYYY-MM-DD
    pub start_time: i64,
    pub end_time: i64,
    pub duration_ms: i64,
    pub word_delta: i64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WritingLogInput {
    pub book_id: String,
    pub doc_path: String,
    pub date: String,
    pub start_time: i64,
    pub end_time: i64,
    pub duration_ms: i64,
    pub word_delta: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DailyWritingSummary {
    pub date: String,
    pub total_words: i64,
    pub total_duration_ms: i64,
    pub sessions: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DailyStat {
    pub date: String,
    pub total_words: i64,
    pub total_duration_ms: i64,
    pub sessions: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StatsOverview {
    pub total_words: i64,
    pub total_duration_ms: i64,
    pub total_sessions: i64,
    pub total_writing_days: i64,
    pub current_streak_days: i64,
    pub longest_streak_days: i64,
    pub average_words_per_day: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PeriodStat {
    pub label: String,
    pub total_words: i64,
    pub total_duration_ms: i64,
    pub sessions: i64,
    pub active_days: i64,
}

#[derive(Debug, Serialize, Deserialize)]
struct WritingLogFile {
    logs: Vec<WritingLog>,
}

fn stats_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取 app 数据目录失败: {}", e))?;

    fs::create_dir_all(&app_dir).map_err(|e| format!("创建 app 数据目录失败: {}", e))?;

    Ok(app_dir.join("writing_logs.json"))
}

fn read_log_file(path: &PathBuf) -> Result<WritingLogFile, String> {
    if !path.exists() {
        return Ok(WritingLogFile { logs: vec![] });
    }

    let content = fs::read_to_string(path).map_err(|e| format!("读取日志文件失败: {}", e))?;

    if content.trim().is_empty() {
        return Ok(WritingLogFile { logs: vec![] });
    }

    serde_json::from_str::<WritingLogFile>(&content)
        .map_err(|e| format!("解析日志文件失败: {}", e))
}

fn write_log_file(path: &PathBuf, data: &WritingLogFile) -> Result<(), String> {
    let content =
        serde_json::to_string_pretty(data).map_err(|e| format!("序列化日志文件失败: {}", e))?;

    fs::write(path, content).map_err(|e| format!("写入日志文件失败: {}", e))
}

fn filter_logs_by_book(logs: Vec<WritingLog>, book_id: Option<String>) -> Vec<WritingLog> {
    match book_id {
        Some(book_id) => logs
            .into_iter()
            .filter(|log| log.book_id == book_id)
            .collect(),
        None => logs,
    }
}

fn total_net_words_from_files(book_id: Option<&String>) -> Result<i64, String> {
    match book_id {
        Some(id) => {
            let books = book_service::list_books()?;
            let book = books
                .into_iter()
                .find(|b| &b.id == id)
                .ok_or_else(|| "书籍不存在".to_string())?;
            document_service::sum_word_count_for_book_path(book.folder_path)
        }
        None => {
            let books = book_service::list_books()?;
            let mut sum = 0_i64;
            for b in books {
                sum += document_service::sum_word_count_for_book_path(b.folder_path)?;
            }
            Ok(sum)
        }
    }
}

fn build_daily_stats_from_logs(logs: &[WritingLog]) -> Vec<DailyStat> {
    let mut map: BTreeMap<String, DailyStat> = BTreeMap::new();

    for log in logs {
        let entry = map.entry(log.date.clone()).or_insert(DailyStat {
            date: log.date.clone(),
            total_words: 0,
            total_duration_ms: 0,
            sessions: 0,
        });

        entry.total_words += log.word_delta;
        entry.total_duration_ms += log.duration_ms;
        entry.sessions += 1;
    }

    map.into_values().collect()
}

fn calculate_streaks(daily_stats: &[DailyStat]) -> (i64, i64) {
    // 有写作会话即算「活跃天」（含净删字为负数的日期），用于连续天数
    let active_days: Vec<&DailyStat> = daily_stats
        .iter()
        .filter(|item| item.sessions > 0)
        .collect();

    if active_days.is_empty() {
        return (0, 0);
    }

    let mut dates: Vec<NaiveDate> = active_days
        .iter()
        .filter_map(|item| NaiveDate::parse_from_str(&item.date, "%Y-%m-%d").ok())
        .collect();

    if dates.is_empty() {
        return (0, 0);
    }

    dates.sort();

    let mut longest_streak = 1_i64;
    let mut running_streak = 1_i64;

    for i in 1..dates.len() {
        if dates[i] == dates[i - 1] + Duration::days(1) {
            running_streak += 1;
        } else {
            running_streak = 1;
        }

        if running_streak > longest_streak {
            longest_streak = running_streak;
        }
    }

    let today = Local::now().date_naive();
    let date_set: HashSet<NaiveDate> = dates.iter().copied().collect();

    let mut current_streak = 0_i64;
    let mut cursor = today;

    loop {
        if date_set.contains(&cursor) {
            current_streak += 1;
            cursor -= Duration::days(1);
        } else {
            break;
        }
    }

    (current_streak, longest_streak)
}

#[tauri::command]
pub fn append_writing_log(app: AppHandle, input: WritingLogInput) -> Result<(), String> {
    if input.book_id.trim().is_empty() {
        return Err("bookId 不能为空".to_string());
    }

    if input.doc_path.trim().is_empty() {
        return Err("docPath 不能为空".to_string());
    }

    if input.date.trim().is_empty() {
        return Err("date 不能为空".to_string());
    }

    if input.duration_ms <= 0 {
        return Err("durationMs 必须大于 0".to_string());
    }

    if input.word_delta == 0 {
        return Err("wordDelta 不能为 0".to_string());
    }

    let path = stats_file_path(&app)?;
    let mut file = read_log_file(&path)?;

    let log = WritingLog {
        id: format!("{}::{}::{}", input.book_id, input.doc_path, input.start_time),
        book_id: input.book_id,
        doc_path: input.doc_path,
        date: input.date,
        start_time: input.start_time,
        end_time: input.end_time,
        duration_ms: input.duration_ms,
        word_delta: input.word_delta,
    };

    file.logs.push(log);
    write_log_file(&path, &file)
}

#[tauri::command]
pub fn get_writing_summary_by_date(
    app: AppHandle,
    date: String,
    book_id: Option<String>,
) -> Result<DailyWritingSummary, String> {
    let path = stats_file_path(&app)?;
    let file = read_log_file(&path)?;
    let logs = filter_logs_by_book(file.logs, book_id);

    let mut total_words = 0_i64;
    let mut total_duration_ms = 0_i64;
    let mut sessions = 0_i64;

    for log in logs.iter().filter(|log| log.date == date) {
        total_words += log.word_delta;
        total_duration_ms += log.duration_ms;
        sessions += 1;
    }

    Ok(DailyWritingSummary {
        date,
        total_words,
        total_duration_ms,
        sessions,
    })
}

#[tauri::command]
pub fn get_writing_logs_by_date(
    app: AppHandle,
    date: String,
    book_id: Option<String>,
) -> Result<Vec<WritingLog>, String> {
    let path = stats_file_path(&app)?;
    let file = read_log_file(&path)?;
    let logs = filter_logs_by_book(file.logs, book_id);

    let mut result: Vec<WritingLog> = logs
        .into_iter()
        .filter(|log| log.date == date)
        .collect();

    result.sort_by(|a, b| a.start_time.cmp(&b.start_time));
    Ok(result)
}

#[tauri::command]
pub fn get_daily_stats(
    app: AppHandle,
    book_id: Option<String>,
) -> Result<Vec<DailyStat>, String> {
    let path = stats_file_path(&app)?;
    let file = read_log_file(&path)?;
    let logs = filter_logs_by_book(file.logs, book_id);

    Ok(build_daily_stats_from_logs(&logs))
}

#[tauri::command]
pub fn get_stats_overview(
    app: AppHandle,
    book_id: Option<String>,
) -> Result<StatsOverview, String> {
    let path = stats_file_path(&app)?;
    let file = read_log_file(&path)?;

    let total_words = total_net_words_from_files(book_id.as_ref())?;
    let logs = filter_logs_by_book(file.logs, book_id);

    let daily_stats = build_daily_stats_from_logs(&logs);
    let total_duration_ms: i64 = logs.iter().map(|log| log.duration_ms).sum();
    let total_sessions = logs.len() as i64;

    let active_days_count = daily_stats
        .iter()
        .filter(|item| item.sessions > 0)
        .count() as i64;

    let average_words_per_day = if active_days_count > 0 {
        let word_sum: i64 = daily_stats
            .iter()
            .filter(|item| item.sessions > 0)
            .map(|item| item.total_words)
            .sum();
        word_sum / active_days_count
    } else {
        0
    };

    let (current_streak_days, longest_streak_days) = calculate_streaks(&daily_stats);

    Ok(StatsOverview {
        total_words,
        total_duration_ms,
        total_sessions,
        total_writing_days: active_days_count,
        current_streak_days,
        longest_streak_days,
        average_words_per_day,
    })
}

#[tauri::command]
pub fn get_weekly_stats(
    app: AppHandle,
    book_id: Option<String>,
) -> Result<Vec<PeriodStat>, String> {
    let path = stats_file_path(&app)?;
    let file = read_log_file(&path)?;
    let logs = filter_logs_by_book(file.logs, book_id);

    let mut stats_map: BTreeMap<String, PeriodStat> = BTreeMap::new();
    let mut active_days_map: HashMap<String, HashSet<String>> = HashMap::new();

    for log in logs {
        let date = NaiveDate::parse_from_str(&log.date, "%Y-%m-%d")
            .map_err(|e| format!("日期解析失败: {}", e))?;

        let iso_week = date.iso_week();
        let label = format!("{}-W{:02}", iso_week.year(), iso_week.week());

        let entry = stats_map.entry(label.clone()).or_insert(PeriodStat {
            label: label.clone(),
            total_words: 0,
            total_duration_ms: 0,
            sessions: 0,
            active_days: 0,
        });

        entry.total_words += log.word_delta;
        entry.total_duration_ms += log.duration_ms;
        entry.sessions += 1;

        active_days_map
            .entry(label)
            .or_default()
            .insert(log.date.clone());
    }

    let mut result: Vec<PeriodStat> = stats_map.into_values().collect();

    for item in &mut result {
        item.active_days = active_days_map
            .get(&item.label)
            .map(|set| set.len() as i64)
            .unwrap_or(0);
    }

    Ok(result)
}

#[tauri::command]
pub fn get_monthly_stats(
    app: AppHandle,
    book_id: Option<String>,
) -> Result<Vec<PeriodStat>, String> {
    let path = stats_file_path(&app)?;
    let file = read_log_file(&path)?;
    let logs = filter_logs_by_book(file.logs, book_id);

    let mut stats_map: BTreeMap<String, PeriodStat> = BTreeMap::new();
    let mut active_days_map: HashMap<String, HashSet<String>> = HashMap::new();

    for log in logs {
        let date = NaiveDate::parse_from_str(&log.date, "%Y-%m-%d")
            .map_err(|e| format!("日期解析失败: {}", e))?;

        let label = format!("{}-{:02}", date.year(), date.month());

        let entry = stats_map.entry(label.clone()).or_insert(PeriodStat {
            label: label.clone(),
            total_words: 0,
            total_duration_ms: 0,
            sessions: 0,
            active_days: 0,
        });

        entry.total_words += log.word_delta;
        entry.total_duration_ms += log.duration_ms;
        entry.sessions += 1;

        active_days_map
            .entry(label)
            .or_default()
            .insert(log.date.clone());
    }

    let mut result: Vec<PeriodStat> = stats_map.into_values().collect();

    for item in &mut result {
        item.active_days = active_days_map
            .get(&item.label)
            .map(|set| set.len() as i64)
            .unwrap_or(0);
    }

    Ok(result)
}