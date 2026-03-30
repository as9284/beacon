use futures_util::future::join_all;
use ignore::WalkBuilder;
use reqwest::Client;
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
    /// Pre-loaded text content (GitHub repos only; None for local projects).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
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

/// Walk a local directory and return a filtered list of source files,
/// with content pre-loaded for small text files (≤ 150 KB).
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
            content: None,
        });
    }

    // Pre-load content for up to 60 text files ≤ 150 KB, sorted by importance
    let mut candidates: Vec<(usize, u8)> = entries
        .iter()
        .enumerate()
        .filter(|(_, e)| e.is_text && e.size > 0 && e.size < 150_000)
        .map(|(i, e)| (i, content_priority(&e.relative_path)))
        .collect();
    candidates.sort_by_key(|&(_, priority)| priority);

    for (i, _) in candidates.into_iter().take(60) {
        if let Ok(text) = std::fs::read_to_string(&entries[i].path) {
            entries[i].content = Some(text);
        }
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

// ── GitHub repo indexing ─────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct GitHubRepoInfo {
    default_branch: String,
}

#[derive(Debug, Deserialize)]
struct GitHubTreeResponse {
    tree: Vec<GitHubTreeNode>,
}

#[derive(Debug, Deserialize)]
struct GitHubTreeNode {
    path: String,
    #[serde(rename = "type")]
    node_type: String,
    size: Option<u64>,
}

fn parse_github_owner_repo(url: &str) -> Result<(String, String), String> {
    let url = url.trim().trim_end_matches('/');
    let url = url
        .strip_prefix("https://")
        .or_else(|| url.strip_prefix("http://"))
        .or_else(|| url.strip_prefix("git@"))
        .unwrap_or(url);

    let after = url
        .strip_prefix("github.com/")
        .or_else(|| url.strip_prefix("github.com:"))
        .ok_or_else(|| format!("Not a valid GitHub URL: {url}"))?;

    let mut parts = after.splitn(3, '/');
    let owner = parts.next().unwrap_or("").to_string();
    let repo = parts
        .next()
        .unwrap_or("")
        .trim_end_matches(".git")
        .to_string();

    if owner.is_empty() || repo.is_empty() {
        return Err(format!("Could not parse owner/repo from URL: {url}"));
    }
    Ok((owner, repo))
}

fn build_github_client(token: Option<&str>) -> Result<Client, String> {
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        reqwest::header::USER_AGENT,
        reqwest::header::HeaderValue::from_static("beacon-app/1.0"),
    );
    headers.insert(
        reqwest::header::ACCEPT,
        reqwest::header::HeaderValue::from_static("application/vnd.github.v3+json"),
    );
    if let Some(t) = token {
        if let Ok(val) =
            reqwest::header::HeaderValue::from_str(&format!("Bearer {}", t))
        {
            headers.insert(reqwest::header::AUTHORIZATION, val);
        }
    }
    Client::builder()
        .default_headers(headers)
        .build()
        .map_err(|e| e.to_string())
}

async fn github_api_get<T: serde::de::DeserializeOwned>(
    client: &Client,
    url: &str,
) -> Result<T, String> {
    let resp = client.get(url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("GitHub API {}: {}", status, body));
    }
    resp.json::<T>().await.map_err(|e| e.to_string())
}

/// Priority rank for prefetching: 0 = most important, higher = less important.
fn content_priority(path: &str) -> u8 {
    let lower = path.to_ascii_lowercase();
    let name = lower.split('/').next_back().unwrap_or(&lower);
    match name {
        "readme.md" | "readme.txt" | "readme" | "readme.rst" => 0,
        "package.json" | "cargo.toml" | "go.mod" | "pyproject.toml"
        | "setup.py" | "build.gradle" | "pom.xml" => 1,
        _ if lower.ends_with(".toml")
            || lower.ends_with(".json")
            || lower.ends_with(".yaml")
            || lower.ends_with(".yml") =>
        {
            2
        }
        _ => 3,
    }
}

/// Fetch a GitHub repo's file tree and pre-load content for key text files.
/// Returns `Vec<FileEntry>` where text files ≤ 150 KB have `content` populated.
#[command]
pub async fn fetch_github_repo(
    github_url: String,
    token: Option<String>,
) -> Result<Vec<FileEntry>, String> {
    let (owner, repo) = parse_github_owner_repo(&github_url)?;
    let api_client = build_github_client(token.as_deref())?;

    // Step 1: resolve default branch
    let repo_info: GitHubRepoInfo = github_api_get(
        &api_client,
        &format!("https://api.github.com/repos/{owner}/{repo}"),
    )
    .await?;
    let branch = repo_info.default_branch;

    // Step 2: fetch the recursive file tree
    let tree: GitHubTreeResponse = github_api_get(
        &api_client,
        &format!(
            "https://api.github.com/repos/{owner}/{repo}/git/trees/{branch}?recursive=1"
        ),
    )
    .await?;

    // Step 3: build initial entries
    let mut entries: Vec<FileEntry> = tree
        .tree
        .into_iter()
        .filter(|n| n.node_type == "blob")
        .map(|n| {
            let is_text = is_likely_text(Path::new(&n.path));
            FileEntry {
                path: format!("github://{owner}/{repo}@{branch}/{}", n.path),
                relative_path: n.path,
                size: n.size.unwrap_or(0),
                is_text,
                content: None,
            }
        })
        .collect();

    // Step 4: choose up to 60 text files to prefetch (sorted by importance)
    let mut candidates: Vec<(usize, u8)> = entries
        .iter()
        .enumerate()
        .filter(|(_, e)| e.is_text && e.size > 0 && e.size < 150_000)
        .map(|(i, e)| (i, content_priority(&e.relative_path)))
        .collect();
    candidates.sort_by_key(|&(_, priority)| priority);
    let to_fetch: Vec<(usize, String)> = candidates
        .into_iter()
        .take(60)
        .map(|(i, _)| (i, entries[i].relative_path.clone()))
        .collect();

    // Step 5: fetch content concurrently from raw.githubusercontent.com
    let raw_base =
        format!("https://raw.githubusercontent.com/{owner}/{repo}/{branch}");
    let raw_client = build_github_client(token.as_deref())?;

    let fetch_results = join_all(to_fetch.into_iter().map(|(i, path)| {
        let url = format!("{raw_base}/{path}");
        let client = raw_client.clone();
        async move {
            let result = client
                .get(&url)
                .send()
                .await
                .map_err(|e| e.to_string());
            let content = match result {
                Ok(resp) if resp.status().is_success() => {
                    resp.text().await.ok()
                }
                _ => None,
            };
            (i, content)
        }
    }))
    .await;

    for (i, content) in fetch_results {
        if let Some(c) = content {
            entries[i].content = Some(c);
        }
    }

    Ok(entries)
}
