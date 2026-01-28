import { useState, useEffect, useCallback } from "react";
import { FileTree } from "./components/FileTree";
import { CodeViewer } from "./components/CodeViewer";
import { RepoList } from "./components/RepoList";
import { UrlInput } from "./components/UrlInput";
import {
  importRepoFromGithub,
  readTextFile,
  listRecentRepos,
  getRepoTree,
  deleteRepo,
} from "./api";
import type { FileNode, RepoInfo, FileContent } from "./types";
import "./App.css";

type View = "home" | "repo";

function App() {
  const [view, setView] = useState<View>("home");
  const [recentRepos, setRecentRepos] = useState<RepoInfo[]>([]);
  const [currentRepo, setCurrentRepo] = useState<RepoInfo | null>(null);
  const [tree, setTree] = useState<FileNode | null>(null);
  const [selectedPath, setSelectedPath] = useState<string>("");
  const [fileContent, setFileContent] = useState<FileContent | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [error, setError] = useState<string>("");

  // Load recent repos on mount
  useEffect(() => {
    loadRecentRepos();
  }, []);

  const loadRecentRepos = async () => {
    try {
      const repos = await listRecentRepos();
      setRecentRepos(repos);
    } catch (err) {
      console.error("Failed to load recent repos:", err);
    }
  };

  const handleImport = async (url: string) => {
    setIsImporting(true);
    setError("");

    try {
      const result = await importRepoFromGithub(url);
      setCurrentRepo(result.info);
      setTree(result.tree);
      setView("repo");
      setSelectedPath("");
      setFileContent(null);
      await loadRecentRepos();
    } catch (err) {
      setError(String(err));
    } finally {
      setIsImporting(false);
    }
  };

  const handleRepoSelect = async (repo: RepoInfo) => {
    try {
      const repoTree = await getRepoTree(repo.key);
      setCurrentRepo(repo);
      setTree(repoTree);
      setView("repo");
      setSelectedPath("");
      setFileContent(null);
    } catch (err) {
      setError(String(err));
    }
  };

  const handleRepoDelete = async (repoKey: string) => {
    if (!confirm("Delete this repository?")) return;

    try {
      await deleteRepo(repoKey);
      await loadRecentRepos();

      if (currentRepo?.key === repoKey) {
        setView("home");
        setCurrentRepo(null);
        setTree(null);
        setFileContent(null);
      }
    } catch (err) {
      setError(String(err));
    }
  };

  const handleFileSelect = useCallback(
    async (path: string) => {
      if (!currentRepo || !path) return;

      setSelectedPath(path);
      setIsLoadingFile(true);

      try {
        const content = await readTextFile(currentRepo.key, path);
        setFileContent(content);
      } catch (err) {
        setError(String(err));
        setFileContent(null);
      } finally {
        setIsLoadingFile(false);
      }
    },
    [currentRepo]
  );

  const handleBack = () => {
    setView("home");
    setCurrentRepo(null);
    setTree(null);
    setFileContent(null);
    setSelectedPath("");
    setError("");
  };

  if (view === "home") {
    return (
      <div className="app home-view">
        <header className="app-header">
          <h1>RepoView</h1>
          <p className="tagline">Read GitHub repositories. No clone. No setup. Just code.</p>
        </header>

        <main className="home-content">
          <UrlInput onSubmit={handleImport} isLoading={isImporting} error={error} />
          <RepoList
            repos={recentRepos}
            onSelect={handleRepoSelect}
            onDelete={handleRepoDelete}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="app repo-view">
      <header className="repo-header">
        <button className="back-button" onClick={handleBack}>
          ← Back
        </button>
        <div className="repo-title">
          <span className="repo-name">
            {currentRepo?.owner}/{currentRepo?.repo}
          </span>
          <span className="repo-branch">{currentRepo?.branch}</span>
        </div>
      </header>

      <div className="repo-content">
        <aside className="sidebar">
          {tree && (
            <FileTree
              tree={tree}
              onFileSelect={handleFileSelect}
              selectedPath={selectedPath}
            />
          )}
        </aside>

        <main className="main-content">
          <CodeViewer
            content={fileContent}
            filePath={selectedPath}
            isLoading={isLoadingFile}
          />
        </main>
      </div>
    </div>
  );
}

export default App;
