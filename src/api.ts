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
  FileHistoryEntry,
  CreateGistResult,
  ChatSession,
  ChatSessionSummary,
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

export async function interpretCode(
  apiKey: string,
  promptTemplate: string,
  code: string,
  language: string,
  project: string,
  model: string
): Promise<string> {
  return invoke<string>("interpret_code", {
    apiKey,
    promptTemplate,
    code,
    language,
    project,
    model,
  });
}

export async function getFileHistory(repoUrl: string): Promise<FileHistoryEntry[]> {
  return invoke<FileHistoryEntry[]>("get_file_history", { repoUrl });
}

export async function addFileHistory(repoUrl: string, filePath: string): Promise<void> {
  return invoke<void>("add_file_history", { repoUrl, filePath });
}

export async function createGist(
  token: string,
  filename: string,
  content: string,
  description: string,
  isPublic: boolean
): Promise<CreateGistResult> {
  return invoke<CreateGistResult>("create_gist", {
    token,
    filename,
    content,
    description,
    public: isPublic,
  });
}

export async function getChatSessions(repoUrl: string): Promise<ChatSessionSummary[]> {
  return invoke<ChatSessionSummary[]>("get_chat_sessions", { repoUrl });
}

export async function getChatSession(repoUrl: string, sessionId: string): Promise<ChatSession | null> {
  return invoke<ChatSession | null>("get_chat_session", { repoUrl, sessionId });
}

export async function saveChatSession(repoUrl: string, session: ChatSession): Promise<void> {
  return invoke<void>("save_chat_session", { repoUrl, session });
}

export async function deleteChatSession(repoUrl: string, sessionId: string): Promise<void> {
  return invoke<void>("delete_chat_session", { repoUrl, sessionId });
}

export async function updateRepoLastOpened(repoKey: string): Promise<void> {
  return invoke<void>("update_repo_last_opened", { repoKey });
}
