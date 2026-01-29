use serde::{Deserialize, Serialize};
use scraper::{Html, Selector};
use std::fs::{self, File};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use thiserror::Error;

const MAX_FILE_SIZE: u64 = 3 * 1024 * 1024; // 3MB
const MAX_LINES: usize = 50_000;
const PREVIEW_LINES: usize = 1000;

#[derive(Error, Debug)]
pub enum RepoError {
    #[error("Invalid GitHub URL: {0}")]
    InvalidUrl(String),
    #[error("HTTP request failed: {0}")]
    HttpError(#[from] reqwest::Error),
    #[error("IO error: {0}")]
    IoError(#[from] io::Error),
    #[error("ZIP extraction failed: {0}")]
    ZipError(#[from] zip::result::ZipError),
    #[error("JSON error: {0}")]
    JsonError(#[from] serde_json::Error),
    #[error("Repository not found: {0}")]
    RepoNotFound(String),
}

impl Serialize for RepoError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedGitHubUrl {
    pub owner: String,
    pub repo: String,
    pub branch: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoInfo {
    pub key: String,
    pub owner: String,
    pub repo: String,
    pub branch: String,
    pub imported_at: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileNode>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub repo_key: String,
    pub info: RepoInfo,
    pub tree: FileNode,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileContent {
    pub content: String,
    pub truncated: bool,
    pub total_lines: Option<usize>,
    pub language: String,
    pub is_binary: bool,
}

#[derive(Debug, Deserialize)]
struct GitHubRepoResponse {
    default_branch: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResultItem {
    pub full_name: String,
    pub description: Option<String>,
    pub stargazers_count: u64,
    pub html_url: String,
    pub owner: String,
    pub repo: String,
}

#[derive(Debug, Deserialize)]
struct GitHubSearchResponse {
    items: Vec<GitHubSearchItem>,
}

#[derive(Debug, Deserialize)]
struct GitHubSearchItem {
    full_name: String,
    description: Option<String>,
    stargazers_count: u64,
    html_url: String,
    owner: GitHubOwner,
    name: String,
}

#[derive(Debug, Deserialize)]
struct GitHubOwner {
    login: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrendingRepo {
    pub full_name: String,
    pub description: Option<String>,
    pub stars: Option<u64>,
    pub forks: Option<u64>,
    pub language: Option<String>,
    pub stars_today: Option<u64>,
    pub url: String,
    pub owner: String,
    pub repo: String,
}

pub async fn search_github_repos(query: &str, token: Option<&str>) -> Result<Vec<SearchResultItem>, RepoError> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }

    let client = reqwest::Client::new();
    let url = format!(
        "https://api.github.com/search/repositories?q={}&per_page=15&sort=stars&order=desc",
        urlencoding::encode(query)
    );

    let mut request = client
        .get(&url)
        .header("User-Agent", "RepoRead/0.1")
        .header("Accept", "application/vnd.github.v3+json");

    // Add token if provided
    if let Some(t) = token {
        if !t.is_empty() {
            request = request.header("Authorization", format!("Bearer {}", t));
        }
    }

    let response = request.send().await?;

    if !response.status().is_success() {
        return Err(RepoError::InvalidUrl(format!(
            "GitHub API error: HTTP {}",
            response.status()
        )));
    }

    let search_response: GitHubSearchResponse = response.json().await?;

    let results = search_response
        .items
        .into_iter()
        .map(|item| SearchResultItem {
            full_name: item.full_name,
            description: item.description,
            stargazers_count: item.stargazers_count,
            html_url: item.html_url,
            owner: item.owner.login,
            repo: item.name,
        })
        .collect();

    Ok(results)
}

fn parse_number(text: &str) -> Option<u64> {
    let digits: String = text
        .chars()
        .filter(|c| c.is_ascii_digit())
        .collect();
    if digits.is_empty() {
        None
    } else {
        digits.parse::<u64>().ok()
    }
}

fn element_text(element: &scraper::ElementRef<'_>) -> String {
    element.text().collect::<Vec<_>>().join("").trim().to_string()
}

pub async fn fetch_trending_repos(
    language: Option<&str>,
    since: &str,
    spoken_language: Option<&str>,
) -> Result<Vec<TrendingRepo>, RepoError> {
    let mut url = if let Some(lang) = language {
        let lang = lang.trim();
        if lang.is_empty() {
            "https://github.com/trending".to_string()
        } else {
            format!("https://github.com/trending/{}", urlencoding::encode(lang))
        }
    } else {
        "https://github.com/trending".to_string()
    };

    let mut params = Vec::new();
    if !since.trim().is_empty() {
        params.push(format!("since={}", since.trim()));
    }
    if let Some(code) = spoken_language {
        let code = code.trim();
        if !code.is_empty() {
            params.push(format!("spoken_language_code={}", code));
        }
    }
    if !params.is_empty() {
        url.push('?');
        url.push_str(&params.join("&"));
    }

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .header("User-Agent", "RepoRead/0.1")
        .header("Accept", "text/html")
        .send()
        .await?;

    if !response.status().is_success() {
        return Err(RepoError::InvalidUrl(format!(
            "GitHub Trending error: HTTP {}",
            response.status()
        )));
    }

    let html = response.text().await?;
    let document = Html::parse_document(&html);
    let article_selector = Selector::parse("article.Box-row").unwrap();
    let title_selector = Selector::parse("h2 a").unwrap();
    let desc_selector = Selector::parse("p.col-9").unwrap();
    let lang_selector = Selector::parse("span[itemprop=\"programmingLanguage\"]").unwrap();
    let stars_selector = Selector::parse("a[href$=\"/stargazers\"]").unwrap();
    let forks_selector = Selector::parse("a[href$=\"/forks\"]").unwrap();
    let today_selector = Selector::parse("span.d-inline-block.float-sm-right").unwrap();

    let mut results = Vec::new();

    for article in document.select(&article_selector) {
        let link = match article.select(&title_selector).next() {
            Some(link) => link,
            None => continue,
        };
        let href = match link.value().attr("href") {
            Some(href) => href.trim(),
            None => continue,
        };
        let href = href.trim_start_matches('/');
        let mut parts = href.split('/');
        let owner = match parts.next() {
            Some(owner) if !owner.is_empty() => owner.to_string(),
            _ => continue,
        };
        let repo = match parts.next() {
            Some(repo) if !repo.is_empty() => repo.to_string(),
            _ => continue,
        };
        let full_name = format!("{}/{}", owner, repo);
        let url = format!("https://github.com/{}/{}", owner, repo);

        let description = article
            .select(&desc_selector)
            .next()
            .map(|el| element_text(&el))
            .filter(|text| !text.is_empty());

        let language = article
            .select(&lang_selector)
            .next()
            .map(|el| element_text(&el))
            .filter(|text| !text.is_empty());

        let stars = article
            .select(&stars_selector)
            .next()
            .and_then(|el| parse_number(&element_text(&el)));

        let forks = article
            .select(&forks_selector)
            .next()
            .and_then(|el| parse_number(&element_text(&el)));

        let stars_today = article
            .select(&today_selector)
            .next()
            .and_then(|el| parse_number(&element_text(&el)));

        results.push(TrendingRepo {
            full_name,
            description,
            stars,
            forks,
            language,
            stars_today,
            url,
            owner,
            repo,
        });
    }

    Ok(results)
}

// Settings management
fn get_settings_path() -> PathBuf {
    directories::ProjectDirs::from("com", "xnu", "RepoRead")
        .map(|dirs| dirs.config_dir().to_path_buf())
        .unwrap_or_else(|| PathBuf::from("./config"))
        .join("settings.json")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub github_token: Option<String>,
    #[serde(default = "default_true")]
    pub copy_screenshot_to_clipboard: bool,
    pub openrouter_api_key: Option<String>,
    #[serde(default = "default_interpret_prompt")]
    pub interpret_prompt: String,
    #[serde(default = "default_model")]
    pub interpret_model: String,
}

fn default_true() -> bool {
    true
}

fn default_interpret_prompt() -> String {
    "This is {language} code from the {project} project. Please interpret the following code in under 500 words:\n\n```{language}\n{code}\n```".to_string()
}

fn default_model() -> String {
    "anthropic/claude-sonnet-4".to_string()
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            github_token: None,
            copy_screenshot_to_clipboard: true,
            openrouter_api_key: None,
            interpret_prompt: default_interpret_prompt(),
            interpret_model: default_model(),
        }
    }
}

pub fn load_settings() -> AppSettings {
    let path = get_settings_path();
    if let Ok(content) = fs::read_to_string(&path) {
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        AppSettings::default()
    }
}

pub fn save_settings(settings: &AppSettings) -> Result<(), RepoError> {
    let path = get_settings_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(settings)?;
    fs::write(path, json)?;
    Ok(())
}

fn get_favorites_path() -> PathBuf {
    directories::ProjectDirs::from("com", "xnu", "RepoRead")
        .map(|dirs| dirs.config_dir().to_path_buf())
        .unwrap_or_else(|| PathBuf::from("./config"))
        .join("favorites.json")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FavoriteRepo {
    pub owner: String,
    pub repo: String,
    pub url: String,
    pub description: Option<String>,
    pub language: Option<String>,
    pub stars: Option<u64>,
    pub added_at: String,
}

pub fn load_favorites() -> Vec<FavoriteRepo> {
    let path = get_favorites_path();
    if let Ok(content) = fs::read_to_string(&path) {
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        Vec::new()
    }
}

pub fn save_favorites(favorites: &[FavoriteRepo]) -> Result<(), RepoError> {
    let path = get_favorites_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(favorites)?;
    fs::write(path, json)?;
    Ok(())
}

pub fn export_favorites(path: &Path, format: &str) -> Result<(), RepoError> {
    let favorites = load_favorites();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    match format {
        "json" => {
            let json = serde_json::to_string_pretty(&favorites)?;
            fs::write(path, json)?;
        }
        "markdown" => {
            let mut out = String::new();
            out.push_str("# RepoRead Favorites\n\n");
            for fav in favorites {
                let desc = fav
                    .description
                    .as_ref()
                    .map(|d| format!(" — {}", d.trim()))
                    .unwrap_or_default();
                let lang = fav
                    .language
                    .as_ref()
                    .map(|l| format!(" · {}", l))
                    .unwrap_or_default();
                out.push_str(&format!(
                    "- [{}]({}){}{}\n",
                    format!("{}/{}", fav.owner, fav.repo),
                    fav.url,
                    desc,
                    lang
                ));
            }
            fs::write(path, out)?;
        }
        _ => {
            return Err(RepoError::InvalidUrl(format!(
                "Unsupported export format: {}",
                format
            )));
        }
    }

    Ok(())
}

pub fn parse_github_url(url: &str) -> Result<ParsedGitHubUrl, RepoError> {
    let url = url.trim().trim_end_matches('/');

    // Remove protocol
    let path = url
        .strip_prefix("https://github.com/")
        .or_else(|| url.strip_prefix("http://github.com/"))
        .or_else(|| url.strip_prefix("github.com/"))
        .ok_or_else(|| RepoError::InvalidUrl("Not a GitHub URL".into()))?;

    let parts: Vec<&str> = path.split('/').collect();

    if parts.len() < 2 {
        return Err(RepoError::InvalidUrl("Missing owner or repo".into()));
    }

    let owner = parts[0].to_string();
    let repo = parts[1].to_string();

    // Check for /tree/<branch> pattern
    let branch = if parts.len() >= 4 && parts[2] == "tree" {
        Some(parts[3..].join("/"))
    } else {
        None
    };

    Ok(ParsedGitHubUrl { owner, repo, branch })
}

pub async fn get_default_branch(owner: &str, repo: &str) -> Result<String, RepoError> {
    let client = reqwest::Client::new();
    let url = format!("https://api.github.com/repos/{}/{}", owner, repo);

    let response = client
        .get(&url)
        .header("User-Agent", "RepoRead/0.1")
        .header("Accept", "application/vnd.github.v3+json")
        .send()
        .await?;

    if !response.status().is_success() {
        // Fallback to "main" if API fails
        return Ok("main".to_string());
    }

    let repo_info: GitHubRepoResponse = response.json().await?;
    Ok(repo_info.default_branch)
}

pub async fn download_repo_zip(
    owner: &str,
    repo: &str,
    branch: &str,
    dest_path: &Path,
) -> Result<(), RepoError> {
    let zip_url = format!(
        "https://codeload.github.com/{}/{}/zip/refs/heads/{}",
        owner, repo, branch
    );

    let client = reqwest::Client::new();
    let response = client
        .get(&zip_url)
        .header("User-Agent", "RepoRead/0.1")
        .send()
        .await?;

    if !response.status().is_success() {
        return Err(RepoError::InvalidUrl(format!(
            "Failed to download: HTTP {}",
            response.status()
        )));
    }

    let bytes = response.bytes().await?;

    // Create parent directory
    if let Some(parent) = dest_path.parent() {
        fs::create_dir_all(parent)?;
    }

    let mut file = File::create(dest_path)?;
    file.write_all(&bytes)?;

    Ok(())
}

pub fn extract_zip(zip_path: &Path, dest_dir: &Path) -> Result<String, RepoError> {
    let file = File::open(zip_path)?;
    let mut archive = zip::ZipArchive::new(file)?;

    // Get root folder name (GitHub adds repo-branch prefix)
    let root_name = archive
        .by_index(0)?
        .name()
        .split('/')
        .next()
        .unwrap_or("")
        .to_string();

    for i in 0..archive.len() {
        let mut file = archive.by_index(i)?;
        let name = file.name().to_string();

        // Skip the root folder prefix
        let relative_path = name
            .strip_prefix(&format!("{}/", root_name))
            .unwrap_or(&name);

        if relative_path.is_empty() {
            continue;
        }

        let out_path = dest_dir.join(relative_path);

        if file.is_dir() {
            fs::create_dir_all(&out_path)?;
        } else {
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent)?;
            }
            let mut outfile = File::create(&out_path)?;
            io::copy(&mut file, &mut outfile)?;
        }
    }

    // Remove ZIP file after extraction
    fs::remove_file(zip_path)?;

    Ok(root_name)
}

pub fn build_file_tree(root_path: &Path, base_name: &str) -> Result<FileNode, RepoError> {
    fn build_node(path: &Path, root: &Path) -> Option<FileNode> {
        let name = path.file_name()?.to_string_lossy().to_string();

        // Skip hidden files and common unneeded dirs
        if name.starts_with('.') || name == "node_modules" || name == "__pycache__" || name == "_meta" {
            return None;
        }

        let relative_path = path.strip_prefix(root).ok()?.to_string_lossy().to_string();

        if path.is_dir() {
            let mut children: Vec<FileNode> = fs::read_dir(path)
                .ok()?
                .filter_map(|e| e.ok())
                .filter_map(|e| build_node(&e.path(), root))
                .collect();

            // Sort: directories first, then by name
            children.sort_by(|a, b| {
                match (a.is_dir, b.is_dir) {
                    (true, false) => std::cmp::Ordering::Less,
                    (false, true) => std::cmp::Ordering::Greater,
                    _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
                }
            });

            Some(FileNode {
                name,
                path: relative_path,
                is_dir: true,
                size: None,
                children: Some(children),
            })
        } else {
            let size = fs::metadata(path).ok()?.len();
            Some(FileNode {
                name,
                path: relative_path,
                is_dir: false,
                size: Some(size),
                children: None,
            })
        }
    }

    build_node(root_path, root_path)
        .map(|mut node| {
            node.name = base_name.to_string();
            node.path = "".to_string();
            node
        })
        .ok_or_else(|| RepoError::IoError(io::Error::new(io::ErrorKind::NotFound, "Root not found")))
}

pub fn detect_language(file_path: &str) -> String {
    let ext = Path::new(file_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");

    match ext.to_lowercase().as_str() {
        "js" | "mjs" | "cjs" => "javascript",
        "jsx" => "javascript",
        "ts" | "mts" | "cts" => "typescript",
        "tsx" => "typescript",
        "py" | "pyw" => "python",
        "json" => "json",
        "md" | "markdown" => "markdown",
        "html" | "htm" => "html",
        "css" => "css",
        "scss" | "sass" => "scss",
        "yaml" | "yml" => "yaml",
        "toml" => "toml",
        "rs" => "rust",
        "go" => "go",
        "java" => "java",
        "c" | "h" => "c",
        "cpp" | "cc" | "cxx" | "hpp" => "cpp",
        "sh" | "bash" | "zsh" => "shell",
        "sql" => "sql",
        "xml" => "xml",
        "swift" => "swift",
        _ => "plaintext",
    }.to_string()
}

fn is_binary_extension(file_path: &Path) -> bool {
    let ext = file_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    matches!(
        ext.as_str(),
        // Images
        "png" | "jpg" | "jpeg" | "gif" | "bmp" | "ico" | "webp" | "svg" | "tiff" | "tif" |
        // Audio
        "mp3" | "wav" | "ogg" | "flac" | "aac" | "m4a" |
        // Video
        "mp4" | "avi" | "mov" | "mkv" | "webm" | "flv" |
        // Archives
        "zip" | "tar" | "gz" | "rar" | "7z" | "bz2" | "xz" |
        // Executables/Libraries
        "exe" | "dll" | "so" | "dylib" | "bin" | "o" | "a" |
        // Documents
        "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" |
        // Fonts
        "ttf" | "otf" | "woff" | "woff2" | "eot" |
        // Other binary
        "class" | "pyc" | "pyo" | "wasm" | "db" | "sqlite" | "sqlite3"
    )
}

fn contains_null_bytes(data: &[u8]) -> bool {
    // Check first 8KB for null bytes (common binary file indicator)
    let check_size = std::cmp::min(data.len(), 8192);
    data[..check_size].contains(&0)
}

pub fn read_file_content(file_path: &Path) -> Result<FileContent, RepoError> {
    let metadata = fs::metadata(file_path)?;
    let file_size = metadata.len();
    let language = detect_language(&file_path.to_string_lossy());

    // Check if it's a known binary extension
    if is_binary_extension(file_path) {
        return Ok(FileContent {
            content: String::new(),
            truncated: false,
            total_lines: None,
            language,
            is_binary: true,
        });
    }

    // Check file size
    if file_size > MAX_FILE_SIZE {
        // Read only first portion
        let mut file = File::open(file_path)?;
        let mut buffer = vec![0u8; (MAX_FILE_SIZE / 2) as usize];
        let bytes_read = file.read(&mut buffer)?;
        buffer.truncate(bytes_read);

        // Check for binary content
        if contains_null_bytes(&buffer) {
            return Ok(FileContent {
                content: String::new(),
                truncated: false,
                total_lines: None,
                language,
                is_binary: true,
            });
        }

        let content = String::from_utf8_lossy(&buffer);
        let lines: Vec<&str> = content.lines().take(PREVIEW_LINES).collect();

        return Ok(FileContent {
            content: lines.join("\n"),
            truncated: true,
            total_lines: None,
            language,
            is_binary: false,
        });
    }

    // Read file as bytes first to check for binary content
    let bytes = fs::read(file_path)?;

    if contains_null_bytes(&bytes) {
        return Ok(FileContent {
            content: String::new(),
            truncated: false,
            total_lines: None,
            language,
            is_binary: true,
        });
    }

    let content = String::from_utf8_lossy(&bytes).into_owned();
    let line_count = content.lines().count();

    if line_count > MAX_LINES {
        let lines: Vec<&str> = content.lines().take(PREVIEW_LINES).collect();
        Ok(FileContent {
            content: lines.join("\n"),
            truncated: true,
            total_lines: Some(line_count),
            language,
            is_binary: false,
        })
    } else {
        Ok(FileContent {
            content,
            truncated: false,
            total_lines: Some(line_count),
            language,
            is_binary: false,
        })
    }
}

pub fn get_repos_dir() -> PathBuf {
    directories::ProjectDirs::from("com", "xnu", "RepoRead")
        .map(|dirs| dirs.data_dir().to_path_buf())
        .unwrap_or_else(|| PathBuf::from("./repos"))
        .join("repos")
}

pub fn generate_repo_key(owner: &str, repo: &str) -> String {
    format!("{}_{}", owner, repo)
}

pub fn save_repo_info(repo_dir: &Path, info: &RepoInfo) -> Result<(), RepoError> {
    let meta_dir = repo_dir.join("_meta");
    fs::create_dir_all(&meta_dir)?;

    let info_path = meta_dir.join("info.json");
    let json = serde_json::to_string_pretty(info)?;
    fs::write(info_path, json)?;

    Ok(())
}

pub fn save_tree(repo_dir: &Path, tree: &FileNode) -> Result<(), RepoError> {
    let meta_dir = repo_dir.join("_meta");
    fs::create_dir_all(&meta_dir)?;

    let tree_path = meta_dir.join("tree.json");
    let json = serde_json::to_string_pretty(tree)?;
    fs::write(tree_path, json)?;

    Ok(())
}

pub fn load_repo_info(repo_dir: &Path) -> Result<RepoInfo, RepoError> {
    let info_path = repo_dir.join("_meta").join("info.json");
    let json = fs::read_to_string(&info_path)?;
    let info: RepoInfo = serde_json::from_str(&json)?;
    Ok(info)
}

pub fn load_tree(repo_dir: &Path) -> Result<FileNode, RepoError> {
    let tree_path = repo_dir.join("_meta").join("tree.json");
    let json = fs::read_to_string(&tree_path)?;
    let tree: FileNode = serde_json::from_str(&json)?;
    Ok(tree)
}

pub fn list_repos() -> Result<Vec<RepoInfo>, RepoError> {
    let repos_dir = get_repos_dir();

    if !repos_dir.exists() {
        return Ok(vec![]);
    }

    let mut repos = vec![];

    for entry in fs::read_dir(&repos_dir)? {
        let entry = entry?;
        let path = entry.path();

        if path.is_dir() {
            if let Ok(info) = load_repo_info(&path) {
                repos.push(info);
            }
        }
    }

    // Sort by imported_at descending
    repos.sort_by(|a, b| b.imported_at.cmp(&a.imported_at));

    Ok(repos)
}

pub fn delete_repo(repo_key: &str) -> Result<(), RepoError> {
    let repo_dir = get_repos_dir().join(repo_key);

    if !repo_dir.exists() {
        return Err(RepoError::RepoNotFound(repo_key.to_string()));
    }

    fs::remove_dir_all(&repo_dir)?;
    Ok(())
}

pub fn get_screenshots_dir() -> PathBuf {
    directories::ProjectDirs::from("com", "xnu", "RepoRead")
        .map(|dirs| dirs.data_dir().to_path_buf())
        .unwrap_or_else(|| PathBuf::from("./data"))
        .join("screenshots")
}

pub fn save_screenshot(base64_data: &str, filename: &str, copy_to_clipboard: bool) -> Result<String, RepoError> {
    use base64::Engine;
    use arboard::{Clipboard, ImageData};

    let screenshots_dir = get_screenshots_dir();
    fs::create_dir_all(&screenshots_dir)?;

    // Remove data URL prefix if present
    let data = base64_data
        .strip_prefix("data:image/png;base64,")
        .unwrap_or(base64_data);

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data)
        .map_err(|e| RepoError::InvalidUrl(format!("Invalid base64 data: {}", e)))?;

    // Save to file
    let file_path = screenshots_dir.join(filename);
    fs::write(&file_path, &bytes)?;

    // Copy to clipboard if enabled
    if copy_to_clipboard {
        if let Ok(img) = image::load_from_memory(&bytes) {
            let rgba = img.to_rgba8();
            let (width, height) = rgba.dimensions();
            let image_data = ImageData {
                width: width as usize,
                height: height as usize,
                bytes: rgba.into_raw().into(),
            };
            if let Ok(mut clipboard) = Clipboard::new() {
                let _ = clipboard.set_image(image_data);
            }
        }
    }

    Ok(file_path.to_string_lossy().to_string())
}

#[derive(Debug, Serialize, Deserialize)]
struct OpenRouterMessage {
    role: String,
    content: String,
}

#[derive(Debug, Serialize)]
struct OpenRouterRequest {
    model: String,
    messages: Vec<OpenRouterMessage>,
}

#[derive(Debug, Deserialize)]
struct OpenRouterChoice {
    message: OpenRouterMessage,
}

#[derive(Debug, Deserialize)]
struct OpenRouterResponse {
    choices: Vec<OpenRouterChoice>,
}

pub async fn interpret_code(
    api_key: &str,
    prompt_template: &str,
    code: &str,
    language: &str,
    project: &str,
    model: &str,
) -> Result<String, RepoError> {
    let prompt = prompt_template
        .replace("{language}", language)
        .replace("{project}", project)
        .replace("{code}", code);

    let request = OpenRouterRequest {
        model: model.to_string(),
        messages: vec![OpenRouterMessage {
            role: "user".to_string(),
            content: prompt,
        }],
    };

    let client = reqwest::Client::new();
    let response = client
        .post("https://openrouter.ai/api/v1/chat/completions")
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("HTTP-Referer", "https://github.com/anthropics/claude-code")
        .json(&request)
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(RepoError::InvalidUrl(format!(
            "OpenRouter API error: HTTP {} - {}",
            status, body
        )));
    }

    let result: OpenRouterResponse = response.json().await?;
    let text = result
        .choices
        .into_iter()
        .map(|c| c.message.content)
        .collect::<Vec<_>>()
        .join("");

    Ok(text)
}
