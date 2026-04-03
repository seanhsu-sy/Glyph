use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BookItem {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub folder_name: String,
    pub folder_path: String,
    pub updated_at: String,
    pub document_count: usize,
}

fn get_books_root() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("无法获取用户目录")?;
    Ok(home.join("Documents").join("GlyphBooks"))
}

fn ensure_books_root() -> Result<PathBuf, String> {
    let root = get_books_root()?;

    if !root.exists() {
        fs::create_dir_all(&root).map_err(|e| format!("创建书库目录失败: {}", e))?;
    }

    if !root.is_dir() {
        return Err(format!("书库路径不是文件夹：{}", root.to_string_lossy()));
    }

    Ok(root)
}

fn count_markdown_files(dir: &Path) -> usize {
    let mut count = 0;

    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();

            if path.is_file() {
                if let Some(ext) = path.extension() {
                    if ext.to_string_lossy().to_lowercase() == "md" {
                        count += 1;
                    }
                }
            }
        }
    }

    count
}

fn format_modified_date(path: &Path) -> String {
    let modified = fs::metadata(path).and_then(|meta| meta.modified()).ok();

    if let Some(time) = modified {
        let datetime: chrono::DateTime<chrono::Local> = time.into();
        return datetime.format("%Y-%m-%d").to_string();
    }

    "unknown".to_string()
}

fn build_book_item(path: &Path) -> Result<BookItem, String> {
    let folder_name = path
        .file_name()
        .ok_or("无效的书籍文件夹名称")?
        .to_string_lossy()
        .to_string();

    let document_count = count_markdown_files(path);
    let updated_at = format_modified_date(path);

    Ok(BookItem {
        id: folder_name.clone(),
        title: folder_name.clone(),
        description: None,
        folder_name: folder_name.clone(),
        folder_path: path.to_string_lossy().to_string(),
        updated_at,
        document_count,
    })
}

fn sanitize_book_title(title: &str) -> String {
    let invalid_chars = ['/', '\\', ':', '*', '?', '"', '<', '>', '|'];

    title
        .trim()
        .chars()
        .filter(|c| !invalid_chars.contains(c))
        .collect::<String>()
}

pub fn list_books() -> Result<Vec<BookItem>, String> {
    let root = ensure_books_root()?;
    let mut books: Vec<BookItem> = vec![];

    let entries = fs::read_dir(&root).map_err(|e| e.to_string())?;

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();

        if !path.is_dir() {
            continue;
        }

        let book = build_book_item(&path)?;
        books.push(book);
    }

    books.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));

    Ok(books)
}

pub fn create_book(title: String) -> Result<BookItem, String> {
    let root = ensure_books_root()?;

    let safe_title = sanitize_book_title(&title);
    if safe_title.trim().is_empty() {
        return Err("书名不能为空".to_string());
    }

    let book_dir = root.join(&safe_title);

    if book_dir.exists() {
        return Err("已存在同名书籍".to_string());
    }

    fs::create_dir_all(&book_dir).map_err(|e| format!("创建书籍文件夹失败: {}", e))?;

    let default_doc_path = book_dir.join("未命名.md");
    fs::write(&default_doc_path, "").map_err(|e| format!("创建默认文档失败: {}", e))?;

    build_book_item(&book_dir)
}

pub fn delete_book(folder_path: String) -> Result<(), String> {
    let book_dir = PathBuf::from(&folder_path);

    if !book_dir.exists() {
        return Err("书籍不存在".to_string());
    }

    if !book_dir.is_dir() {
        return Err("目标不是书籍文件夹".to_string());
    }

    fs::remove_dir_all(&book_dir).map_err(|e| format!("删除书籍失败: {}", e))?;

    Ok(())
}

pub fn rename_book(folder_path: String, new_title: String) -> Result<bool, String> {
    let old_path = PathBuf::from(&folder_path);

    if !old_path.exists() {
        return Err("书不存在".to_string());
    }

    if !old_path.is_dir() {
        return Err("目标不是书籍文件夹".to_string());
    }

    let parent = old_path.parent().ok_or("无法获取父目录".to_string())?;

    let safe_title = sanitize_book_title(&new_title);
    if safe_title.trim().is_empty() {
        return Err("新书名不能为空".to_string());
    }

    let new_path = parent.join(safe_title);

    if new_path.exists() && new_path != old_path {
        return Err("已存在同名书".to_string());
    }

    fs::rename(&old_path, &new_path).map_err(|e| format!("重命名失败: {}", e))?;

    Ok(true)
}