use std::fs;
use std::path::Path;

pub fn read_file(path: &str) -> Result<String, String> {
  fs::read_to_string(path).map_err(|e| e.to_string())
}

pub fn write_file(path: &str, content: &str) -> Result<(), String> {
  fs::write(path, content).map_err(|e| e.to_string())
}

pub fn file_name_from_path(path: &str) -> String {
  Path::new(path)
    .file_name()
    .and_then(|os| os.to_str())
    .unwrap_or_default()
    .to_string()
}

