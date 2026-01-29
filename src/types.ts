export interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  size?: number;
  children?: FileNode[];
}

export interface RepoInfo {
  key: string;
  owner: string;
  repo: string;
  branch: string;
  imported_at: string;
  url: string;
}

export interface ImportResult {
  repo_key: string;
  info: RepoInfo;
  tree: FileNode;
}

export interface FileContent {
  content: string;
  truncated: boolean;
  total_lines?: number;
  language: string;
  is_binary: boolean;
}

export interface SearchResultItem {
  full_name: string;
  description: string | null;
  stargazers_count: number;
  html_url: string;
  owner: string;
  repo: string;
}

export interface AppSettings {
  github_token: string | null;
  copy_screenshot_to_clipboard: boolean;
  openrouter_api_key: string | null;
  interpret_prompt: string;
  interpret_model: string;
}

export interface TrendingRepo {
  full_name: string;
  description: string | null;
  stars?: number | null;
  forks?: number | null;
  language?: string | null;
  stars_today?: number | null;
  url: string;
  owner: string;
  repo: string;
}

export interface FavoriteRepo {
  owner: string;
  repo: string;
  url: string;
  description: string | null;
  language: string | null;
  stars: number | null;
  added_at: string;
}

export interface FileHistoryEntry {
  path: string;
  opened_at: string;
}

export interface RepoFileHistory {
  repo_url: string;
  entries: FileHistoryEntry[];
}

export interface CreateGistResult {
  url: string;
  html_url: string;
  id: string;
}
