mod repo;

use repo::{
    build_file_tree, delete_repo as delete_repo_impl, detect_language, download_repo_zip,
    extract_zip, generate_repo_key, get_default_branch, get_repos_dir, list_repos as list_repos_impl,
    load_repo_info, load_tree, parse_github_url, read_file_content, save_repo_info, save_tree,
    search_github_repos as search_repos_impl, fetch_trending_repos as fetch_trending_repos_impl,
    load_settings as load_settings_impl, save_settings as save_settings_impl,
    load_favorites as load_favorites_impl, save_favorites as save_favorites_impl,
    export_favorites as export_favorites_impl,
    get_screenshots_dir as get_screenshots_dir_impl, save_screenshot as save_screenshot_impl,
    interpret_code as interpret_code_impl,
    get_file_history as get_file_history_impl, add_file_history as add_file_history_impl,
    create_gist as create_gist_impl,
    get_chat_sessions as get_chat_sessions_impl, get_chat_session as get_chat_session_impl,
    save_chat_session as save_chat_session_impl, delete_chat_session as delete_chat_session_impl,
    update_repo_last_opened as update_repo_last_opened_impl,
    FileContent, FileNode, ImportResult, RepoError, RepoInfo, SearchResultItem, AppSettings,
    TrendingRepo, FavoriteRepo, FileHistoryEntry, CreateGistResult, ChatSession, ChatSessionSummary,
};

#[tauri::command]
async fn import_repo_from_github(url: String) -> Result<ImportResult, RepoError> {
    let parsed = parse_github_url(&url)?;

    // Get branch (from URL or API)
    let branch = match parsed.branch {
        Some(b) => b,
        None => get_default_branch(&parsed.owner, &parsed.repo).await?,
    };

    let repo_key = generate_repo_key(&parsed.owner, &parsed.repo);
    let repos_dir = get_repos_dir();
    let repo_dir = repos_dir.join(&repo_key);
    let zip_path = repos_dir.join(format!("{}.zip", repo_key));

    // Download ZIP
    download_repo_zip(&parsed.owner, &parsed.repo, &branch, &zip_path).await?;

    // Extract ZIP
    extract_zip(&zip_path, &repo_dir)?;

    // Build file tree
    let tree = build_file_tree(&repo_dir, &parsed.repo)?;

    // Create repo info
    let now = chrono::Utc::now().to_rfc3339();
    let info = RepoInfo {
        key: repo_key.clone(),
        owner: parsed.owner,
        repo: parsed.repo,
        branch,
        imported_at: now.clone(),
        url,
        last_opened_at: Some(now),
    };

    // Save metadata
    save_repo_info(&repo_dir, &info)?;
    save_tree(&repo_dir, &tree)?;

    Ok(ImportResult {
        repo_key,
        info,
        tree,
    })
}

#[tauri::command]
async fn read_text_file(repo_key: String, file_path: String) -> Result<FileContent, RepoError> {
    let repo_dir = get_repos_dir().join(&repo_key);
    let full_path = repo_dir.join(&file_path);

    read_file_content(&full_path)
}

#[tauri::command]
async fn list_recent_repos() -> Result<Vec<RepoInfo>, RepoError> {
    list_repos_impl()
}

#[tauri::command]
async fn get_repo_tree(repo_key: String) -> Result<FileNode, RepoError> {
    let repo_dir = get_repos_dir().join(&repo_key);
    load_tree(&repo_dir)
}

#[tauri::command]
async fn get_repo_info(repo_key: String) -> Result<RepoInfo, RepoError> {
    let repo_dir = get_repos_dir().join(&repo_key);
    load_repo_info(&repo_dir)
}

#[tauri::command]
async fn delete_repo(repo_key: String) -> Result<(), RepoError> {
    delete_repo_impl(&repo_key)
}

#[tauri::command]
fn get_file_language(file_path: String) -> String {
    detect_language(&file_path)
}

#[tauri::command]
fn get_repo_path(repo_key: String) -> String {
    get_repos_dir().join(&repo_key).to_string_lossy().to_string()
}

