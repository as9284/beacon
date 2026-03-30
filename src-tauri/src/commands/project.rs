use ignore::WalkBuilder;
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::{command, AppHandle};
use tauri_plugin_dialog::DialogExt;

/// A file entry returned to the frontend.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileEntry {
    pub path: String,
    pub relative_path: String,
    pub size: u64,
    pub is_text: bool,
}

/// Open a native folder picker and return the chosen path.
#[command]
pub async fn pick_project_folder(app: AppHandle) -> Result<Option<String>, String> {
    let path = app
        .dialog()
        .file()
        .set_title("Select project folder")
        .blocking_pick_folder();

    Ok(path.map(|p| p.to_string()))
}

/// Walk a local directory and return a filtered list of source files.
#[command]
pub async fn index_local_project(root: String) -> Result<Vec<FileEntry>, String> {
    let root_path = Path::new(&root);
    if !root_path.exists() {
        return Err(format!("Path does not exist: {root}"));
    }

    let mut entries = Vec::new();
    for result in WalkBuilder::new(root_path)
        .hidden(false)
        .ignore(true)
        .git_ignore(true)
        .git_global(false)
        .max_depth(Some(12))
        .build()
    {
        let entry = result.map_err(|e| e.to_string())?;
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        if meta.is_dir() {
            continue;
        }

        let path = entry.path().to_string_lossy().to_string();
        let relative_path = entry
            .path()
            .strip_prefix(root_path)
            .unwrap_or(entry.path())
            .to_string_lossy()
            .to_string();

        let is_text = is_likely_text(entry.path());
        entries.push(FileEntry {
            path,
            relative_path,
            size: meta.len(),
            is_text,
        });
    }

    Ok(entries)
}

/// Read and return the text content of a single file.
#[command]
pub async fn read_file_content(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("File not found: {path}"));
    }

    // Refuse to read very large files (> 2 MB)
    let meta = std::fs::metadata(p).map_err(|e| e.to_string())?;
    if meta.len() > 2_097_152 {
        return Err(format!(
            "File too large to read directly ({}): {}",
            meta.len(),
            path
        ));
    }

    std::fs::read_to_string(p).map_err(|e| e.to_string())
}

// ── helpers ─────────────────────────────────────────────────────────────────

const TEXT_EXTENSIONS: &[&str] = &[
    "rs", "toml", "lock", "ts", "tsx", "js", "jsx", "mjs", "cjs", "json", "json5", "yaml", "yml",
    "md", "mdx", "txt", "html", "htm", "css", "scss", "sass", "less", "sh", "bash", "zsh", "fish",
    "py", "pyw", "rb", "go", "java", "kt", "swift", "c", "cpp", "cc", "h", "hpp", "cs", "php",
    "lua", "sql", "graphql", "gql", "env", "gitignore", "dockerfile", "makefile", "cmake", "xml",
    "vue", "svelte", "astro", "tf", "hcl", "proto", "prisma", "editorconfig",
];

fn is_likely_text(path: &Path) -> bool {
    if let Some(ext) = path.extension() {
        let ext_lower = ext.to_string_lossy().to_lowercase();
        return TEXT_EXTENSIONS.contains(&ext_lower.as_str());
    }
    // Extensionless files: allow common ones by name
    if let Some(name) = path.file_name() {
        let name_lower = name.to_string_lossy().to_lowercase();
        return matches!(
            name_lower.as_str(),
            "dockerfile"
                | "makefile"
                | "readme"
                | "license"
                | "changelog"
                | ".env"
                | ".gitignore"
                | ".gitattributes"
        );
    }
    false
}
