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
