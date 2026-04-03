use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentItem {
    pub name: String,
    pub path: String,
    pub word_count: usize,
    pub kind: String, // "chapter" | "outline"
}

fn sanitize_title(title: &str) -> String {
    let invalid_chars = ['/', '\\', ':', '*', '?', '"', '<', '>', '|'];

    title
        .trim()
        .chars()
        .filter(|c| !invalid_chars.contains(c))
        .collect::<String>()
}

fn ensure_md_extension(name: &str) -> String {
    if name.to_lowercase().ends_with(".md") {
        name.to_string()
    } else {
        format!("{}.md", name)
    }
}

fn count_words(text: &str) -> usize {
    if text.trim().is_empty() {
        return 0;
    }

    let cjk_count = text
        .chars()
        .filter(|c| {
            ('\u{4E00}'..='\u{9FFF}').contains(c) || ('\u{3400}'..='\u{4DBF}').contains(c)
        })
        .count();

    let latin_count = text
        .split_whitespace()
        .filter(|s| s.chars().any(|c| c.is_ascii_alphanumeric()))
        .count();

    cjk_count + latin_count
}

fn get_kind_and_display_name(path: &Path) -> (String, String) {
    let raw_name = path
        .file_name()
        .unwrap()
        .to_string_lossy()
        .to_string();

    if raw_name.starts_with("_outline_") {
        (
            "outline".to_string(),
            raw_name.trim_start_matches("_outline_").to_string(),
        )
    } else {
        ("chapter".to_string(), raw_name)
    }
}

fn build_document_item(path: &Path) -> Result<DocumentItem, String> {
    let content = fs::read_to_string(path).unwrap_or_default();
    let word_count = count_words(&content);
    let (kind, name) = get_kind_and_display_name(path);

    Ok(DocumentItem {
        name,
        path: path.to_string_lossy().to_string(),
        word_count,
        kind,
    })
}

pub fn list_documents(book_path: String) -> Result<Vec<DocumentItem>, String> {
    let path = Path::new(&book_path);

    if !path.exists() {
        return Err("书籍目录不存在".to_string());
    }

    let mut docs = vec![];
    let entries = fs::read_dir(path).map_err(|e| e.to_string())?;

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let p = entry.path();

        if p.is_file() {
            if let Some(ext) = p.extension() {
                if ext.to_string_lossy().to_lowercase() == "md" {
                    docs.push(build_document_item(&p)?);
                }
            }
        }
    }

    docs.sort_by(|a, b| {
        let kind_order_a = if a.kind == "chapter" { 0 } else { 1 };
        let kind_order_b = if b.kind == "chapter" { 0 } else { 1 };

        kind_order_a
            .cmp(&kind_order_b)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(docs)
}

pub fn create_document(
    book_path: String,
    title: String,
    kind: String,
) -> Result<DocumentItem, String> {
    let book_dir = PathBuf::from(&book_path);

    if !book_dir.exists() {
        return Err("书籍目录不存在".to_string());
    }

    if !book_dir.is_dir() {
        return Err("书籍路径不是文件夹".to_string());
    }

    let safe_title = sanitize_title(&title);
    if safe_title.trim().is_empty() {
        return Err("名称不能为空".to_string());
    }

    let mut file_name = ensure_md_extension(&safe_title);

    if kind == "outline" {
        file_name = format!("_outline_{}", file_name);
    }

    let file_path = book_dir.join(&file_name);

    if file_path.exists() {
        return Err("已存在同名文件".to_string());
    }

    fs::write(&file_path, "").map_err(|e| format!("创建失败: {}", e))?;

    build_document_item(&file_path)
}

pub fn delete_document(path: String) -> Result<(), String> {
    let file_path = PathBuf::from(&path);

    if !file_path.exists() {
        return Err("文件不存在".to_string());
    }

    if !file_path.is_file() {
        return Err("目标不是文件".to_string());
    }

    fs::remove_file(&file_path).map_err(|e| format!("删除失败: {}", e))?;

    Ok(())
}

pub fn rename_document(path: String, new_title: String) -> Result<DocumentItem, String> {
    let old_path = PathBuf::from(&path);

    if !old_path.exists() {
        return Err("文件不存在".to_string());
    }

    if !old_path.is_file() {
        return Err("目标不是文件".to_string());
    }

    let parent = old_path.parent().ok_or("无法获取所在目录".to_string())?;

    let safe_title = sanitize_title(&new_title);
    if safe_title.trim().is_empty() {
        return Err("新名称不能为空".to_string());
    }

    let old_raw_name = old_path
        .file_name()
        .unwrap()
        .to_string_lossy()
        .to_string();

    let is_outline = old_raw_name.starts_with("_outline_");

    let mut new_file_name = ensure_md_extension(&safe_title);
    if is_outline {
        new_file_name = format!("_outline_{}", new_file_name);
    }

    let new_path = parent.join(&new_file_name);

    if new_path.exists() && new_path != old_path {
        return Err("已存在同名文件".to_string());
    }

    fs::rename(&old_path, &new_path).map_err(|e| format!("重命名失败: {}", e))?;

    build_document_item(&new_path)
}