use serde::Serialize;

#[derive(Serialize)]
pub struct OpenedFile {
  pub path: String,
  pub name: String,
  pub content: String,
}

