use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VolumeItem {
    pub id: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum LayoutEntry {
    Volume { id: String },
    Chapter { path: String },
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ChapterLayout {
    #[serde(default)]
    pub volumes: Vec<VolumeItem>,
    #[serde(default)]
    pub root_order: Vec<LayoutEntry>,
    #[serde(default)]
    pub volume_chapters: HashMap<String, Vec<String>>,
}

fn layout_path(book_dir: &Path) -> std::path::PathBuf {
    book_dir.join(".glyph").join("chapter-layout.json")
}

fn read_layout_file(book_dir: &Path) -> ChapterLayout {
    let path = layout_path(book_dir);
    if let Ok(bytes) = fs::read(&path) {
        if let Ok(layout) = serde_json::from_slice::<ChapterLayout>(&bytes) {
            return layout;
        }
    }
    ChapterLayout::default()
}

fn write_layout_file(book_dir: &Path, layout: &ChapterLayout) -> Result<(), String> {
    let glyph_dir = book_dir.join(".glyph");
    fs::create_dir_all(&glyph_dir).map_err(|e| format!("创建 .glyph 失败: {}", e))?;
    let json = serde_json::to_string_pretty(layout).map_err(|e| e.to_string())?;
    fs::write(layout_path(book_dir), json).map_err(|e| format!("保存章节结构失败: {}", e))
}

/// 与磁盘章节列表对齐：剔除已删文件、补全新章节到根列表末尾。
pub fn reconcile_layout(mut layout: ChapterLayout, chapter_paths: &[String]) -> ChapterLayout {
    let valid: HashSet<&str> = chapter_paths.iter().map(|s| s.as_str()).collect();

    layout.volumes.retain(|v| !v.id.trim().is_empty());
    let volume_ids: HashSet<&str> = layout.volumes.iter().map(|v| v.id.as_str()).collect();

    let mut seen = HashSet::new();

    layout.root_order.retain(|entry| match entry {
        LayoutEntry::Volume { id } => volume_ids.contains(id.as_str()),
        LayoutEntry::Chapter { path } => {
            if valid.contains(path.as_str()) && seen.insert(path.clone()) {
                true
            } else {
                false
            }
        }
    });

    for paths in layout.volume_chapters.values_mut() {
        paths.retain(|p| valid.contains(p.as_str()) && seen.insert(p.clone()));
    }

    layout
        .volume_chapters
        .retain(|id, _| volume_ids.contains(id.as_str()));

    for id in volume_ids.iter().copied() {
        layout.volume_chapters.entry(id.to_string()).or_default();
    }

    for path in chapter_paths {
        if !seen.contains(path) {
            layout.root_order.push(LayoutEntry::Chapter {
                path: path.clone(),
            });
            seen.insert(path.clone());
        }
    }

    layout
}

pub fn get_chapter_layout(
    book_path: String,
    chapter_paths: Vec<String>,
) -> Result<ChapterLayout, String> {
    let book_dir = Path::new(&book_path);
    if !book_dir.exists() {
        return Err("书籍目录不存在".to_string());
    }
    let raw = read_layout_file(book_dir);
    let layout = reconcile_layout(raw, &chapter_paths);
    Ok(layout)
}

pub fn save_chapter_layout(book_path: String, layout: ChapterLayout) -> Result<(), String> {
    let book_dir = Path::new(&book_path);
    if !book_dir.exists() {
        return Err("书籍目录不存在".to_string());
    }
    write_layout_file(book_dir, &layout)
}
