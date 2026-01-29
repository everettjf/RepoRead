import { invoke } from "@tauri-apps/api/core";
import type {
  FileNode,
  RepoInfo,
  ImportResult,
  FileContent,
  SearchResultItem,
  AppSettings,
  TrendingRepo,
  FavoriteRepo,
} from "./types";

export async function importRepoFromGithub(url: string): Promise<ImportResult> {
  return invoke<ImportResult>("import_repo_from_github", { url });
}

export async function readTextFile(repoKey: string, filePath: string): Promise<FileContent> {
  return invoke<FileContent>("read_text_file", { repoKey, filePath });
}

export async function listRecentRepos(): Promise<RepoInfo[]> {
  return invoke<RepoInfo[]>("list_recent_repos");
}

export async function getRepoTree(repoKey: string): Promise<FileNode> {
  return invoke<FileNode>("get_repo_tree", { repoKey });
}

export async function getRepoInfo(repoKey: string): Promise<RepoInfo> {
  return invoke<RepoInfo>("get_repo_info", { repoKey });
}

export async function deleteRepo(repoKey: string): Promise<void> {
  return invoke<void>("delete_repo", { repoKey });
}

export async function getFileLanguage(filePath: string): Promise<string> {
  return invoke<string>("get_file_language", { filePath });
}

export async function searchGithubRepos(query: string, token?: string | null): Promise<SearchResultItem[]> {
  return invoke<SearchResultItem[]>("search_github_repos", { query, token });
}

export async function getSettings(): Promise<AppSettings> {
  return invoke<AppSettings>("get_settings");
}

export async function updateSettings(settings: AppSettings): Promise<void> {
  return invoke<void>("update_settings", { settings });
}

export async function getRepoPath(repoKey: string): Promise<string> {
  return invoke<string>("get_repo_path", { repoKey });
}

export async function getTrendingRepos(
  language: string | null,
  since: string,
  spokenLanguage: string | null
): Promise<TrendingRepo[]> {
  return invoke<TrendingRepo[]>("get_trending_repos", {
    language,
    since,
    spokenLanguage,
  });
}

export async function getFavorites(): Promise<FavoriteRepo[]> {
  return invoke<FavoriteRepo[]>("get_favorites");
}

export async function saveFavorites(favorites: FavoriteRepo[]): Promise<void> {
  return invoke<void>("save_favorites", { favorites });
}

export async function exportFavorites(format: "json" | "markdown", path: string): Promise<void> {
  return invoke<void>("export_favorites", { format, path });
}

export async function saveScreenshot(base64Data: string, filename: string, copyToClipboard: boolean): Promise<string> {
  return invoke<string>("save_screenshot", { base64Data, filename, copyToClipboard });
}

export async function getScreenshotsPath(): Promise<string> {
  return invoke<string>("get_screenshots_path");
}

export async function openScreenshotsFolder(): Promise<void> {
  return invoke<void>("open_screenshots_folder");
}