#[tauri::command]
async fn search_github_repos(query: String, token: Option<String>) -> Result<Vec<SearchResultItem>, RepoError> {
    search_repos_impl(&query, token.as_deref()).await
}

#[tauri::command]
async fn get_trending_repos(
    language: Option<String>,
    since: String,
    spoken_language: Option<String>,
) -> Result<Vec<TrendingRepo>, RepoError> {
    fetch_trending_repos_impl(language.as_deref(), &since, spoken_language.as_deref()).await
}

#[tauri::command]
fn get_settings() -> AppSettings {
    load_settings_impl()
}

#[tauri::command]
fn update_settings(settings: AppSettings) -> Result<(), RepoError> {
    save_settings_impl(&settings)
}

#[tauri::command]
fn get_favorites() -> Vec<FavoriteRepo> {
    load_favorites_impl()
}

#[tauri::command]
fn save_favorites(favorites: Vec<FavoriteRepo>) -> Result<(), RepoError> {
    save_favorites_impl(&favorites)
}

#[tauri::command]
fn export_favorites(format: String, path: String) -> Result<(), RepoError> {
    export_favorites_impl(std::path::Path::new(&path), &format)
}

#[tauri::command]
fn save_screenshot(base64_data: String, filename: String, copy_to_clipboard: bool) -> Result<String, RepoError> {
    save_screenshot_impl(&base64_data, &filename, copy_to_clipboard)
}

#[tauri::command]
fn get_screenshots_path() -> String {
    get_screenshots_dir_impl().to_string_lossy().to_string()
}

#[tauri::command]
fn open_screenshots_folder() -> Result<(), RepoError> {
    let path = get_screenshots_dir_impl();
    std::fs::create_dir_all(&path)?;
    opener::open(&path).map_err(|e| RepoError::IoError(std::io::Error::new(
        std::io::ErrorKind::Other,
        e.to_string()
    )))
}

#[tauri::command]
async fn interpret_code(
    api_key: String,
    prompt_template: String,
    code: String,
    language: String,
    project: String,
    model: String,
) -> Result<String, RepoError> {
    interpret_code_impl(&api_key, &prompt_template, &code, &language, &project, &model).await
}

#[tauri::command]
fn get_file_history(repo_url: String) -> Vec<FileHistoryEntry> {
    get_file_history_impl(&repo_url)
}

#[tauri::command]
fn add_file_history(repo_url: String, file_path: String) -> Result<(), RepoError> {
    add_file_history_impl(&repo_url, &file_path)
}

#[tauri::command]
async fn create_gist(
    token: String,
    filename: String,
    content: String,
    description: String,
    public: bool,
) -> Result<CreateGistResult, RepoError> {
    create_gist_impl(&token, &filename, &content, &description, public).await
}

#[tauri::command]
fn get_chat_sessions(repo_url: String) -> Vec<ChatSessionSummary> {
    get_chat_sessions_impl(&repo_url)
}

#[tauri::command]
fn get_chat_session(repo_url: String, session_id: String) -> Option<ChatSession> {
    get_chat_session_impl(&repo_url, &session_id)
}

#[tauri::command]
fn save_chat_session(repo_url: String, session: ChatSession) -> Result<(), RepoError> {
    save_chat_session_impl(&repo_url, session)
}

#[tauri::command]
fn delete_chat_session(repo_url: String, session_id: String) -> Result<(), RepoError> {
    delete_chat_session_impl(&repo_url, &session_id)
}

#[tauri::command]
fn update_repo_last_opened(repo_key: String) -> Result<(), RepoError> {
    update_repo_last_opened_impl(&repo_key)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            import_repo_from_github,
            read_text_file,
            list_recent_repos,
            get_repo_tree,
            get_repo_info,
            delete_repo,
            get_file_language,
            search_github_repos,
            get_trending_repos,
            get_settings,
            update_settings,
            get_repo_path,
            get_favorites,
            save_favorites,
            export_favorites,
            save_screenshot,
            get_screenshots_path,
            open_screenshots_folder,
            interpret_code,
            get_file_history,
            add_file_history,
            create_gist,
            get_chat_sessions,
            get_chat_session,
            save_chat_session,
            delete_chat_session,
            update_repo_last_opened,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
