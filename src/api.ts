import { invoke } from "@tauri-apps/api/core";
import type { FileNode, RepoInfo, ImportResult, FileContent, SearchResultItem } from "./types";

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

export async function searchGithubRepos(query: string): Promise<SearchResultItem[]> {
  return invoke<SearchResultItem[]>("search_github_repos", { query });
}
