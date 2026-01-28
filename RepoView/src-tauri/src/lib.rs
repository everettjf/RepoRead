mod repo;

use repo::{
    build_file_tree, delete_repo as delete_repo_impl, detect_language, download_repo_zip,
    extract_zip, generate_repo_key, get_default_branch, get_repos_dir, list_repos as list_repos_impl,
    load_repo_info, load_tree, parse_github_url, read_file_content, save_repo_info, save_tree,
    FileContent, FileNode, ImportResult, RepoError, RepoInfo,
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
    let info = RepoInfo {
        key: repo_key.clone(),
        owner: parsed.owner,
        repo: parsed.repo,
        branch,
        imported_at: chrono::Utc::now().to_rfc3339(),
        url,
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            import_repo_from_github,
            read_text_file,
            list_recent_repos,
            get_repo_tree,
            get_repo_info,
            delete_repo,
            get_file_language,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
